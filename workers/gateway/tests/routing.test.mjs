import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {canonicalJson,sha256} from '../src/contracts.js';
import {resolveIntent,validateRoutingManifest} from '../src/routing.js';
import {ProductService} from '../src/product-service.js';
import {createApp} from '../src/index.js';
const manifest=item=>({schema_version:'1',product_id:'lambda-retry',sku:item.sku,slug:item.slug,version:item.version,
 release_ref:'release:one',service:'lambda',product_kind:'artifact-product',route_summary:'Lambda duplicate processing idempotency',
 supported_boundary:'Duplicate event handling in Lambda',aliases:['retry-safety'],tags:['idempotency','duplicate-processing'],
 taxonomy_ids:['aws.lambda'],problem_family_ids:['duplicate-processing'],operations:['deduplicate'],environments:['lambda'],
 desired_outcomes:['retry-safety'],input_kinds:['event'],failure_signatures:['duplicate-event'],languages:['javascript'],runtimes:['nodejs22'],
 required_evidence:[],exclusions:['exactly-once-external-effects'],language_policy:'explicit'});
async function fixture(t){
 const db=createFixtureDb();t.after(()=>db.close());const item=insertItem(db,{service:'lambda'}),m=manifest(item);
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(item.sku,item.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 return {env:{SW_DB:db},item,m,db};
}
test('unavailable Clef preserves deterministic candidates and status',async t=>{
 const {env,db}=await fixture(t);
 const item=insertItem(db,{sku:'SECOND',slug:'second',service:'lambda'}),m=manifest(item);
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(item.sku,item.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 const intent={goal:'Lambda idempotency',target_language:'javascript'};
 const baseline=await resolveIntent(env,intent);
 assert.equal(baseline.matches.length,2);
 let calls=0;
 env.CLEF_ROUTING_ENABLED='true';
 env.AI={run:async()=>{calls++;throw new Error('provider_unavailable');}};
 const result=await resolveIntent(env,intent);
 assert.equal(calls,1);
 assert.deepEqual(result.alignment,{status:'unavailable'});
 const {alignment,...unchanged}=result;
 assert.deepEqual(unchanged,baseline);
});
test('structured constraints beat exact identity and lexical similarity',async t=>{
 const {env,item}=await fixture(t);
 for(const fields of [{target_language:'python'},{service:'s3'},{input_kind:'csv'},{target_runtime:'python3'}]) {
  const r=await resolveIntent(env,{sku:item.sku,goal:'Lambda idempotency duplicate processing',...fields});
  assert.equal(r.status,'no_match');assert.equal(r.matches.length,0);
 }
 await assert.rejects(resolveIntent(env,{goal:'idempotency',invented_constraint:'value'}),/unsupported_intent_field/);
});
test('language is requested explicitly and not inferred from runtime',async t=>{
 const {env}=await fixture(t);
 const r=await resolveIntent(env,{alias:'retry-safety',target_runtime:'nodejs22'});
 assert.equal(r.status,'missing_configuration');
 assert.equal(r.clarifications[0].question,'What programming language do you want the product delivered in?');
 const service=new ProductService(env);let asked=false;
 const found=await service.searchIntent({alias:'retry-safety'},10,{clarify:async()=>{asked=true;return {target_language:'javascript'};}});
 assert.ok(asked);assert.equal(found.status,'match');assert.equal(found.candidates.length,1);
 assert.equal((await found.candidates[0].product.info()).sku,r.matches[0].sku);
 await found.candidates[0].product.configure({});
});
test('manifest identities are immutable and unrelated goals return no match',async t=>{
 const {env,db,item,m}=await fixture(t);
 assert.deepEqual(validateRoutingManifest(m),[]);
 assert.equal((await resolveIntent(env,{goal:'quantum gardening',target_language:'javascript'})).status,'no_match');
 assert.throws(()=>db.sqlite.exec("UPDATE product_routing_manifests SET reviewed_by='changed'"),/routing_release_immutable/);
 db.sqlite.prepare('UPDATE items SET version=version+1 WHERE sku=?').run(item.sku);
 assert.equal((await resolveIntent(env,{sku:item.sku})).status,'no_match');
});
test('HTTP and capability search use the same compatibility results; Clef cannot rescue a mismatch',async t=>{
 const {env,item}=await fixture(t);let calls=0;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async()=>{calls++;throw new Error('should not run');}};
 const intent={sku:item.sku,target_language:'python'};
 const response=await createApp().fetch(new Request('https://secondwindai.com/api/resolve',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent})}),env,{waitUntil(){}});
 assert.equal(response.status,200);
 const http=await response.json(),rpc=await new ProductService(env).search(intent);
 assert.equal(http.status,'no_match');assert.deepEqual(http.matches,rpc.matches);assert.equal(calls,0);
});

test('reviewed legacy route describes guidance and refuses executable promises',async t=>{
 const {readFile}=await import('node:fs/promises');
 const {manifest:m}=JSON.parse(await readFile(new URL('../review/live-routing-2026-10-19.json',import.meta.url),'utf8'));
 assert.deepEqual(validateRoutingManifest(m),[]);
 const db=createFixtureDb();t.after(()=>db.close());
 insertItem(db,{sku:m.sku,slug:m.slug,service:m.service,version:m.version,kind:'tool'});
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(m.sku,m.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 const env={SW_DB:db};
 const result=await resolveIntent(env,{alias:'powertools-idempotency',product_kind:'guidance-product'});
 assert.equal(result.status,'match');assert.equal(result.matches[0].routing.product_kind,'guidance-product');
 for(const intent of [{product_kind:'executable-product'},{operation:'aws-deployment'},{desired_outcome:'exactly-once'},{target_language:'python'}])
  assert.equal((await resolveIntent(env,{alias:'powertools-idempotency',...intent})).status,'no_match');
});
