import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {fixtureEnv,createRail,makePayment} from './helpers/fixtures.mjs';
import {purchase} from "./helpers/purchase.mjs";
import {createQuote,createExecutionQuote,} from '../src/commerce.js';
import {ProductService} from '../src/product-service.js';
import {createApp} from '../src/index.js';
import {executeCode} from '../src/execution.js';
import {privateKeyToAccount} from 'viem/accounts';
import {canonicalJson,sha256,USDC,NETWORK} from '../src/contracts.js';
import {trialProduct,recoverTrial,selectTrialComponents,acceptTrialSelection} from '../src/trials.js';
import {dispatchOutbox,streamEvent,EVENT_REGISTRY,EVENT_OBSERVATIONS,
 createJourneyContext,publicIntentDimensions,observationStatement,enqueueObservation,observeExpiredTrial} from '../src/telemetry.js';
function fixture(t){const db=createFixtureDb();t.after(()=>db.close());return {db,env:fixtureEnv(db),item:insertItem(db)};}
test('quote and outbox roll back together; migration is repeatable',async t=>{
 const {db,env,item}=fixture(t);
 db.sqlite.exec(readFileSync(new URL('../migrations/0002_business_outbox.sql',import.meta.url),'utf8'));
 db.sqlite.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON business_event_outbox BEGIN SELECT RAISE(ABORT,'outbox unavailable'); END;");
 await assert.rejects(createQuote(env,item.sku,{}));
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 db.sqlite.exec('DROP TRIGGER fail_outbox');
 await createQuote(env,item.sku,{});
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM business_event_outbox').get().n,1);
});
test('Basin failure preserves settlement; replay never duplicates logical events',async t=>{
 const {db,env,item}=fixture(t);const quote=await createQuote(env,item.sku,{});
 const {rail,calls}=createRail();
 const args={quoteId:quote.acceptanceId,paymentPayload:makePayment(quote),requestData:{}};
 const result=await purchase(env,args,{rail});
 const rows=db.sqlite.prepare('SELECT * FROM business_event_outbox').all();
 assert.deepEqual(rows.map(r=>r.event_type).sort(),['quote.created','payment.settlement_started','payment.settled','receipt.issued','entitlement.activated'].sort());
 assert.ok(!JSON.stringify(rows).includes(result.body.recoveryToken));
 env.BUSINESS_EVENTS={send:async()=>{throw new Error('private provider diagnostic');}};
 assert.equal((await dispatchOutbox(env)).failed,5);
 assert.equal(db.sqlite.prepare('SELECT status FROM commerce_purchases').get().status,'settled');
 assert.ok(db.sqlite.prepare('SELECT last_error FROM business_event_outbox').all().every(r=>r.last_error==='dispatch_failed'));
 const sent=[];env.BUSINESS_EVENTS={send:async events=>sent.push(...events)};
 assert.equal((await dispatchOutbox(env)).sent,5);
 assert.equal((await dispatchOutbox(env)).sent,0);
 await purchase(env,{...args,recoveryToken:result.body.recoveryToken},{rail});
 assert.equal(calls.settle.length,1);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM business_event_outbox').get().n,5);
 assert.equal(new Set(sent.map(e=>e.event_id)).size,5);
 assert.equal(typeof sent[0].payload,'object');
 assert.equal(sent[0].payload.producer,'secondwind-gateway');
});
test('export rejects private fields; missing binding retains pending events',async t=>{
 const {db,env,item}=fixture(t);await createQuote(env,item.sku,{});
 const row=db.sqlite.prepare('SELECT * FROM business_event_outbox').get();
 assert.throws(()=>streamEvent({...row,payload:JSON.stringify({recoveryToken:'private'})}));
 assert.deepEqual(await dispatchOutbox(env),{status:'not_configured',sent:0});
 assert.equal(db.sqlite.prepare('SELECT sent_at FROM business_event_outbox').get().sent_at,null);
});

test('registered events name only the stage and transition actually observed',()=>{
 assert.deepEqual(Object.keys(EVENT_OBSERVATIONS).sort(),Object.keys(EVENT_REGISTRY).sort());
 for(const [event_type,{stage,outcome}] of Object.entries(EVENT_OBSERVATIONS)) {
  const event=streamEvent({event_id:event_type+':fixture',event_type,occurred_ts:'2026-10-19T00:00:00Z',payload:'{}'});
  assert.equal(event.payload.journey_stage,stage);
  assert.equal(event.payload.observed_outcome,outcome);
  assert.equal(event.payload.event_family,EVENT_REGISTRY[event_type]);
 }
 assert.equal(EVENT_OBSERVATIONS['trial.completed'].stage,'testing');
 assert.equal(EVENT_OBSERVATIONS['scope.accepted'].stage,'selection');
 // An entitlement is payment-side authority; no delivery was observed here.
 assert.equal(EVENT_OBSERVATIONS['entitlement.activated'].stage,'payment');
 assert.deepEqual([...new Set(Object.values(EVENT_OBSERVATIONS).map(x=>x.stage))].sort(),
  ['clarification','correlation','delivery','discovery','payment','recovery','selection','testing']);
 assert.equal(EVENT_OBSERVATIONS['delivery.prepared'].outcome,'response_prepared');
 assert.ok(!Object.values(EVENT_OBSERVATIONS).some(x=>/received_by_client|deployed|abandoned|unwanted/.test(x.outcome)));
 for(const [key,value] of Object.entries({configuration:'private',signature:'private',trial_token:'private',
   selected_component_ids:['private'],omitted_component_ids:['private'],journey_stage:'delivery',
   observed_outcome:'external_deployment_succeeded',exact_amount_atomic:Infinity})) {
  // Enriched metadata cannot be smuggled in through an outbox payload either.
  assert.throws(()=>streamEvent({event_type:'quote.created',payload:JSON.stringify({[key]:value})}));
 }
});

