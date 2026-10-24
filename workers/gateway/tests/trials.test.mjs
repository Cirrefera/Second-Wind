import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {fixtureEnv,createRail,makePayment} from './helpers/fixtures.mjs';
import {canonicalJson,sha256} from '../src/contracts.js';
import {trialProduct,selectTrialComponents,acceptTrialSelection,recoverTrial} from '../src/trials.js';
import {prepareTrialAccess} from '../src/trial-access.js';
import {purchase} from './helpers/purchase.mjs';
import {createQuote,recoverGrant,deliverGrant} from '../src/commerce.js';
import {ProductService} from '../src/product-service.js';
import {resourcesDocument} from '../src/discovery.js';
import {newHttpBatchRpcSession,newHttpBatchRpcResponse} from 'capnweb';

const releaseInput=JSON.parse(readFileSync(new URL('../../../products/agent-state-dynamodb-manifest/releases/v4/release-input.json',import.meta.url),'utf8'));
const release=releaseInput.manifest;
const config={language:'javascript',table_name:'agent-state-example'};
const input={code:'return await codemode.preview()',language:'javascript',
 trial_id:'trial_fixture',trial_token:'t'.repeat(43),components:['table']};

async function fixture(t){
 const db=createFixtureDb();t.after(()=>db.close());
 const item=insertItem(db,{...releaseInput.item,status:'live'});const env=fixtureEnv(db);
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)')
  .run(item.sku,item.version,canonicalJson(release),await sha256(canonicalJson(release)));
 return {db,item,env,release};
}

function previewExecutorFactory(){
 return {execute:async(_code,providers)=>{
  const paths=await providers.previewModules();
  const extra=paths.filter(path=>path.includes('/expiry.')||path.includes('/recovery.')).length;
  return {result:{operation_count:2+extra,verification_count:1+extra}};
 }};
}

function buyerExecutorFactory(){
 return settings=>{
  assert.equal(settings.globalOutbound,null);assert.deepEqual(settings.bindings,{});
  assert.deepEqual(settings.modules,{});
  return {execute:async(_code,providers)=>{
   assert.deepEqual(Object.keys(providers).sort(),['components','configuration','preview']);
   const result=await providers.preview();
   return {result};
  }};
 };
}

async function paidTrial(env,item,trialInput=input,trialConfig=config,executorFactory=buyerExecutorFactory()){
 const [prepared,concurrent]=await Promise.all([
  prepareTrialAccess(env,item.sku,trialConfig,trialInput,{previewExecutorFactory}),
  prepareTrialAccess(env,item.sku,trialConfig,trialInput,{previewExecutorFactory}),
 ]);
 assert.equal(concurrent.acceptance.acceptanceId,prepared.acceptance.acceptanceId,
   'concurrent acceptance retries bind to the same immutable fee quote');
 const access=prepared.acceptance;
 assert.equal(access.amount_usdc_micros,'10000');
 assert.equal(access.sku,'SW-SANDBOX');
 const {rail,calls}=createRail();
 const quote={...access,purchase:{...access.purchase,
   url:`https://secondwindai.com/rpc?acceptance_id=${access.acceptanceId}`}};
 const paid=await purchase(env,{quoteId:access.acceptanceId,paymentPayload:makePayment(quote),
   requestData:prepared.request,recoveryToken:trialInput.trial_token},{rail});
 assert.equal(paid.body.receipt.amount_usdc_micros,'10000');
 assert.equal(paid.body.receipt.sku,'SW-SANDBOX');
 const trial=await trialProduct(env,item.sku,trialConfig,trialInput,null,
   {previewExecutorFactory,executorFactory});
 assert.doesNotMatch(JSON.stringify(trial.result),/export function prepare|planner\.mjs|content/);
 return {trial,access,prepared,paid,calls};
}

test('paid trial recovery, component selection and exact scope inspection share one Capn Web batch',async t=>{
 const {env,item,db}=await fixture(t);
 const {trial}=await paidTrial(env,item);
 const realFetch=globalThis.fetch;let trips=0;
 globalThis.fetch=async(url,init)=>{trips++;return newHttpBatchRpcResponse(new Request(url,init),new ProductService(env));};
 try {
  const client=newHttpBatchRpcSession('https://secondwindai.com/capnp');
  const scope=await client.recoverTrial(trial.trial_id,trial.trial_token).selectComponents(['table']).info();
  assert.equal(trips,1);
  assert.equal(scope.amount_atomic,'2000000');
  assert.deepEqual(scope.selected_components,['table']);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,1,
    'the sandbox pass is its only purchase before optional product acceptance');
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM payments WHERE status='settled'").get().n,1);
  const replay=await trialProduct(env,item.sku,config,input,null,{executorFactory:()=>{
   throw new Error('a completed retry must not execute again');
  }});
  assert.deepEqual(replay.result,trial.result);
  await assert.rejects(prepareTrialAccess(env,item.sku,config,{...input,code:'return 1'}),/trial_request_conflict/);
  await assert.rejects(prepareTrialAccess(env,item.sku,config,{...input,trial_token:'x'.repeat(43)}),/trial_unauthorized/);
 } finally {globalThis.fetch=realFetch;}
});

