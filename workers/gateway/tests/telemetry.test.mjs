import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {fixtureEnv,createRail,makePayment} from './helpers/fixtures.mjs';
import {createQuote,purchase} from '../src/commerce.js';
import {canonicalJson,sha256,USDC,NETWORK} from '../src/contracts.js';
import {trialProduct,selectTrialComponents,acceptTrialSelection} from '../src/trials.js';
import {dispatchOutbox,streamEvent,EVENT_REGISTRY,EVENT_OBSERVATIONS} from '../src/telemetry.js';
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
 const args={quoteId:quote.quoteId,paymentPayload:makePayment(quote),requestData:{}};
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
 assert.ok(!Object.values(EVENT_OBSERVATIONS).some(x=>['discovery','clarification','delivery','recovery'].includes(x.stage)));
 for(const [key,value] of Object.entries({configuration:'private',signature:'private',trial_token:'private',
   selected_component_ids:['private'],omitted_component_ids:['private'],journey_stage:'delivery',
   observed_outcome:'external_deployment_succeeded',exact_amount_atomic:Infinity})) {
  // Enriched metadata cannot be smuggled in through an outbox payload either.
  assert.throws(()=>streamEvent({event_type:'quote.created',payload:JSON.stringify({[key]:value})}));
 }
});

async function componentFixture(t) {
 const {db,env,item}=fixture(t);
 const component=async(id,bps,content)=>({id,name:id,share_bps:bps,requires:[],
  files:[{path:id+'.js',content,sha256:await sha256(content),size_bytes:Buffer.byteLength(content),mime_type:'text/javascript'}]});
 const release={schema_version:'1',sku:item.sku,version:1,release_ref:'fixture:release:1',trial_adapter:'javascript-isolate',
  pricing:{mode:'proportional-components',max_amount_atomic:'250000',asset:USDC,network:NETWORK},
  components:[await component('core',3000,'export const core = 42;'),await component('extra',7000,'export const extra = 99;')]};
 const releaseHash=await sha256(canonicalJson(release));
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,1,canonicalJson(release),releaseHash);
 const trial=await trialProduct(env,item.sku,{},
  {code:'return "private-buyer-code";',language:'javascript'},null,
  {executorFactory:()=>({execute:async()=>({result:'private-buyer-output'})})});
 const scope=await selectTrialComponents(env,trial.trial_id,trial.trial_token,['core']);
 const quote=await acceptTrialSelection(env,trial.trial_id,trial.trial_token,['core'],scope.scope_hash);
 return {db,env,item,trial,scope,quote,release,releaseHash};
}

test('dispatch correlates observed component choices through payment to the pinned release, with stable retries',async t=>{
 const {db,env,item,trial,scope,quote,release,releaseHash}=await componentFixture(t);
 const {rail}=createRail();const paymentPayload=makePayment(quote);
 const paid=await purchase(env,{quoteId:quote.quoteId,paymentPayload,requestData:{}},{rail});
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
 const before=db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes WHERE id=?').get(quote.quoteId).snapshot_json;
 const snapshot={...JSON.parse(before),scope:{scope_hash:'malformed',selected_components:['private-content']}};
 db.sqlite.prepare('UPDATE commerce_quotes SET snapshot_json=? WHERE id=?').run(JSON.stringify(snapshot),quote.quoteId);
 db.sqlite.prepare('UPDATE business_event_outbox SET sent_at=NULL').run();
 assert.equal((await dispatchOutbox(env)).sent,1);
 assert.equal(sent[1].payload.scope_correlation,'unavailable');
 assert.equal(sent[1].payload.quote_id,quote.quoteId);
 assert.equal(sent[1].payload.selected_component_ids,undefined);
 assert.ok(!JSON.stringify(sent[1]).includes('private-content'));
 assert.equal(db.sqlite.prepare('SELECT snapshot_json FROM commerce_quotes WHERE id=?').get(quote.quoteId).snapshot_json,JSON.stringify(snapshot));
 db.sqlite.prepare(`INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
  VALUES ('orphan','scope.selected','2026-10-19T00:00:00Z',?)`).run(JSON.stringify({trial_id:'missing',scope_hash:'a'.repeat(64),sku:item.sku}));
 assert.equal((await dispatchOutbox(env)).sent,1);
 assert.equal(sent[2].payload.scope_correlation,'unavailable');
 assert.equal(sent[2].payload.omitted_component_ids,undefined);
});

test('missing component release or optional database failure cannot change a settled purchase',async t=>{
 const {db,env,quote}=await componentFixture(t);const {rail,calls}=createRail();
 await purchase(env,{quoteId:quote.quoteId,paymentPayload:makePayment(quote),requestData:{}},{rail});
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