test('journey context is opaque and public intent comes only from reviewed typed vocabulary',()=>{
 const context=createJourneyContext({journey_id:'private-goal',observation_id:'private-token',transport:'private'});
 assert.match(context.journey_id,/^jrn_[a-f0-9-]{36}$/);
 assert.match(context.observation_id,/^obs_[a-f0-9-]{36}$/);
 assert.equal(context.transport,'internal');
 const next=createJourneyContext({journey_id:context.journey_id,transport:'http'});
 assert.equal(next.journey_id,context.journey_id);
 assert.notEqual(next.observation_id,context.observation_id);
 assert.ok(Object.isFrozen(context));
 const intent={goal:'private buyer goal',alias:'private-customer',service:'s3',operation:'restore',
  target_language:'javascript',environment:'private-tenant',evidence:['private-evidence'],configuration:{token:'private'}};
 const manifests=[{service:'s3',operations:['restore'],languages:['javascript'],environments:['aws']}];
 assert.deepEqual(publicIntentDimensions(intent,manifests),{service:'s3',operation:'restore',target_language:'javascript'});
 assert.deepEqual(publicIntentDimensions(intent),{});
 assert.deepEqual(publicIntentDimensions('private free text',manifests),{});
 assert.ok(!JSON.stringify(publicIntentDimensions(intent,manifests)).includes('private'));
});

test('observation helpers are idempotent, isolate failures and reject private or fabricated transitions',async t=>{
 const {db,env,item}=fixture(t),journey=createJourneyContext({transport:'rpc'});
 const options={journey,payload:{candidate_product_ids:[item.sku],result_count:1,
  resolution_status:'match',public_intent:{service:'s3'}}};
 assert.deepEqual(await enqueueObservation(env,'discovery.resolved',options),{status:'queued'});
 assert.deepEqual(await enqueueObservation(env,'discovery.resolved',options),{status:'duplicate'});
 const row=db.sqlite.prepare('SELECT * FROM business_event_outbox').get();
 assert.equal(row.event_id,`discovery.resolved:${journey.observation_id}`);
 assert.equal(streamEvent(row).payload.journey_id,journey.journey_id);
 assert.deepEqual(await enqueueObservation(env,'payment.settled',options),{status:'invalid_observation'});
 for(const payload of [{goal:'private'},{configuration:{token:'private'}},{signature:'private'},
  {payer:'private'},{result:'private'},{public_intent:{goal:'private'}},{selected_product_ids:['private text']},
  {candidate_product_ids:Array.from({length:51},(_,i)=>`SW-${i}`)},{journey_id:journey.journey_id},
  {response_status:'client_received'},{exact_amount_atomic:0.25},{exact_amount_atomic:Infinity}]) {
  assert.deepEqual(await enqueueObservation(env,'discovery.resolved',{journey,payload}),{status:'invalid_observation'});
 }
 assert.deepEqual(await enqueueObservation({},'discovery.resolved',options),{status:'not_configured'});
 const failingEnv={SW_DB:{prepare(){return {bind(){return {async run(){throw new Error('private database detail');}};}};}}};
 assert.deepEqual(await enqueueObservation(failingEnv,'discovery.resolved',options),{status:'unavailable'});
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM business_event_outbox').get().n,1);
});

test('every optional observed stage can enqueue and dispatch through the existing outbox',async t=>{
 const {db,env,item}=fixture(t);
 const types=['discovery.searched','discovery.resolved','discovery.described',
  'clarification.requested','clarification.responded','configuration.checked','selection.product_selected',
  'delivery.prepared','delivery.failed','recovery.grant_recovered','recovery.challenge_created',
  'recovery.credential_rotated','recovery.result_recovered','recovery.trial_recovered','recovery.purchase_replayed'];
 for(const type of types) {
  const journey=createJourneyContext({transport:'http'});
  assert.equal((await enqueueObservation(env,type,{journey,payload:{sku:item.sku}})).status,'queued');
 }
 const sent=[];env.BUSINESS_EVENTS={send:async rows=>sent.push(...rows)};
 assert.equal((await dispatchOutbox(env)).sent,types.length);
 assert.deepEqual(sent.map(x=>x.event_type).sort(),types.sort());
 assert.equal(new Set(sent.map(x=>x.payload.observation_id)).size,types.length);
 assert.ok(sent.every(x=>x.payload.journey_correlation==='available'));
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM business_event_outbox WHERE sent_at IS NULL').get().n,0);
});

test('prepared journey links support explicit fixture transactions and exact durable-key resolution',async t=>{
 const {db,env,item}=fixture(t),journey=createJourneyContext({transport:'http'});
 const id=`trial_${crypto.randomUUID()}`;
 const statement=()=>db.prepare(`INSERT INTO component_trials
  (id,token_hash,sku,version,release_hash,config_json,status,created_at,expires_at)
  VALUES (?1,'private-token-hash',?2,1,?3,'{}','running','2026-10-19T00:00:00Z',?4)`)
  .bind(id,item.sku,'a'.repeat(64),Date.now()+3600000);
 db.sqlite.exec(`CREATE TRIGGER fail_link BEFORE INSERT ON business_event_outbox
  WHEN NEW.event_type='journey.linked' BEGIN SELECT RAISE(ABORT,'private database detail'); END;`);
 await assert.rejects(db.batch([statement(),observationStatement(db,'journey.linked',{journey,payload:{trial_id:id}})]));
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM component_trials').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM business_event_outbox').get().n,0);
 db.sqlite.exec('DROP TRIGGER fail_link');
 await db.batch([statement(),observationStatement(db,'journey.linked',{journey,payload:{trial_id:id}})]);
 const quote=await createQuote(env,item.sku,{});
 const quoteJourney=createJourneyContext({journey_id:journey.journey_id,transport:'http'});
 assert.equal((await enqueueObservation(env,'journey.linked',{journey:quoteJourney,payload:{quote_id:quote.acceptanceId}})).status,'queued');
 const other=createJourneyContext({transport:'rpc'});
 assert.equal((await enqueueObservation(env,'journey.linked',{journey:other,payload:{quote_id:quote.acceptanceId}})).status,'duplicate');
 const {rail}=createRail();await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:makePayment(quote),requestData:{}},{rail});
 const sent=[];env.BUSINESS_EVENTS={send:async rows=>sent.push(...rows)};
 await dispatchOutbox(env);
 const core=sent.filter(e=>e.event_type==='trial.started'||e.payload.quote_id===quote.acceptanceId);
 assert.ok(core.length>=6);
 assert.ok(core.every(e=>e.payload.journey_id===journey.journey_id));
 assert.ok(core.every(e=>e.payload.transport==='http'));
 const linkReads=db.statements.filter(x=>x.sql==='SELECT event_type,payload FROM business_event_outbox WHERE event_id=?1');
 assert.ok(linkReads.length<=2*sent.length);
 for(const invalid of [{quote_id:quote.acceptanceId,trial_id:id},{quote_id:'private-token'},{payment_id:'private'},{}])
  assert.throws(()=>observationStatement(db,'journey.linked',{journey,payload:invalid}));
});