test('trial cannot execute without the penny pass or with unavailable payment configuration',async t=>{
 const {db,item,env}=await fixture(t);delete env.X402_PAY_TO;delete env.X402_EXPECTED_PAY_TO;
 await assert.rejects(trialProduct(env,item.sku,config,input,null,{executorFactory:buyerExecutorFactory()}),/payment_rail_not_configured/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM component_trials').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM payments').get().n,0);
 await assert.rejects(recoverTrial(env,input.trial_id,input.trial_token),/trial_unauthorized/);
});

test('explicit acceptance charges only selected components and settled recovery delivers those files',async t=>{
 const {env,item,db}=await fixture(t);
 const {trial}=await paidTrial(env,item);
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['table']);
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['table','expiry'],scope.scope_hash),/selection_acceptance_mismatch/);
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['table'],scope.scope_hash);
 assert.equal(quote.amount_usdc_micros,'2000000');
 assert.equal((await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['table'],scope.scope_hash)).acceptanceId,quote.acceptanceId);
 await assert.rejects(createQuote(env,item.sku,config),/component_selection_required/);
 const {rail,calls}=createRail();
 const paid=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:makePayment(quote,2),requestData:config},{rail});
 assert.deepEqual(paid.body.files.map(f=>f.path),scope.files.map(f=>f.path));
 assert.equal(paid.body.content_hash,await sha256(canonicalJson(paid.body.files)));
 assert.equal(paid.body.receipt.scope.scope_hash,scope.scope_hash);
 db.sqlite.prepare('UPDATE items SET version=5 WHERE sku=?').run(item.sku);
 const grant=await recoverGrant(env,paid.body.paymentId,paid.body.recoveryToken);
 assert.equal(grant.scope.selected_share_bps,4000);
 assert.deepEqual((await deliverGrant(env,grant)).files,paid.body.files);
 assert.equal(calls.settle.length,1);
 const events=db.sqlite.prepare('SELECT payload FROM business_event_outbox').all();
 assert.ok(!JSON.stringify(events).includes(trial.trial_token));
 assert.ok(!JSON.stringify(events).includes('export function prepare'));
});

test('failed previews cannot authorize component selection; immutable manifest stays pinned',async t=>{
 const {env,item,db}=await fixture(t);
 const {trial}=await paidTrial(env,item,input,config,()=>({execute:async()=>({error:'preview consumer failed'})}));
 await assert.rejects(selectTrialComponents(env,trial.trial_id,trial.trial_token,['table']),/trial_not_completed/);
 assert.throws(()=>db.sqlite.prepare('UPDATE component_releases SET version=5').run(),/component_release_immutable/);
});

test('Capn Web recovered trial returns selection capability and exact acceptance',async t=>{
 const {env,item}=await fixture(t);const {trial}=await paidTrial(env,item);
 const service=new ProductService(env);const cap=await service.recoverTrial(trial.trial_id,trial.trial_token);
 const selection=await cap.selectComponents(['table']);const info=selection.info();
 assert.throws(()=>selection.accept('wrong'),/selection_acceptance_mismatch/);
 const quote=await selection.accept(info.scope_hash);assert.equal(quote.amount_usdc_micros,'2000000');
});

test('unsupported products and non-JavaScript orchestration cannot create a sandbox charge',async t=>{
 const {env,item,db}=await fixture(t);
 const unsupported=insertItem(db,{sku:'SW-UNSUPPORTED',slug:'unsupported',status:'live'});
 await assert.rejects(prepareTrialAccess(env,unsupported.sku,{},input),/sandbox_not_eligible/);
 await assert.rejects(prepareTrialAccess(env,item.sku,config,{...input,language:'python'}),/unsupported_execution_language/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM payments').get().n,0);
});

test('selected bytes must persist before optional product acceptance; pass remains separately settled',async t=>{
 const {env,item,db}=await fixture(t);const {trial}=await paidTrial(env,item);
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['table']);
 const put=env.PAYLOADS.put.bind(env.PAYLOADS);
 env.PAYLOADS.put=async()=>{throw new Error('offline_storage_failure');};
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['table'],scope.scope_hash),/offline_storage_failure/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,1);
 env.PAYLOADS.put=put;
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['table'],scope.scope_hash);
 const stored=db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes WHERE id=?').get(quote.acceptanceId).snapshot_json;
 assert.doesNotMatch(stored,/export function prepare|"content":/);
 const snapshot=JSON.parse(stored);assert.equal(snapshot.payload.via,'r2');
 const original=await env.PAYLOADS.get(snapshot.payload.r2_key);
 await env.PAYLOADS.delete(snapshot.payload.r2_key);
 const {rail,calls}=createRail();
 const proof=makePayment(quote,2);
 await assert.rejects(purchase(env,{quoteId:quote.acceptanceId,paymentPayload:proof,requestData:config},{rail}),/payload_missing/);
 assert.equal(calls.settle.length,0);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM payments WHERE status='settled'").get().n,1,
   'only the already settled sandbox pass remains charged');
 await env.PAYLOADS.put(snapshot.payload.r2_key,await original.arrayBuffer());
 await assert.rejects(purchase(env,{quoteId:quote.acceptanceId,paymentPayload:proof,requestData:config},{rail}),/invalid_recovery_token|recovery_required/);
});

