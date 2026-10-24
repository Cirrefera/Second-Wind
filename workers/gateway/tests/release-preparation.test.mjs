import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRelease,publishRelease,releasePayloadKey} from '../src/release-preparation.js';
import {canonicalJson,sha256} from '../src/contracts.js';
import {createFixtureDb,insertItem,rowCount} from './helpers/d1.mjs';
import {fixtureEnv,createRail,makePayment} from './helpers/fixtures.mjs';
import {purchase} from "./helpers/purchase.mjs";
import {createQuote,recoverGrant,deliverGrant} from '../src/commerce.js';
import {readFile} from 'node:fs/promises';

// Synthetic trusted-operator reviews exist only inside these isolated fixtures.
// They do not approve the actual repository inventory or commercial allocations.
async function candidate({sku='LOCAL-GUIDE',version=1,guidance='Exact reviewed fixture guidance.\n',...patch}={}) {
  const hash=await sha256(guidance);
  const item={sku,version,slug:'local-guide',name:'Local guide',kind:'guide',service:'lambda',summary:'Offline fixture',guidance,
    price_usd:0.25,invoke_kind:'resolve',mime_type:'text/markdown',license_spdx:'Apache-2.0',provenance:'synthetic offline fixture',...patch};
  const manifest={schema_version:'1',sku,slug:item.slug,version,product_kind:'guidance-product',service:'lambda',release_ref:`sha256:${hash}`,
    content_hash:hash,hash_scope:'guidance-utf8',mime_type:'text/markdown',delivery_contract:{type:'guidance'},validation_contract:{type:'reviewed'},
    origin:'local fixture',license:'Apache-2.0',original_contribution:'Synthetic local procedure.',language_policy:{mode:'not-applicable'},tags:['recovery'],supported_boundary:'Offline fixture procedure'};
  const routing_manifest={schema_version:'1',product_id:sku,sku,slug:item.slug,version,release_ref:manifest.release_ref,service:'lambda',product_kind:manifest.product_kind,
    route_summary:item.summary,supported_boundary:manifest.supported_boundary,language_policy:'not-applicable',aliases:[],tags:['recovery'],taxonomy_ids:[],problem_family_ids:[],operations:[],environments:[],desired_outcomes:[],input_kinds:[],failure_signatures:[],languages:[],runtimes:[],required_evidence:[],exclusions:[]};
  return {schema_version:'1',item,manifest,routing_manifest,payload:{content:guidance,sha256:hash,size_bytes:new TextEncoder().encode(guidance).length,mime_type:'text/markdown'}};
}
async function syntheticReviews(input) {
  const subject_hash=await sha256(canonicalJson(input.manifest));
  return ['service','contract','product','license','purchase-url','validation','guidance-quality','language-adapters','sandbox-trial'].map(kind=>({kind,subject_hash,reviewed_by:'offline-fixture-reviewer',reference:`fixture:${kind}`}))
    .concat({kind:'routing',subject_hash:await sha256(canonicalJson(input.routing_manifest)),reviewed_by:'offline-fixture-reviewer',reference:'fixture:routing'});
}
async function unpricedCandidate() {
  const input=await candidate({sku:'LOCAL-ARTIFACT',kind:'artifact',guidance:''});
  const content='export const value = 1;\n';
  const file={path:'index.js',content,sha256:await sha256(content),size_bytes:new TextEncoder().encode(content).length,mime_type:'text/javascript'};
  const payload=canonicalJson({schema_version:'1',sku:input.item.sku,version:1,files:[file]});
  input.files=[file];
  input.payload={content:payload,sha256:await sha256(payload),size_bytes:new TextEncoder().encode(payload).length,mime_type:'application/json'};
  Object.assign(input.manifest,{product_kind:'artifact-product',content_hash:input.payload.sha256,hash_scope:'file-package-json-utf8',mime_type:'application/json',
    release_ref:'sha256:'+input.payload.sha256,required_files:[{path:file.path,sha256:file.sha256,size_bytes:file.size_bytes}],delivery_contract:{kind:'file-package'},
    trial_adapter:'javascript-isolate',components:[{id:'core',name:'Core',requires:[],files:[file]}]});
  Object.assign(input.routing_manifest,{product_kind:'artifact-product',release_ref:input.manifest.release_ref});
  return input;
}