test('an expired still-running trial yields only the recorded expiry observation',async t=>{
 const {db,env,item}=fixture(t),journey=createJourneyContext({transport:'rpc'});
 const now=Date.now(),id=`trial_${crypto.randomUUID()}`;
 db.sqlite.prepare(`INSERT INTO component_trials
  (id,token_hash,sku,version,release_hash,config_json,status,created_at,expires_at)
  VALUES (?,'private-token-hash',?,1,?,'{}','running',?,?)`)
  .run(id,item.sku,'a'.repeat(64),new Date(now-3600000).toISOString(),now-1);
 assert.equal((await observeExpiredTrial(env,id,journey,{now})).status,'queued');
 assert.equal((await observeExpiredTrial(env,id,journey,{now:now+1000})).status,'duplicate');
 assert.equal(db.sqlite.prepare('SELECT status FROM component_trials WHERE id=?').get(id).status,'running');
 const rows=db.sqlite.prepare('SELECT * FROM business_event_outbox').all();
 assert.deepEqual(rows.map(x=>x.event_type).sort(),['trial.started','trial.expired_while_running'].sort());
 const expired=rows.find(x=>x.event_type==='trial.expired_while_running');
 assert.equal(expired.event_id,`trial.expired_while_running:${id}`);
 assert.equal(expired.occurred_ts,new Date(now).toISOString());
 assert.equal(streamEvent(expired).payload.observed_outcome,'expiry_observed_while_running');
 db.sqlite.prepare('UPDATE component_trials SET status=\'completed\' WHERE id=?').run(id);
 assert.equal((await observeExpiredTrial(env,id,journey,{now})).status,'not_observed');
 assert.equal((await observeExpiredTrial(env,'private-token',journey,{now})).status,'invalid_observation');
});

test('execution quote and settlement with no pre-result artifact hash remain exportable',async t=>{
 const {db,env}=fixture(t),input={code:'return "private-execution-output";',language:'javascript',invocationId:'private-invocation'};
 const quote=await createExecutionQuote(env,input),{rail,calls}=createRail();
 assert.equal(db.sqlite.prepare('SELECT content_hash FROM commerce_quotes WHERE id=?').get(quote.acceptanceId).content_hash,'');
 const paid=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:makePayment(quote),requestData:input},
  {rail,execute:async()=>({ok:true,result:'private-execution-output'})});
 const sent=[];env.BUSINESS_EVENTS={send:async events=>sent.push(...events)};
 const result=await dispatchOutbox(env);
 assert.equal(result.failed,0);
 const core=sent.filter(e=>['quote.created','payment.settlement_started','payment.settled','receipt.issued','entitlement.activated'].includes(e.event_type));
 assert.equal(core.length,5);
 for(const event of core) {
  assert.equal(event.payload.exact_amount_atomic,'2000');
  assert.equal(event.payload.artifact_hash,undefined);
 }
 assert.equal(calls.settle.length,1);
 for(const secret of [input.code,input.invocationId,'private-execution-output',paid.body.recoveryToken])
  assert.ok(!JSON.stringify(sent).includes(secret));
});

