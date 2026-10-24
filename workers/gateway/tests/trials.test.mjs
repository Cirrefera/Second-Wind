import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {fixtureEnv,createRail,makePayment} from './helpers/fixtures.mjs';
import {canonicalJson,sha256,USDC,NETWORK} from '../src/contracts.js';
import {trialProduct,selectTrialComponents,acceptTrialSelection,recoverTrial} from '../src/trials.js';
import {purchase} from "./helpers/purchase.mjs";
import {createQuote,recoverGrant,deliverGrant} from '../src/commerce.js';
import {ProductService} from '../src/product-service.js';
import {resourcesDocument} from '../src/discovery.js';
import {newHttpBatchRpcSession,newHttpBatchRpcResponse} from 'capnweb';
async function fixture(t,{unpriced=false}={}){
 const db=createFixtureDb();t.after(()=>db.close());const item=insertItem(db,{price_usd:10});const env=fixtureEnv(db);
 const component=async(id,bps,content)=>({id,name:id,share_bps:bps,requires:[],files:[{path:id+'.js',content,sha256:await sha256(content),size_bytes:Buffer.byteLength(content),mime_type:'text/javascript'}]});
 const release={schema_version:'1',sku:item.sku,version:1,release_ref:'fixture:release:1',trial_adapter:'javascript-isolate',
 pricing:{mode:'proportional-components',max_amount_atomic:'10000000',asset:USDC,network:NETWORK},
 components:[await component('core',3000,'export const core = 42;'),await component('extra',7000,'export const extra = 99;')]};
 if(unpriced){delete release.pricing;for(const component of release.components) delete component.share_bps;}
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,1,canonicalJson(release),await sha256(canonicalJson(release)));
 return {db,item,env,release};
}
const input={code:'return await codemode.readFile("core.js")',language:'javascript'};
const executorFactory=()=>({execute:async(code,tools)=>({result:{observed:await tools.readFile('core.js')}})});
test('trial recovery, component selection and scope inspection pipeline in one HTTP batch without payment',async t=>{
 const {env,item,db}=await fixture(t);
 const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory});
 const realFetch=globalThis.fetch;let trips=0;
 globalThis.fetch=async(url,init)=>{trips++;return newHttpBatchRpcResponse(new Request(url,init),new ProductService(env));};
 try {
  const client=newHttpBatchRpcSession('https://secondwindai.com/capnp');
  const scope=await client.recoverTrial(trial.trial_id,trial.trial_token).selectComponents(['core']).info();
  assert.equal(trips,1);
  assert.equal(scope.amount_atomic,'3000000');
  assert.deepEqual(scope.selected_components,['core']);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM payments').get().n,0);
 } finally {globalThis.fetch=realFetch;}
});
test('trial and selection work with no payment configuration; sandbox sees only trial providers',async t=>{
 const {db,item,env}=await fixture(t);delete env.X402_PAY_TO;delete env.X402_EXPECTED_PAY_TO;
 const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory:settings=>{
   assert.equal(settings.globalOutbound,null);assert.deepEqual(settings.bindings,{});
   return {execute:async(_code,providers)=>{assert.deepEqual(Object.keys(providers).sort(),['components','configuration','readFile']);return {result:42};}};
 }});
 assert.equal(trial.status,'completed');
 const selected=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 assert.equal(selected.amount_atomic,'3000000');assert.equal(selected.files[0].content,undefined);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM payments').get().n,0);
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],selected.scope_hash),/payment_rail_not_configured/);
 await assert.rejects(recoverTrial(env,trial.trial_id,'wrong'),/trial_unauthorized/);
 assert.equal((await recoverTrial(env,trial.trial_id,trial.trial_token)).status,'completed');
});
test('explicit acceptance charges selected fraction and durable recovery delivers only selected files',async t=>{
 const {env,item,db}=await fixture(t);
 const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory});
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['extra'],scope.scope_hash),/selection_acceptance_mismatch/);
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash);
 assert.equal(quote.amount_usdc_micros,'3000000');
 assert.equal((await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash)).quoteId,quote.quoteId);
 await assert.rejects(createQuote(env,item.sku,{}),/component_selection_required/);
 const {rail,calls}=createRail();
 const paid=await purchase(env,{quoteId:quote.quoteId,paymentPayload:makePayment(quote),requestData:{}},{rail});
 assert.deepEqual(paid.body.files.map(f=>f.path),['core.js']);
 assert.equal(paid.body.content_hash,await sha256(canonicalJson(paid.body.files)));
 assert.equal(paid.body.receipt.scope.scope_hash,scope.scope_hash);
 // A subsequent catalog change cannot substitute a different purchased release.
 db.sqlite.prepare('UPDATE items SET version=2 WHERE sku=?').run(item.sku);
 const grant=await recoverGrant(env,paid.body.paymentId,paid.body.recoveryToken);
 assert.equal(grant.scope.selected_share_bps,3000);
 assert.deepEqual((await deliverGrant(env,grant)).files,paid.body.files);
 assert.equal(calls.settle.length,1);
 const events=db.sqlite.prepare('SELECT payload FROM business_event_outbox').all();
 assert.ok(!JSON.stringify(events).includes(trial.trial_token));
 assert.ok(!JSON.stringify(events).includes('export const core'));
});
test('failed trials cannot authorize selection; release mutations are rejected by D1',async t=>{
 const {env,item,db}=await fixture(t);
 const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory:()=>({execute:async()=>({error:'test failed'})})});
 await assert.rejects(selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']),/trial_not_completed/);
 assert.throws(()=>db.sqlite.prepare('UPDATE component_releases SET version=2').run(),/component_release_immutable/);
});
test('Capn Web recovered trial returns selection capability and explicit acceptance',async t=>{
 const {env,item}=await fixture(t);const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory});
 const service=new ProductService(env);const cap=await service.recoverTrial(trial.trial_id,trial.trial_token);
 const selection=await cap.selectComponents(['core']);const info=selection.info();
 assert.throws(()=>selection.accept('wrong'),/selection_acceptance_mismatch/);
 const quote=await selection.accept(info.scope_hash);assert.equal(quote.amount_usdc_micros,'3000000');
});