test('preparation reads actual inline bytes and never creates reviews or mutates stores',async()=>{
  const db=createFixtureDb(),env=fixtureEnv(db),input=await candidate();
  const report=await prepareRelease(env,input);
  assert.equal(report.source_ready,true);
  assert.equal(report.payload.stored_verified,false);
  assert.equal(report.publication.eligibility,'blocked');
  for(const blocker of ['license_or_origin_unverified','product_contribution_unreviewed','guidance_quality_unreviewed','routing_review_missing']) assert.ok(report.publication.blockers.includes(blocker));
  assert.equal(rowCount(db,'items'),0);assert.equal(env.PAYLOADS.writes.length,0);
  input.evidence={license_verified:true,service_verified:true};
  assert.equal((await prepareRelease(env,input)).publication.eligibility,'blocked');
  input.payload.content+='tampered';
  assert.ok((await prepareRelease(env,input,{reviews:await syntheticReviews(input)})).source_blockers.includes('payload_bytes_mismatch'));
  input.manifest.input_schema={type:'object'};input.item.input_schema='{"type":"array"}';
  assert.ok((await prepareRelease(env,input)).source_blockers.includes('catalog_input_schema_mismatch'));
  db.close();
});

test('stage persists exact R2 bytes and immutable contracts while activation is explicit',async()=>{
  const db=createFixtureDb(),env=fixtureEnv(db),input=await candidate(),reviews=await syntheticReviews(input);
  await assert.rejects(publishRelease(env,input,{reviews}),error=>error.code==='explicit_release_mode_required');
  await assert.rejects(publishRelease(env,input,{mode:'stage'}),error=>error.code==='routing_review_missing');
  const result=await publishRelease(env,input,{mode:'stage',reviews});
  assert.equal(result.status,'staged');assert.equal(result.payload.stored_verified,true);
  assert.equal(db.sqlite.prepare('SELECT status FROM items').get().status,'draft');
  assert.equal(rowCount(db,'component_releases'),1);assert.equal(rowCount(db,'product_routing_manifests'),1);assert.equal(rowCount(db,'payload_objects'),1);
  assert.equal(await (await env.PAYLOADS.get(result.payload.r2_key)).text(),input.item.guidance);
  assert.equal(result.input_object.stored_verified,true);
  assert.equal(await (await env.PAYLOADS.get(result.input_object.r2_key)).text(),canonicalJson(input));
  assert.equal(result.review_objects.length,reviews.length);
  for(const record of result.review_objects) assert.equal(await sha256(await (await env.PAYLOADS.get(record.r2_key)).text()),record.content_hash);
  const active=await publishRelease(env,input,{mode:'activate',reviews});
  assert.equal(active.status,'active');assert.equal(db.sqlite.prepare('SELECT status FROM items').get().status,'live');
  const writes=env.PAYLOADS.writes.length;
  await publishRelease(env,input,{mode:'activate',reviews});
  assert.equal(env.PAYLOADS.writes.length,writes);assert.equal(rowCount(db,'component_releases'),1);
  db.close();
});

test('unpriced real-file releases can be staged for trials but never activated as priced products',async()=>{
  const db=createFixtureDb(),env=fixtureEnv(db),input=await unpricedCandidate(),reviews=await syntheticReviews(input);
  const prepared=await prepareRelease(env,input,{reviews});
  assert.equal(prepared.source_ready,true);assert.ok(prepared.publication.blockers.includes('commercial_component_allocation_missing'));
  await publishRelease(env,input,{mode:'stage',reviews});
  const release=JSON.parse(db.sqlite.prepare('SELECT manifest_json FROM component_releases').get().manifest_json);
  assert.equal(release.components[0].share_bps,undefined);assert.equal(release.pricing,undefined);
  await assert.rejects(publishRelease(env,input,{mode:'activate',reviews}),error=>error.code==='release_publication_blocked'&&error.details.report.publication.blockers.includes('commercial_component_allocation_missing'));
  assert.equal(db.sqlite.prepare('SELECT status FROM items').get().status,'draft');
  input.payload.content=canonicalJson({schema_version:'1',sku:input.item.sku,version:1,files:[]});
  input.payload.sha256=await sha256(input.payload.content);input.payload.size_bytes=new TextEncoder().encode(input.payload.content).length;input.manifest.content_hash=input.payload.sha256;
  assert.ok((await prepareRelease({},input)).source_blockers.includes('delivered_file_package_mismatch'));
  db.close();
});