test('actual shared producers record a complete bounded journey without buyer content or invented outcomes',async t=>{
 const {db,env,item,releaseHash}=await componentReleaseFixture(t),journey=createJourneyContext({transport:'rpc'});
 const next=()=>createJourneyContext({journey_id:journey.journey_id,transport:'rpc'});
 db.sqlite.prepare('UPDATE items SET input_schema=? WHERE sku=?').run(JSON.stringify({type:'object',
  required:['language'],properties:{language:{type:'string'}}}),item.sku);
 const service=new ProductService(env,journey);
 await service.search('private-search-no-result');
 await service.describe(item.sku);
 await service.describe(item.sku); // Distinct observations must not collapse per RPC root.
 const selected=await service.select(item.sku);
 const configured=await selected.configure({}, {clarify:async()=>({language:'javascript',private_answer:'private-answer'})});
 assert.equal(configured.configuration().ok,true);
 const trial=await trialProduct(env,item.sku,{language:'javascript'},
  {code:'return "private-buyer-code";',language:'javascript'},null,
  {journey:next(),executorFactory:()=>({execute:async()=>({result:'private-trial-output'})})});
 assert.equal((await recoverTrial(env,trial.trial_id,trial.trial_token,{journey:next()})).status,'completed');
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash,{journey:next()});
 // Public synthetic test account; signing is local, and the synthetic rail has no network.
 const buyer=privateKeyToAccount(`0x${'a'.repeat(64)}`);
 const {rail,calls}=createRail({verifyPayment:async()=>({isValid:true,payer:buyer.address}),
  settlePayment:async()=>({success:true,transaction:`0x${'c'.repeat(64)}`,network:NETWORK,payer:buyer.address})});
 const payment=makePayment(quote);payment.payload.authorization.from=buyer.address;
 const paid=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:payment,
  requestData:{language:'javascript'},journey:next()},{rail});
 const grant=await service.getGrant(paid.body.paymentId,paid.body.recoveryToken);
 await grant.deliver();
 const snapshot=JSON.parse(db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes WHERE id=?').get(quote.acceptanceId).snapshot_json);
 env.PAYLOADS.failedReads.add(snapshot.payload.r2_key);
 await assert.rejects(grant.deliver());
 env.PAYLOADS.failedReads.delete(snapshot.payload.r2_key);
 await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:payment,requestData:{language:'javascript'},
  recoveryToken:paid.body.recoveryToken,journey:next()},{rail});
 const challenge=await service.recoveryChallenge(paid.body.paymentId);
 const signature=await buyer.signMessage({message:challenge.message});
 const recovered=await service.recoverWithWallet(paid.body.paymentId,{challengeId:challenge.challengeId,signature});
 await assert.rejects(service.getGrant(paid.body.paymentId,paid.body.recoveryToken));
 await service.recoverSession(paid.body.paymentId,recovered.recoveryToken);
 const execution={code:'return "private-execution-result";',language:'javascript',invocationId:'private-invocation'};
 const executionQuote=await createExecutionQuote(env,execution,{journey:next()});
 const executionPayment=makePayment(executionQuote,2);executionPayment.payload.authorization.from=buyer.address;
 const executionPaid=await purchase(env,{quoteId:executionQuote.acceptanceId,paymentPayload:executionPayment,
  requestData:execution,journey:next()},{rail,execute:async()=>({ok:true,result:'private-execution-result'})});
 const executionGrant=await service.getGrant(executionPaid.body.paymentId,executionPaid.body.recoveryToken);
 await executionGrant.execute(execution.invocationId,execution.code,execution.language);
 for(const [index,outcome] of ['pending','failed'].entries()) {
  const request={code:`return "private-${outcome}-result";`,language:'javascript',invocationId:`private-${outcome}-invocation`};
  const extraQuote=await createExecutionQuote(env,request,{journey:next()}),payload=makePayment(extraQuote,index+3);
  payload.payload.authorization.from=buyer.address;
  const failure=createRail({verifyPayment:async()=>({isValid:true,payer:buyer.address}),settlePayment:async()=>{
   if(outcome==='pending') throw new Error('private settlement provider diagnostic');
   return {success:false,errorReason:'private settlement failure'};
  }});
  await assert.rejects(purchase(env,{quoteId:extraQuote.acceptanceId,paymentPayload:payload,requestData:request,journey:next()},
   {rail:failure.rail,execute:async()=>outcome==='failed'?{ok:false,error:'private preparation failure'}:{ok:true,result:`private-${outcome}-result`}}),
   error=>error.code===(outcome==='pending'?'settlement_pending_recovery':'execution_failed'));
 }
 await trialProduct(env,item.sku,{language:'javascript'},{code:'return "private-failing-code";',language:'javascript'},null,
  {journey:next(),executorFactory:()=>({execute:async()=>({error:'private-sandbox-diagnostic'})})});
 const expiredId=`trial_${crypto.randomUUID()}`,expiredToken='x'.repeat(43),expiry=Date.now()-1;
 await db.batch([db.prepare(`INSERT INTO component_trials
  (id,token_hash,sku,version,release_hash,config_json,status,created_at,expires_at)
  VALUES (?1,?2,?3,1,?4,'{"language":"javascript"}','running',?5,?6)`)
  .bind(expiredId,await sha256(expiredToken),item.sku,releaseHash,new Date(expiry-3600000).toISOString(),expiry),
  observationStatement(db,'journey.linked',{journey:next(),payload:{trial_id:expiredId}})]);
 await assert.rejects(recoverTrial(env,expiredId,'y'.repeat(43),{journey:next()}),error=>error.code==='trial_unauthorized');
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM business_event_outbox WHERE event_type='trial.expired_while_running'").get().n,0);
 await assert.rejects(recoverTrial(env,expiredId,expiredToken,{journey:next()}),error=>error.code==='trial_expired');
 assert.equal(db.sqlite.prepare('SELECT status FROM component_trials WHERE id=?').get(expiredId).status,'running');
 const sent=[];env.BUSINESS_EVENTS={send:async rows=>sent.push(...rows)};
 for(let i=0;i<10;i++) {const batch=await dispatchOutbox(env);assert.equal(batch.failed,0);if(!batch.sent) break;}
 const types=new Set(sent.map(event=>event.event_type));
 for(const type of Object.keys(EVENT_REGISTRY)) assert.ok(types.has(type),`missing actual producer for ${type}`);
 assert.equal(sent.filter(event=>event.event_type==='discovery.described').length,2);
 assert.ok(sent.some(event=>event.event_type==='configuration.checked'&&event.payload.configuration_status==='incomplete'));
 assert.ok(sent.some(event=>event.event_type==='configuration.checked'&&event.payload.configuration_status==='complete'));
 assert.ok(sent.every(event=>event.payload.journey_id===journey.journey_id));
 assert.ok(sent.filter(event=>event.event_type==='delivery.prepared').every(event=>event.payload.observed_outcome==='response_prepared'));
 assert.ok(!sent.some(event=>/client_received|deployed|abandoned|unwanted/.test(event.payload.observed_outcome)));
 const accepted=sent.find(event=>event.event_type==='scope.accepted');
 assert.equal(accepted.payload.exact_amount_atomic,'75000');
 assert.deepEqual(accepted.payload.selected_component_ids,['core']);
 assert.deepEqual(accepted.payload.omitted_component_ids,['extra']);
 const serialized=JSON.stringify(sent);
 for(const secret of ['private-search-no-result','private-answer','private-buyer-code','private-trial-output',
  'private-execution-result','private-invocation','private-failing-code','private-sandbox-diagnostic',
  'private-pending-result','private-failed-result','private settlement',
  buyer.address.toLowerCase(),trial.trial_token,paid.body.recoveryToken,recovered.recoveryToken,
  executionPaid.body.recoveryToken,signature,payment.payload.signature,'configuration_hash','payer'])
  assert.ok(!serialized.toLowerCase().includes(secret.toLowerCase()),`leaked ${secret.slice(0,24)}`);
 assert.equal(calls.settle.length,2);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_purchases WHERE status=\'settled\'').get().n,2);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM business_event_outbox WHERE sent_at IS NULL').get().n,0);
});