test('unpriced source can be trialed but cannot select or authorize a price',async t=>{
 const {env,item,db}=await fixture(t,{unpriced:true});
 const resource=(await resourcesDocument(env)).items.find(resource=>resource.sku===item.sku);
 assert.deepEqual(resource.accepts,[]);assert.equal(resource.pricing_status,'not_configured');
 assert.equal(resource.price_role,'historical-unconfirmed');assert.ok(resource.components_url);assert.equal(resource.trial_url,'/api/trials');
 const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory:()=>({execute:async(_code,providers)=>{
   const menu=await providers.components();assert.equal(menu.pricing_status,'not_configured');
   assert.ok(menu.components.every(c=>c.share_bps===undefined&&c.amount_atomic===undefined));
   return {result:await providers.readFile('core.js')};
 }})});
 assert.equal(trial.status,'completed');
 await assert.rejects(selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']),/pricing_not_configured/);
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],'invented'),/pricing_not_configured/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM payments').get().n,0);
});

test('selected bytes must persist in R2 before a quote; missing bytes cannot settle a payment',async t=>{
 const {env,item,db}=await fixture(t);
 const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory});
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 const put=env.PAYLOADS.put.bind(env.PAYLOADS);
 env.PAYLOADS.put=async()=>{throw new Error('offline_storage_failure');};
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash),/offline_storage_failure/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 env.PAYLOADS.put=put;
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash);
 const stored=db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes WHERE id=?').get(quote.quoteId).snapshot_json;
 assert.doesNotMatch(stored,/export const|"content":/);
 const snapshot=JSON.parse(stored);assert.equal(snapshot.payload.via,'r2');
 const original=await env.PAYLOADS.get(snapshot.payload.r2_key);
 await env.PAYLOADS.delete(snapshot.payload.r2_key);
 const {rail,calls}=createRail();
 await assert.rejects(purchase(env,{quoteId:quote.quoteId,paymentPayload:makePayment(quote),requestData:{}},{rail}),/payload_missing/);
 assert.equal(calls.settle.length,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM payments WHERE status=\'settled\'').get().n,0);
 await env.PAYLOADS.put(snapshot.payload.r2_key,await original.arrayBuffer());
 // The failed claim cannot be used as a new charge: request a fresh quote.
 await assert.rejects(purchase(env,{quoteId:quote.quoteId,paymentPayload:makePayment(quote),requestData:{}},{rail}),/invalid_recovery_token|recovery_required/);
});

test('scope readback mismatch fails before quote creation',async t=>{
 const {env,item,db}=await fixture(t);
 const trial=await trialProduct(env,item.sku,{},input,null,{executorFactory});
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 const put=env.PAYLOADS.put.bind(env.PAYLOADS);env.PAYLOADS.put=(key)=>put(key,'corrupted');
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash),/selection_payload_not_persisted/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
});

test('a selected product cannot silently inspect a later version menu',async t=>{
 const {env,item,db,release}=await fixture(t);
 const service=new ProductService(env),selected=await service.select(item.sku);
 assert.equal((await selected.components()).version,1);
 const next={...release,version:2,release_ref:'fixture:release:2'};
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,2,canonicalJson(next),await sha256(canonicalJson(next)));
 db.sqlite.prepare('UPDATE items SET version=2 WHERE sku=?').run(item.sku);
 assert.equal(selected.info().version,1);
 await assert.rejects(selected.components(),/product_changed/);
 assert.equal((await (await service.select(item.sku)).components()).version,2);
});