test('scope readback mismatch fails before optional quote creation',async t=>{
 const {env,item,db}=await fixture(t);const {trial}=await paidTrial(env,item);
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['table']);
 const put=env.PAYLOADS.put.bind(env.PAYLOADS);env.PAYLOADS.put=(key)=>put(key,'corrupted');
 await assert.rejects(acceptTrialSelection(env,trial.trial_id,trial.trial_token,['table'],scope.scope_hash),/selection_payload_not_persisted/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,1,'sandbox access quote only');
});

test('a selected product cannot silently inspect a later release menu',async t=>{
 const {env,item,db,release}=await fixture(t);
 const service=new ProductService(env),selected=await service.select(item.sku);
 assert.equal((await selected.components()).version,4);
 const next={...release,version:5,release_ref:'fixture:release:5'};
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,5,canonicalJson(next),await sha256(canonicalJson(next)));
 db.sqlite.prepare('UPDATE items SET version=5 WHERE sku=?').run(item.sku);
 assert.equal(selected.info().version,4);
 await assert.rejects(selected.components(),/product_changed/);
 assert.equal((await (await service.select(item.sku)).components()).version,5);
});

test('sandbox access costs one cent through official x402; selected product payment remains optional and exact',async t=>{
 const {env,item,db}=await fixture(t);
 const {createApp}=await import('../src/index.js');
 const {decodePaymentRequiredHeader,encodePaymentSignatureHeader}=await import('@x402/core/http');
 const {rail,calls}=createRail();const app=createApp({facilitator:rail});
 const call=(path,init={})=>app.fetch(new Request(new URL(path,'https://secondwindai.com'),init),env,{waitUntil(){}});
 const discovery=(await call('/discovery/resources')).json();
 const resources=await discovery;const resource=resources.items.find(x=>x.slug===item.slug);
 assert.equal(resource.price_role,'maximum');assert.equal(resource.max_amount_atomic,'5000000');
 assert.deepEqual(resource.accepts,[],'a maximum is never advertised as an exact payment');
 for(const path of ['/api/tools','/openapi.json','/llms.txt']) {
  const text=await (await call(path)).text();assert.doesNotMatch(text,/\/api\/quotes|quote_id|quoteId/i,path);
 }
 const body={sku:item.sku,config,input};
 const challenge=await call('/api/trials/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal(challenge.status,402);
 const required=decodePaymentRequiredHeader(challenge.headers.get('PAYMENT-REQUIRED'));
 assert.equal(required.accepts[0].amount,'10000');
 const acceptanceId=new URL(required.resource.url).searchParams.get('acceptance_id');
 const sign=amount=>{
  const proof=makePayment({acceptanceId,amount_usdc_micros:amount,purchase:{url:required.resource.url}});
  proof.resource=required.resource;return encodePaymentSignatureHeader(proof);
 };
 const excessive=await call(required.resource.url,{method:'POST',headers:{'PAYMENT-SIGNATURE':sign('5000000'),'X-Recovery-Token':input.trial_token}});
 assert.equal(excessive.status,402);assert.equal(calls.settle.length,0);
 const paidResponse=await call(required.resource.url,{method:'POST',headers:{'PAYMENT-SIGNATURE':sign('10000'),'X-Recovery-Token':input.trial_token}});
 assert.equal(paidResponse.status,200,await paidResponse.clone().text());const accessBody=await paidResponse.json();
 assert.equal(accessBody.receipt.amount_usdc_micros,'10000');assert.equal(accessBody.receipt.slug,'sandbox-preview');
 assert.equal(accessBody.files,undefined,'sandbox pass grants no product files');
 assert.equal(calls.settle.length,1);assert.equal(calls.settle[0].requirements.amount,'10000');
 const trial=await trialProduct(env,item.sku,config,input,null,{previewExecutorFactory,executorFactory:buyerExecutorFactory()});
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['table']);
 const accepted=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['table'],scope.scope_hash);
 assert.equal(accepted.amount_usdc_micros,'2000000');
 const productChallenge=await call(accepted.purchase.url);assert.equal(productChallenge.status,402);
 const productRequired=decodePaymentRequiredHeader(productChallenge.headers.get('PAYMENT-REQUIRED'));
 assert.equal(productRequired.accepts[0].amount,'2000000');
 assert.equal(calls.settle.length,1,'creating a product acceptance does not charge it');
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM payments WHERE status='settled'").get().n,1);
});