test('optional observation storage failures cannot change payment, delivery or credential recovery',async t=>{
 const {db,env,item}=fixture(t),journey=createJourneyContext({transport:'rpc'}),service=new ProductService(env,journey);
 db.sqlite.exec(`CREATE TRIGGER fail_optional_observation BEFORE INSERT ON business_event_outbox
  WHEN NEW.event_type LIKE 'delivery.%' OR NEW.event_type LIKE 'recovery.%'
  BEGIN SELECT RAISE(ABORT,'private optional store diagnostic'); END;`);
 const buyer=privateKeyToAccount(`0x${'a'.repeat(64)}`),quote=await createQuote(env,item.sku,{}),payment=makePayment(quote);
 payment.payload.authorization.from=buyer.address;
 const {rail,calls}=createRail({verifyPayment:async()=>({isValid:true,payer:buyer.address}),
  settlePayment:async()=>({success:true,transaction:`0x${'d'.repeat(64)}`,network:NETWORK,payer:buyer.address})});
 const paid=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:payment,requestData:{},journey},{rail});
 const grant=await service.getGrant(paid.body.paymentId,paid.body.recoveryToken);
 assert.equal((await grant.deliver()).guidance,item.guidance);
 const challenge=await service.recoveryChallenge(paid.body.paymentId);
 const recovered=await service.recoverWithWallet(paid.body.paymentId,{challengeId:challenge.challengeId,
  signature:await buyer.signMessage({message:challenge.message})});
 await assert.rejects(service.getGrant(paid.body.paymentId,paid.body.recoveryToken));
 assert.equal((await (await service.recoverSession(paid.body.paymentId,recovered.recoveryToken)).info()).paymentId,paid.body.paymentId);
 assert.equal(db.sqlite.prepare('SELECT status FROM commerce_purchases WHERE payment_id=?').get(paid.body.paymentId).status,'settled');
 assert.equal(calls.settle.length,1);
 const rows=db.sqlite.prepare('SELECT * FROM business_event_outbox').all();
 assert.equal(rows.length,5);
 assert.ok(!JSON.stringify(rows).includes('private optional store diagnostic'));
});

test('rejected optional journey links preserve actual quote, trial, scope acceptance and payment authority',async t=>{
 const {db,env,item}=await componentReleaseFixture(t),journey=createJourneyContext({transport:'rpc'});
 const next=()=>createJourneyContext({journey_id:journey.journey_id,transport:'rpc'});
 const fixed=insertItem(db,{sku:'SW-FIXED',slug:'fixed-price-guide'});
 db.sqlite.exec(`CREATE TRIGGER reject_optional_journey_link BEFORE INSERT ON business_event_outbox
  WHEN NEW.event_type='journey.linked' BEGIN SELECT RAISE(ABORT,'private link store diagnostic'); END;`);
 const fixedQuote=await createQuote(env,fixed.sku,{}, {journey:next()});
 assert.equal(fixedQuote.amount_usdc_micros,'250000');
 let executions=0;
 const trial=await trialProduct(env,item.sku,{}, {code:'return "private-link-failure-code";',language:'javascript'},null,
  {journey:next(),executorFactory:()=>({execute:async()=>{executions++;return {result:'private-link-failure-output'};}})});
 assert.equal(trial.status,'completed');
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash,{journey:next()});
 const acceptedAgain=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash,{journey:next()});
 assert.equal(acceptedAgain.acceptanceId,quote.acceptanceId);
 assert.equal(quote.amount_usdc_micros,'75000');
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,2);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM component_trials WHERE status=\'completed\'').get().n,1);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM component_acceptances').get().n,1);
 assert.equal(executions,1);
 const {rail,calls}=createRail(),paymentPayload=makePayment(quote);
 const paid=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload,requestData:{},journey:next()},{rail});
 const replay=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload,requestData:{},
  recoveryToken:paid.body.recoveryToken,journey:next()},{rail});
 assert.equal(paid.body.paymentId,replay.body.paymentId);
 assert.equal(replay.body.redelivery,true);
 assert.equal(calls.settle.length,1);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_purchases WHERE status=\'settled\'').get().n,1);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM business_event_outbox WHERE event_type='journey.linked'").get().n,0);
 const sent=[];env.BUSINESS_EVENTS={send:async rows=>sent.push(...rows)};
 for(let i=0;i<10;i++) {const batch=await dispatchOutbox(env);assert.equal(batch.failed,0);if(!batch.sent) break;}
 const coreTypes=['trial.started','trial.completed','scope.selected','scope.accepted','quote.created',
  'payment.settlement_started','payment.settled','receipt.issued','entitlement.activated'];
 const core=sent.filter(event=>coreTypes.includes(event.event_type));
 assert.equal(core.length,10); // Two quotes, trial start/finish, scope choice/acceptance, four payment transitions.
 assert.ok(core.every(event=>event.payload.journey_id===undefined&&event.payload.journey_correlation==='unavailable'));
 assert.equal(sent.filter(event=>event.event_type==='payment.settled').length,1);
 const scopeEvents=core.filter(event=>event.payload.scope_correlation==='available');
 assert.ok(scopeEvents.length>=7);
 for(const event of scopeEvents) {
  assert.equal(event.payload.exact_amount_atomic,'75000');
  assert.deepEqual(event.payload.selected_component_ids,['core']);
  assert.deepEqual(event.payload.omitted_component_ids,['extra']);
 }
 // Direct delivery observations can retain their observed request context. They
 // must not be used as a heuristic to invent links for the core events above.
 assert.ok(sent.some(event=>event.event_type==='delivery.prepared'&&event.payload.journey_id===journey.journey_id));
 assert.ok(!JSON.stringify(sent).includes('private'));
});

