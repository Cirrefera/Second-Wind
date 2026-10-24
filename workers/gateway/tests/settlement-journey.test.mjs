import test from "node:test";
import assert from "node:assert/strict";
import { purchase } from "./helpers/purchase.mjs";
import { createExecutionQuote, } from "../src/commerce.js";
import { createJourneyContext, streamEvent } from "../src/telemetry.js";
import { createFixtureDb } from "./helpers/d1.mjs";
import { createRail, fixtureEnv, makePayment } from "./helpers/fixtures.mjs";

async function fixture(t) {
  const db = createFixtureDb();
  t.after(() => db.close());
  const env = fixtureEnv(db);
  const journey = createJourneyContext({transport:"http"});
  const requestData = {code:"return 42",language:"javascript",invocationId:"journey-fixture"};
  const quote = await createExecutionQuote(env,requestData,{journey});
  const args = {quoteId:quote.acceptanceId,paymentPayload:makePayment(quote),requestData,
    recoveryToken:"j".repeat(43),journey};
  const {rail,calls} = createRail();
  let executions = 0;
  const dependencies = {rail,async execute() {
    executions++;
    return {ok:true,result:{value:42}};
  }};
  return {db,env,args,quote,dependencies,calls,executions:()=>executions,
    row:()=>db.sqlite.prepare("SELECT * FROM commerce_purchases").get(),
    deliveries:()=>db.sqlite.prepare("SELECT * FROM business_event_outbox WHERE event_type='delivery.prepared' ORDER BY rowid")
      .all().map(streamEvent)};
}

function assertDelivery(event,paymentId,quoteId,journey) {
  assert.equal(event.payload.payment_id,paymentId);
  assert.equal(event.payload.quote_id,quoteId);
  assert.equal(event.payload.journey_id,journey.journey_id);
  assert.equal(event.payload.observation_id,journey.observation_id);
  assert.equal(event.payload.transport,journey.transport);
  assert.equal(event.payload.observed_outcome,"response_prepared");
}

test("initial settlement observes its first delivery before any recovery or replay", async t => {
  const f = await fixture(t);
  const result = await purchase(f.env,f.args,f.dependencies);
  assert.equal(result.body.redelivery,false);
  assert.deepEqual(result.body.result,{value:42});
  assert.equal(f.row().status,"settled");
  assert.equal(f.calls.settle.length,1);
  assert.equal(f.executions(),1);
  const events = f.deliveries();
  assert.equal(events.length,1);
  assertDelivery(events[0],result.body.paymentId,f.quote.acceptanceId,f.args.journey);
});

test("prepared recovery observes the resumed request's delivery and settles only once", async t => {
  const f = await fixture(t);
  f.db.sqlite.exec(`CREATE TRIGGER fixture_transition_failure BEFORE UPDATE ON commerce_purchases
    WHEN NEW.status='settling' BEGIN SELECT RAISE(ABORT,'temporary transition failure'); END`);
  await assert.rejects(purchase(f.env,f.args,f.dependencies),error=>error.code==="purchase_prepared_retry");
  const prepared = f.row();
  assert.equal(prepared.status,"prepared");
  assert.equal(f.deliveries().length,0);
  assert.equal(f.calls.settle.length,0);
  assert.equal(f.executions(),1);
  f.db.sqlite.exec("DROP TRIGGER fixture_transition_failure");

  const journey = createJourneyContext({journey_id:f.args.journey.journey_id,transport:"rpc"});
  const resumed = await purchase(f.env,{...f.args,journey},f.dependencies);
  assert.equal(resumed.body.paymentId,prepared.payment_id);
  assert.equal(f.row().prepared_json,prepared.prepared_json);
  assert.equal(f.row().status,"settled");
  assert.equal(f.calls.verify.length,2,"prepared replay uses official verification again");
  assert.equal(f.calls.settle.length,1);
  assert.equal(f.executions(),1);
  const events = f.deliveries();
  assert.equal(events.length,1);
  assertDelivery(events[0],prepared.payment_id,f.quote.acceptanceId,journey);

  const replayJourney = createJourneyContext({journey_id:journey.journey_id,transport:"http"});
  const replay = await purchase(f.env,{...f.args,journey:replayJourney},f.dependencies);
  assert.equal(replay.body.redelivery,true);
  assert.equal(f.calls.settle.length,1);
  assert.equal(f.executions(),1);
  const repeated = f.deliveries();
  assert.equal(repeated.length,2);
  assertDelivery(repeated[1],prepared.payment_id,f.quote.acceptanceId,replayJourney);
});