test('changed source, contract, price and legacy live versions cannot overwrite staged identities',async()=>{
  const db=createFixtureDb(),env=fixtureEnv(db),input=await candidate(),reviews=await syntheticReviews(input);
  await publishRelease(env,input,{mode:'stage',reviews});
  const altered=structuredClone(input);altered.manifest.original_contribution='Changed contract';
  await assert.rejects(publishRelease(env,altered,{mode:'stage',reviews:await syntheticReviews(altered)}),error=>error.code==='immutable_component_release_conflict');
  const changed=await candidate({guidance:'Replacement bytes\n'});
  await assert.rejects(publishRelease(env,changed,{mode:'stage',reviews:await syntheticReviews(changed)}),error=>error.code==='immutable_payload_conflict');
  const repriced=structuredClone(input);repriced.item.price_usd=1;
  await assert.rejects(publishRelease(env,repriced,{mode:'stage',reviews}),error=>error.code==='release_price_change_not_authorized');
  const legacy=await candidate({sku:'LEGACY',slug:'legacy-guide'});insertItem(db,{...legacy.item,status:'live'});
  await assert.rejects(publishRelease(env,legacy,{mode:'stage',reviews:await syntheticReviews(legacy)}),error=>error.code==='new_release_version_required');
  assert.equal(rowCount(db,'payload_objects'),1);db.close();
});

test('new versions retain prior payloads/contracts and staging leaves the current live item intact',async()=>{
  const db=createFixtureDb(),env=fixtureEnv(db),first=await candidate();
  await publishRelease(env,first,{mode:'activate',reviews:await syntheticReviews(first)});
  const quote=await createQuote(env,first.item.sku,{}),{rail,calls}=createRail();
  const bought=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:makePayment(quote),requestData:{}},{rail});
  const previous=db.sqlite.prepare('SELECT * FROM payload_objects').get();
  const second=await candidate({version:2,guidance:'Version two exact bytes\n'}),reviews=await syntheticReviews(second);
  await publishRelease(env,second,{mode:'stage',reviews});
  assert.equal(db.sqlite.prepare('SELECT version FROM items').get().version,1);
  await publishRelease(env,second,{mode:'activate',reviews});
  assert.equal(db.sqlite.prepare('SELECT version FROM items').get().version,2);
  assert.equal(rowCount(db,'payload_objects'),2);assert.equal(rowCount(db,'component_releases'),2);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM payload_objects WHERE version=1').get(),previous);
  assert.equal(await (await env.PAYLOADS.get(previous.r2_key)).text(),first.item.guidance);
  const recovered=await recoverGrant(env,bought.body.paymentId,bought.body.recoveryToken);
  const delivery=await deliverGrant(env,recovered);
  assert.equal(Buffer.from(delivery.artifact.data,'base64').toString('utf8'),first.item.guidance);
  assert.equal(calls.settle.length,1,'old bought release redelivery uses its immutable grant');
  await assert.rejects(publishRelease(env,first,{mode:'activate',reviews:await syntheticReviews(first)}),error=>error.code==='release_version_regression');
  db.close();
});

test('R2 failure or an atomic D1 conflict cannot partially publish a release',async()=>{
  const db=createFixtureDb(),env=fixtureEnv(db),input=await candidate(),reviews=await syntheticReviews(input);
  const key=releasePayloadKey(input.item.sku,input.item.version,input.payload.sha256);
  env.PAYLOADS.failedWrites.add(key);
  await assert.rejects(publishRelease(env,input,{mode:'activate',reviews}));
  for(const table of ['items','payload_objects','component_releases','product_routing_manifests']) assert.equal(rowCount(db,table),0);
  env.PAYLOADS.failedWrites.clear();
  const batch=db.batch.bind(db);
  db.batch=async statements=>{insertItem(db,{...input.item,status:'draft',summary:'Concurrent operator change'});return batch(statements);};
  await assert.rejects(publishRelease(env,input,{mode:'activate',reviews}),error=>error.code==='release_write_conflict');
  assert.equal(db.sqlite.prepare('SELECT status FROM items').get().status,'draft');
  for(const table of ['payload_objects','component_releases','product_routing_manifests']) assert.equal(rowCount(db,table),0);
  db.close();
});