test('HTTP discovery documents and component menus observe their actual public projections',async t=>{
 const {db,env,item}=await componentReleaseFixture(t),journey=createJourneyContext({transport:'http'}),app=createApp();
 const paths=['/api/tools','/openapi.json','/llms.txt','/discovery/resources','/.well-known/x402',
  '/v2/x402/discovery/resources',`/api/products/${item.sku}/components`];
 for(const path of paths) {
  const response=await app.fetch(new Request(`https://secondwindai.com${path}`,{headers:{'X-Journey-Id':journey.journey_id}}),env,{waitUntil(){}});
  assert.equal(response.status,200,path);
  assert.equal(response.headers.get('X-Journey-Id'),journey.journey_id);
 }
 const events=db.sqlite.prepare("SELECT * FROM business_event_outbox WHERE event_type='discovery.described'").all().map(streamEvent);
 assert.equal(events.length,paths.length);
 assert.equal(new Set(events.map(event=>event.payload.observation_id)).size,paths.length);
 assert.ok(events.every(event=>event.payload.journey_id===journey.journey_id&&event.payload.transport==='http'));
 assert.equal(events.filter(event=>event.payload.result_count===1).length,paths.length-1);
 assert.ok(events.filter(event=>event.payload.candidate_product_ids).every(event=>JSON.stringify(event.payload.candidate_product_ids)===JSON.stringify([item.sku])));
 assert.equal(events.find(event=>event.payload.sku===item.sku).payload.product_version_ref,1);
 assert.ok(!JSON.stringify(events).includes(item.guidance.trim()));
});

test('Code Mode default providers use shared observations with sandbox correlation',async t=>{
 const {db,env,item}=fixture(t),journey=createJourneyContext({transport:'rpc'});
 const result=await executeCode(env,'private orchestration code','javascript',null,null,{journey,
  executorFactory:()=>({execute:async(code,providers)=>{
   assert.equal(code,'private orchestration code');
   await providers.search('private-customer-search');
   await providers.describe(item.sku);
   assert.equal((await providers.configure(item.sku,{})).ok,true);
   assert.equal(providers.quote,undefined);
   assert.equal(providers.quoteProduct,undefined);
   assert.equal(await providers.entitlement(),null);
   await assert.rejects(providers.deliver(),error=>error.message==='delivery_not_entitled');
   return {result:{configured:true}};
  }})});
 assert.equal(result.ok,true);
 const events=db.sqlite.prepare('SELECT * FROM business_event_outbox').all().map(streamEvent);
 assert.deepEqual(events.map(event=>event.event_type).sort(),['discovery.searched','discovery.resolved',
  'discovery.described','configuration.checked'].sort());
 assert.ok(events.filter(event=>event.payload.journey_id).every(event=>event.payload.journey_id===journey.journey_id&&event.payload.transport==='sandbox'));
 assert.ok(!JSON.stringify(events).includes('private'));
 const sent=[];env.BUSINESS_EVENTS={send:async rows=>sent.push(...rows)};
 assert.equal((await dispatchOutbox(env)).sent,events.length);
 assert.ok(sent.every(event=>event.payload.journey_id===journey.journey_id&&event.payload.transport==='sandbox'));
});

async function componentReleaseFixture(t) {
 const {db,env,item}=fixture(t);
 const component=async(id,bps,content)=>({id,name:id,share_bps:bps,requires:[],
  files:[{path:id+'.js',content,sha256:await sha256(content),size_bytes:Buffer.byteLength(content),mime_type:'text/javascript'}]});
 const release={schema_version:'1',sku:item.sku,version:1,release_ref:'fixture:release:1',trial_adapter:'javascript-isolate',
  pricing:{mode:'proportional-components',max_amount_atomic:'250000',asset:USDC,network:NETWORK},
  components:[await component('core',3000,'export const core = 42;'),await component('extra',7000,'export const extra = 99;')]};
 const releaseHash=await sha256(canonicalJson(release));
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,1,canonicalJson(release),releaseHash);
 return {db,env,item,release,releaseHash};
}
async function componentFixture(t,{journey}={}) {
 const {db,env,item,release,releaseHash}=await componentReleaseFixture(t);
 const trial=await trialProduct(env,item.sku,{},
  {code:'return "private-buyer-code";',language:'javascript'},null,
  {journey,executorFactory:()=>({execute:async()=>({result:'private-buyer-output'})})});
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash,{journey});
 return {db,env,item,trial,scope,quote,release,releaseHash};
}

