import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareRelease} from '../../../products/agent-state-dynamodb-manifest/scripts/package.mjs';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {fixtureEnv,createRail,makePayment} from './helpers/fixtures.mjs';
import {canonicalJson,sha256} from '../src/contracts.js';
import {prepareComponentSelection,selectedPackageFiles,selectionConfiguration} from '../src/scope.js';
import {trialProduct,selectTrialComponents,testTrialSelection,acceptTrialSelection} from '../src/trials.js';
import {purchase,recoverGrant,deliverGrant} from '../src/commerce.js';
import {resolveIntent} from '../src/routing.js';
import {ProductService} from '../src/product-service.js';
import {newHttpBatchRpcSession,newHttpBatchRpcResponse} from 'capnweb';
import {storePackage} from '../src/release-storage.js';

const config={table_name:'agent-state-test',features:['table','expiry'],language:'javascript',runtime:'nodejs22'};
const input={code:'return 42;',language:'javascript'};
const executorFactory=()=>({execute:async()=>({result:42})});
export async function fixture(t) {
 const db=createFixtureDb();t.after(()=>db.close());const env=fixtureEnv(db);
 const {release,routing,payload}=await prepareRelease();
 const schema=await readFile(new URL('../../../products/agent-state-dynamodb-manifest/config.schema.json',import.meta.url),'utf8');
 const item=insertItem(db,{sku:release.sku,slug:release.slug,kind:'artifact',service:'dynamodb',version:release.version,price_usd:0.5,input_schema:schema});
 await env.PAYLOADS.put(release.storage.r2_key,payload);
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,item.version,canonicalJson(release),await sha256(canonicalJson(release)));
 db.sqlite.prepare('INSERT INTO product_routing_manifests VALUES (?,?,?,?,?,?)').run(item.sku,item.version,canonicalJson(routing),await sha256(canonicalJson(routing)),'automated-test',new Date().toISOString());
 return {db,env,release,item};
}
test('real product routes only to supported language and explicit requirements',async t=>{
 const {env,item}=await fixture(t);
 assert.equal((await resolveIntent(env,{alias:'dynamodb-agent-state'})).status,'missing_configuration');
 assert.equal((await resolveIntent(env,{sku:item.sku,target_language:'python'})).status,'no_match');
 assert.equal((await resolveIntent(env,{goal:'quantum gardening',target_language:'javascript'})).status,'no_match');
 assert.equal((await resolveIntent(env,{alias:'dynamodb-agent-state',target_language:'javascript',target_runtime:'nodejs22'})).status,'match');
});
test('every purchased scope has a complete entry point and excludes unselected implementation',async t=>{
 const {release}=await fixture(t);const optional=release.components.slice(1).map(c=>c.id);
 for(let mask=0;mask<16;mask++){
  const ids=['table',...optional.filter((_,i)=>mask&(1<<i))];
  const cfg=selectionConfiguration(release,ids,config);
  const scope=await prepareComponentSelection(release,ids,cfg);
  const files=selectedPackageFiles(release,scope);const paths=files.map(f=>f.path);
  assert.ok(paths.includes('plan.mjs'));assert.ok(paths.includes('planner.mjs'));
  for(const id of optional) assert.equal(paths.includes(`features/${id}.mjs`),ids.includes(id));
  for(const f of files){const identity=scope.files.find(x=>x.path===f.path);assert.equal(await sha256(f.content),identity.sha256);}
 }
});
test('acceptance requires exact selected sandbox evidence and R2 package; recovery preserves it',async t=>{
 const {env,db,item}=await fixture(t);
 const trial=await trialProduct(env,item.sku,config,input,null,{executorFactory});
 const ids=['table'];const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,ids);
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,ids,scope.scope_hash),/selected_product_test_required/);
 const failed=await testTrialSelection(env,trial.trial_id,trial.trial_token,ids,scope.scope_hash,{code:'throw Error()',language:'javascript'},null,{executorFactory:()=>({execute:async()=>({error:'failed'})})});
 assert.equal(failed.result.ok,false);
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,ids,scope.scope_hash),/selected_product_test_required/);
 const checked=await testTrialSelection(env,trial.trial_id,trial.trial_token,ids,scope.scope_hash,input,null,{executorFactory:()=>({execute:async(_code,p)=>{
  assert.deepEqual((await p.configuration()).features,['table']);
  await assert.rejects(p.readFile('features/expiry.mjs'),/trial_file_not_found/);return {result:42};}})});
 assert.equal(checked.result.ok,true);
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,ids,scope.scope_hash);
 assert.equal(quote.content_hash,checked.package_hash);assert.equal(quote.amount_usdc_micros,'250000');
 const snapshot=JSON.parse(db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes').get().snapshot_json);
 assert.equal(snapshot.payload.via,'r2');assert.ok(await env.PAYLOADS.get(snapshot.payload.r2_key));
 const {rail,calls}=createRail();const paid=await purchase(env,{quoteId:quote.quoteId,paymentPayload:makePayment(quote),requestData:quote.config},{rail});
 assert.equal(calls.settle.length,1);
 assert.ok(!paid.body.files.some(f=>f.path.startsWith('features/')));
 db.sqlite.prepare('UPDATE items SET version=3 WHERE sku=?').run(item.sku);
 const recovered=await deliverGrant(env,await recoverGrant(env,paid.body.paymentId,paid.body.recoveryToken));
 assert.deepEqual(recovered.files,paid.body.files);assert.equal(recovered.content_hash,checked.package_hash);
});
test('missing stored release stops the trial and creates no quote or charge',async t=>{
 const {env,item,release,db}=await fixture(t);await env.PAYLOADS.delete(release.storage.r2_key);
 await assert.rejects(trialProduct(env,item.sku,config,input,null,{executorFactory}),/payload_missing/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
});
test('conditional immutable writes reject an existing corrupt object rather than replacing it',async t=>{
 const {env}=await fixture(t),files=[{path:'a.js',content:'hello'}];
 const stored=await storePackage(env,files);
 env.PAYLOADS.objects.get(stored.r2_key).bytes=new TextEncoder().encode('broken');
 await assert.rejects(storePackage(env,files),/content_hash_mismatch/);
});
test('search and configuration pipeline together without authorizing a quote',async t=>{
 const {env,db}=await fixture(t);const old=globalThis.fetch;let trips=0;
 globalThis.fetch=async(url,init)=>{trips++;return newHttpBatchRpcResponse(new Request(url,init),new ProductService(env));};
 try {
  const session=newHttpBatchRpcSession('https://secondwindai.com/capnp');
  const search=session.searchIntent({alias:'dynamodb-agent-state',target_language:'javascript'});
  const checked=await search.candidates.map(candidate=>candidate.product.configure(config).configuration());
  assert.equal(checked.length,1);assert.equal(checked[0].ok,true);assert.equal(trips,1);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 }finally {globalThis.fetch=old;}
});