test('stored-byte corruption and stale trusted reviews fail closed before D1 writes',async()=>{
  const db=createFixtureDb(),env=fixtureEnv(db),input=await candidate(),reviews=await syntheticReviews(input);
  const key=releasePayloadKey(input.item.sku,input.item.version,input.payload.sha256);
  await env.PAYLOADS.put(key,'corrupt');
  await assert.rejects(publishRelease(env,input,{mode:'activate',reviews}),error=>error.code==='release_source_not_ready');
  assert.equal(rowCount(db,'items'),0);assert.equal(await (await env.PAYLOADS.get(key)).text(),'corrupt');
  env.PAYLOADS.objects.clear();
  const stale=reviews.map(review=>review.kind==='license'?{...review,subject_hash:'0'.repeat(64)}:review);
  await assert.rejects(publishRelease(env,input,{mode:'activate',reviews:stale}),error=>error.code==='release_publication_blocked');
  assert.equal(env.PAYLOADS.writes.length,1);assert.equal(rowCount(db,'items'),0);
  db.close();
});

test('actual AWS-0568 source stages with approved pricing and missing reviews remain blocked',async()=>{
  const input=JSON.parse(await readFile(new URL('../../../products/agent-state-dynamodb-manifest/release-input.json',import.meta.url),'utf8'));
  const db=createFixtureDb(),env=fixtureEnv(db);
  const report=await prepareRelease(env,input);
  assert.equal(report.source_ready,true,JSON.stringify(report.source_blockers));
  assert.equal(input.manifest.components.length,5);
  assert.deepEqual(input.manifest.language_policy.adapters,['javascript','python']);
  assert.equal(input.manifest.pricing.max_amount_atomic,'5000000');
  assert.ok(!report.publication.blockers.includes('commercial_component_allocation_missing'));
  const reviews=[{kind:'routing',subject_hash:report.routing_hash,reviewed_by:'offline-actual-source-fixture',reference:'fixture:local-stage-only'}];
  const staged=await publishRelease(env,input,{mode:'stage',reviews});
  assert.equal(staged.payload.stored_verified,true);assert.equal(staged.input_object.stored_verified,true);
  assert.equal(db.sqlite.prepare('SELECT status FROM items').get().status,'draft');
  const delivered=JSON.parse(await (await env.PAYLOADS.get(staged.payload.r2_key)).text());
  assert.equal(delivered.files.length,13);
  assert.ok(delivered.files.some(file=>file.path==='planner.mjs'));
  assert.ok(delivered.files.some(file=>file.path==='planner.py'));
  assert.ok(staged.publication.blockers.includes('license_or_origin_unverified'));
  await assert.rejects(publishRelease(env,input,{mode:'activate',reviews}),error=>error.code==='release_publication_blocked');
  assert.equal(db.sqlite.prepare('SELECT content_hash FROM items').get().content_hash,input.source_provenance.historical_record.content_hash);
  db.close();
});

test('actual SW-PT-0006 guidance stages exact v2 bytes without rewriting its live v1 catalog row',async()=>{
  const root=new URL('../../../products/lambda-powertools-idempotency/',import.meta.url);
  const input=JSON.parse(await readFile(new URL('release-input.json',root),'utf8'));
  const historical=JSON.parse(await readFile(new URL(input.source_provenance.historical_record_path,root),'utf8'));
  const db=createFixtureDb(),env=fixtureEnv(db);
  insertItem(db,{...historical,price_usd:1});
  const before=db.sqlite.prepare('SELECT * FROM items').get();
  const report=await prepareRelease(env,input);
  assert.equal(report.source_ready,true,JSON.stringify(report.source_blockers));
  assert.deepEqual(input.manifest.language_policy.adapters,['python']);
  assert.equal(input.item.price_usd,1);
  assert.equal(input.item.content_hash,historical.content_hash);
  const reviews=[{kind:'routing',subject_hash:report.routing_hash,reviewed_by:'offline-actual-source-fixture',reference:'fixture:local-stage-only'}];
  const staged=await publishRelease(env,input,{mode:'stage',reviews});
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM items').get(),before);
  assert.equal(await (await env.PAYLOADS.get(staged.payload.r2_key)).text(),input.item.guidance);
  assert.equal(staged.payload.content_hash,await sha256(input.item.guidance));
  assert.equal(staged.input_object.stored_verified,true);
  assert.equal(rowCount(db,'component_releases'),1);
  assert.equal(staged.publication.eligibility,'blocked');
  assert.ok(staged.publication.blockers.includes('guidance_quality_unreviewed'));
  assert.ok(staged.publication.blockers.includes('license_or_origin_unverified'));
  await assert.rejects(publishRelease(env,input,{mode:'activate',reviews}),error=>error.code==='release_publication_blocked');
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM items').get(),before);
  db.close();
});