test('dispatch correlates observed component choices through payment to the pinned release, with stable retries',async t=>{
 const {db,env,item,trial,scope,quote,release,releaseHash}=await componentFixture(t);
 const {rail}=createRail();const paymentPayload=makePayment(quote);
 const paid=await purchase(env,{quoteId:quote.acceptanceId,paymentPayload,requestData:{}},{rail});
 // A newer valid release cannot change the choices already observed in version 1.
 db.sqlite.prepare('UPDATE items SET version=2 WHERE sku=?').run(item.sku);
 const later={...release,version:2,release_ref:'fixture:release:2',components:release.components.map(c=>({...c,id:'later-'+c.id}))};
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,2,canonicalJson(later),await sha256(canonicalJson(later)));
 const attempts=[];env.BUSINESS_EVENTS={send:async events=>{attempts.push(...events);throw new Error('private provider detail');}};
 const pending=db.sqlite.prepare('SELECT count(*) n FROM business_event_outbox').get().n;
 assert.equal((await dispatchOutbox(env)).failed,pending);
 const sent=[];env.BUSINESS_EVENTS={send:async events=>sent.push(...events)};
 assert.equal((await dispatchOutbox(env)).sent,pending);
 assert.deepEqual(sent,attempts);
 const scopeEvents=sent.filter(e=>e.payload.scope_correlation==='available');
 assert.deepEqual(scopeEvents.map(e=>e.event_type).sort(),
  ['scope.selected','scope.accepted','quote.created','payment.settlement_started','payment.settled','receipt.issued','entitlement.activated'].sort());
 for(const {payload} of scopeEvents) {
  assert.equal(payload.trial_id,trial.trial_id);
  assert.equal(payload.scope_hash,scope.scope_hash);
  assert.equal(payload.release_hash,releaseHash);
  assert.equal(payload.product_version_ref,1);
  assert.deepEqual(payload.selected_component_ids,['core']);
  assert.deepEqual(payload.omitted_component_ids,['extra']);
  assert.equal(payload.selected_share_bps,3000);
  assert.equal(payload.exact_amount_atomic,'75000');
 }
 const serialized=JSON.stringify(sent);
 for(const secret of [trial.trial_token,paid.body.recoveryToken,paymentPayload.payload.signature,
   'private-buyer-code','private-buyer-output','export const core','configuration_hash','payer']) assert.ok(!serialized.includes(secret));
 assert.equal(db.sqlite.prepare('SELECT status FROM commerce_purchases').get().status,'settled');
});

test('absent or malformed optional correlation preserves base events and never guesses choices',async t=>{
 const {db,env,item}=fixture(t);const quote=await createQuote(env,item.sku,{});
 const sent=[];env.BUSINESS_EVENTS={send:async events=>sent.push(...events)};
 assert.equal((await dispatchOutbox(env)).sent,1);
 assert.equal(sent[0].payload.scope_correlation,'not_applicable');
 assert.equal(sent[0].payload.selected_component_ids,undefined);
 const before=db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes WHERE id=?').get(quote.acceptanceId).snapshot_json;
 const snapshot={...JSON.parse(before),scope:{scope_hash:'malformed',selected_components:['private-content']}};
 db.sqlite.prepare('UPDATE commerce_quotes SET snapshot_json=? WHERE id=?').run(JSON.stringify(snapshot),quote.acceptanceId);
 db.sqlite.prepare('UPDATE business_event_outbox SET sent_at=NULL').run();
 assert.equal((await dispatchOutbox(env)).sent,1);
 assert.equal(sent[1].payload.scope_correlation,'unavailable');
 assert.equal(sent[1].payload.quote_id,quote.acceptanceId);
 assert.equal(sent[1].payload.selected_component_ids,undefined);
 assert.ok(!JSON.stringify(sent[1]).includes('private-content'));
 assert.equal(db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes WHERE id=?').get(quote.acceptanceId).snapshot_json,JSON.stringify(snapshot));
 db.sqlite.prepare(`INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
  VALUES ('orphan','scope.selected','2026-10-19T00:00:00Z',?)`).run(JSON.stringify({trial_id:'missing',scope_hash:'a'.repeat(64),sku:item.sku}));
 assert.equal((await dispatchOutbox(env)).sent,1);
 assert.equal(sent[2].payload.scope_correlation,'unavailable');
 assert.equal(sent[2].payload.omitted_component_ids,undefined);
});

test('missing component release or optional database failure cannot change a settled purchase',async t=>{
 const {db,env,quote}=await componentFixture(t);const {rail,calls}=createRail();
 await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:makePayment(quote),requestData:{}},{rail});
 const sent=[];
 const failingDb={prepare(sql){if(sql.includes('FROM component_releases')) throw new Error('private database diagnostic');return db.prepare(sql);}};
 env.SW_DB=failingDb;env.BUSINESS_EVENTS={send:async events=>sent.push(...events)};
 assert.equal((await dispatchOutbox(env)).failed,0);
 assert.ok(sent.filter(e=>e.payload.quote_id||e.event_type==='scope.selected').every(e=>e.payload.scope_correlation==='unavailable'));
 assert.ok(sent.every(e=>e.payload.selected_component_ids===undefined));
 assert.equal(db.sqlite.prepare('SELECT status FROM commerce_purchases').get().status,'settled');
 assert.equal(calls.settle.length,1);
 assert.ok(!JSON.stringify(sent).includes('private database diagnostic'));
 // Missing optional rows receive the same explicit unavailable marker.
 env.SW_DB=db;
 db.sqlite.prepare('UPDATE commerce_quotes SET snapshot_json=json_set(snapshot_json,\'$.scope.release_hash\',?)').run('b'.repeat(64));
 db.sqlite.prepare('UPDATE business_event_outbox SET sent_at=NULL').run();
 sent.length=0;
 assert.equal((await dispatchOutbox(env)).failed,0);
 assert.ok(sent.filter(e=>e.payload.quote_id).every(e=>e.payload.scope_correlation==='unavailable'));
 assert.equal(db.sqlite.prepare('SELECT status FROM commerce_purchases').get().status,'settled');
});

test('poison events do not starve fresh events and dispatch work is bounded',async t=>{
 const {db,env,item}=fixture(t);
 for(let i=0;i<20;i++) db.sqlite.prepare("INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload) VALUES (?,'unknown','2020-01-01T00:00:00Z','{}')").run(`poison:${i}`);
 await createQuote(env,item.sku,{});
 const sent=[];env.BUSINESS_EVENTS={send:async events=>sent.push(...events)};
 assert.equal((await dispatchOutbox(env)).failed,20);
 assert.equal((await dispatchOutbox(env)).sent,1);
 assert.equal(sent[0].event_type,'quote.created');
});

