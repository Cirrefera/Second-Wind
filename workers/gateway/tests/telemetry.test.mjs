import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {fixtureEnv,createRail,makePayment} from './helpers/fixtures.mjs';
import {createQuote,purchase} from '../src/commerce.js';
import {dispatchOutbox,streamEvent} from '../src/telemetry.js';
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

test('poison events do not starve fresh events and dispatch work is bounded',async t=>{
 const {db,env,item}=fixture(t);
 for(let i=0;i<20;i++) db.sqlite.prepare("INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload) VALUES (?,'unknown','2020-01-01T00:00:00Z','{}')").run(`poison:${i}`);
 await createQuote(env,item.sku,{});
 const sent=[];env.BUSINESS_EVENTS={send:async events=>sent.push(...events)};
 assert.equal((await dispatchOutbox(env)).failed,20);
 assert.equal((await dispatchOutbox(env)).sent,1);
 assert.equal(sent[0].event_type,'quote.created');
});