test('review-only Basin projections preserve exact amounts, arrays and logical IDs on generated fixtures',async t=>{
 const {db,env,item,trial,scope,quote}=await componentFixture(t),journey=createJourneyContext({transport:'rpc'});
 await enqueueObservation(env,'journey.linked',{journey,payload:{trial_id:trial.trial_id}});
 await enqueueObservation(env,'journey.linked',{journey,payload:{quote_id:quote.acceptanceId}});
 await enqueueObservation(env,'discovery.resolved',{journey,payload:{resolution_status:'match',
  candidate_product_ids:[item.sku],public_intent:{service:'s3',operation:'restore'}}});
 await enqueueObservation(env,'selection.product_selected',{journey,payload:{selected_product_ids:[item.sku],sku:item.sku}});
 const {rail}=createRail();await purchase(env,{quoteId:quote.acceptanceId,paymentPayload:makePayment(quote),requestData:{}},{rail});
 const sent=[];env.BUSINESS_EVENTS={send:async rows=>sent.push(...rows)};
 for(let i=0;i<10;i++) { const result=await dispatchOutbox(env);assert.equal(result.failed,0);if(!result.sent) break; }
 db.sqlite.exec(`CREATE TABLE second_wind_events (
  event_id TEXT, schema_version TEXT, event_contract_version TEXT,
  event_type TEXT, occurred_ts TEXT, payload TEXT)`);
 const at=(encoded,...keys)=>keys.reduce((value,key)=>value?.[key],JSON.parse(encoded));
 db.sqlite.function('json_get_str',{varargs:true},(encoded,...keys)=>{
  const value=at(encoded,...keys);return typeof value==='string'?value:'';
 });
 db.sqlite.function('json_as_text',{varargs:true},(encoded,...keys)=>{
  const value=at(encoded,...keys);return value===undefined||value===null?null:
   typeof value==='object'?JSON.stringify(value):String(value);
 });
 db.sqlite.function('json_get_json',{varargs:true},(encoded,...keys)=>{
  const value=at(encoded,...keys);return value===undefined?null:JSON.stringify(value);
 });
 const insert=event=>db.sqlite.prepare('INSERT INTO second_wind_events VALUES (?,?,?,?,?,?)')
  .run(event.event_id,event.schema_version,event.event_contract_version,event.event_type,event.occurred_ts,JSON.stringify(event.payload));
 for(const event of sent) insert(event);
 const settled=sent.find(e=>e.event_type==='payment.settled');
 insert(settled); // At-least-once raw ingestion deliberately retains a duplicate.
 insert({...settled,event_id:'foreign-producer',payload:{...settled.payload,producer:'other'}});
 insert({...settled,event_id:'foreign-contract',event_contract_version:'2'});
 insert({...settled,event_id:'obsolete-receipt',event_type:'payment.receipt'});
 const missing=streamEvent({event_id:'missing-price',event_type:'payment.settled',
  occurred_ts:settled.occurred_ts,payload:JSON.stringify({payment_id:`pay_${crypto.randomUUID()}`,sku:item.sku})});
 insert(missing);
 insert({...missing,event_id:'numeric-legacy-price',payload:{...missing.payload,exact_amount_atomic:0.075,price_usd:0.075}});
 const review=readFileSync(new URL('../telemetry-review.md',import.meta.url),'utf8');
 const blocks=[...review.matchAll(/```sql\n([\s\S]*?)\n```/g)].map(match=>match[1]);
 assert.equal(blocks.length,3);
 assert.ok(blocks.every(sql=>!/^\s*(?:INSERT|CREATE|DROP|ALTER|DELETE|UPDATE)\b/im.test(sql)));
 const sql=name=>blocks.find(block=>block.startsWith(`-- ${name}_projection\n`));
 const payments=db.sqlite.prepare(sql('payment')).all();
 assert.equal(payments.filter(row=>row.event_id===settled.event_id).length,2);
 assert.ok(payments.filter(row=>row.event_id===settled.event_id).every(row=>row.exact_amount_atomic==='75000'));
 assert.equal(payments.find(row=>row.event_id==='missing-price').exact_amount_atomic,null);
 assert.equal(payments.find(row=>row.event_id==='numeric-legacy-price').exact_amount_atomic,null);
 assert.ok(payments.every(row=>!['foreign-producer','foreign-contract','obsolete-receipt'].includes(row.event_id)));
 const uniqueSettled=new Map(payments.filter(row=>row.event_type==='payment.settled' && row.exact_amount_atomic!==null)
  .map(row=>[row.event_id,row]));
 assert.equal(uniqueSettled.size,1);
 assert.equal([...uniqueSettled.values()].reduce((sum,row)=>sum+BigInt(row.exact_amount_atomic),0n),75000n);
 const scopes=db.sqlite.prepare(sql('scope')).all();
 assert.deepEqual(scopes.map(row=>row.event_type).sort(),['scope.selected','scope.accepted'].sort());
 for(const row of scopes) {
  assert.equal(row.scope_hash,scope.scope_hash);
  assert.equal(row.exact_amount_atomic,'75000');
  assert.equal(row.product_version_ref,'1');
  assert.deepEqual(JSON.parse(row.selected_component_ids),['core']);
  assert.deepEqual(JSON.parse(row.omitted_component_ids),['extra']);
 }
 const journeys=db.sqlite.prepare(sql('journey')).all();
 assert.ok(!journeys.some(row=>row.event_type==='journey.linked'));
 assert.deepEqual(JSON.parse(journeys.find(row=>row.event_type==='discovery.resolved').public_intent),{service:'s3',operation:'restore'});
 assert.deepEqual(JSON.parse(journeys.find(row=>row.event_type==='selection.product_selected').selected_product_ids),[item.sku]);
 const projectedTypes=[...sql('journey').matchAll(/'([a-z]+\.[a-z_]+)'/g)].map(match=>match[1]);
 assert.deepEqual(projectedTypes.sort(),Object.keys(EVENT_REGISTRY).filter(type=>type!=='journey.linked').sort());
});
