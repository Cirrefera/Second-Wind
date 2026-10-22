import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionQuote, purchase, recoverGrant } from "../src/commerce.js";
import { createFixtureDb } from "./helpers/d1.mjs";
import { createRail, deferred, fixtureEnv, makePayment, NETWORK, PAYER } from "./helpers/fixtures.mjs";

async function fixture(t, overrides = {}) {
  const db = createFixtureDb();
  t.after(() => db.close());
  const env = fixtureEnv(db);
  const requestData = {code:"return 42",language:"javascript",invocationId:"interrupted-fixture"};
  const quote = await createExecutionQuote(env,requestData);
  const args = {quoteId:quote.quoteId,paymentPayload:makePayment(quote),requestData,
    recoveryToken:"p".repeat(43)};
  const {rail,calls} = createRail(overrides);
  let executions = 0;
  const dependencies = {rail,async execute() {
    executions++;
    if (overrides.execute) return overrides.execute();
    return {ok:true,result:{value:42}};
  }};
  return {db,env,args,dependencies,calls,executions:()=>executions,
    row:()=>db.sqlite.prepare("SELECT * FROM commerce_purchases").get(),
    payment:()=>db.sqlite.prepare("SELECT * FROM payments").get()};
}

// Faults wrap real SQLite statements; they do not substitute canned DB results.
function interceptStatements(db, intercept) {
  const original = db.prepare.bind(db);
  db.prepare = (sql) => {
    const wrap = statement => ({...statement,
      bind:(...args)=>wrap(statement.bind(...args)),
      run:()=>intercept(sql,"run",()=>statement.run()),
      first:(...args)=>intercept(sql,"first",()=>statement.first(...args)),
    });
    return wrap(original(sql));
  };
}

const settled = () => ({success:true,payer:PAYER,network:NETWORK,transaction:`0x${"a".repeat(64)}`});
const codeIs = code => error => error.code === code;
const agePreparation = db => db.sqlite.prepare("UPDATE commerce_purchases SET updated_at=?")
  .run(new Date(Date.now() - 6 * 60_000).toISOString());

test("a prepared-to-settling database fault resumes the saved result with one execution and settlement", async t => {
  const f = await fixture(t);
  f.db.sqlite.exec(`CREATE TRIGGER fixture_transition_failure BEFORE UPDATE ON commerce_purchases
    WHEN NEW.status='settling' BEGIN SELECT RAISE(ABORT,'temporary transition failure'); END`);
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_prepared_retry"));
  const prepared = f.row();
  assert.equal(prepared.status,"prepared");
  assert.deepEqual(JSON.parse(prepared.prepared_json).result,{value:42});
  assert.equal(f.executions(),1);
  assert.equal(f.calls.verify.length,1);
  assert.equal(f.calls.settle.length,0);
  await assert.rejects(recoverGrant(f.env,prepared.payment_id,f.args.recoveryToken),codeIs("purchase_prepared_retry"));
  f.db.sqlite.exec("DROP TRIGGER fixture_transition_failure");

  const result = await purchase(f.env,f.args,f.dependencies);
  assert.equal(result.body.paymentId,prepared.payment_id);
  assert.deepEqual(result.body.result,{value:42});
  assert.equal(f.row().prepared_json,prepared.prepared_json);
  assert.equal(f.row().status,"settled");
  assert.equal(f.payment().status,"settled");
  assert.equal(f.executions(),1);
  assert.equal(f.calls.verify.length,1);
  assert.equal(f.calls.settle.length,1);
  await purchase(f.env,f.args,f.dependencies);
  assert.equal(f.calls.settle.length,1);
});

test("lost transition acknowledgement is confirmed under the same live owner before settling", async t => {
  const f = await fixture(t);
  let injected = false;
  interceptStatements(f.db,async (sql,method,run) => {
    const result = await run();
    if (!injected && method === "run" && sql.includes("SET status='settling'")) {
      injected = true;
      throw new Error("response lost after committed transition");
    }
    return result;
  });
  const result = await purchase(f.env,f.args,f.dependencies);
  assert.equal(injected,true);
  assert.deepEqual(result.body.result,{value:42});
  assert.equal(f.calls.settle.length,1);
  assert.equal(f.executions(),1);
  await purchase(f.env,f.args,f.dependencies);
  assert.equal(f.calls.settle.length,1);
});

test("an unreadable transition outcome never gives a later retry permission to settle", async t => {
  const f = await fixture(t);
  let lostTransition = false;
  let lostReadback = false;
  interceptStatements(f.db,async (sql,method,run) => {
    if (lostTransition && !lostReadback && method === "first" && sql.includes("WHERE payment_id = ?1")) {
      lostReadback = true;
      throw new Error("readback temporarily unavailable");
    }
    const result = await run();
    if (!lostTransition && method === "run" && sql.includes("SET status='settling'")) {
      lostTransition = true;
      throw new Error("transition acknowledgement lost");
    }
    return result;
  });
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("settlement_pending_recovery"));
  assert.equal(lostReadback,true);
  assert.equal(f.row().status,"settling");
  for (let attempt = 0; attempt < 3; attempt++) {
    await assert.rejects(purchase(f.env,f.args,f.dependencies),error =>
      error.code === "settlement_pending_recovery" && error.details.retry_after === undefined);
  }
  assert.equal(f.executions(),1);
  assert.equal(f.calls.settle.length,0,"operator reconciliation is explicit; a new invocation cannot infer no charge");
});

test("a resumed prepared owner fences the original request and simultaneous retries", async t => {
  const transitionEntered = deferred();
  const releaseOriginal = deferred();
  const settlementEntered = deferred();
  const releaseSettlement = deferred();
  const f = await fixture(t,{async settlePayment() {
    settlementEntered.resolve();
    await releaseSettlement.promise;
    return settled();
  }});
  let intercepted = false;
  interceptStatements(f.db,async (sql,method,run) => {
    if (!intercepted && method === "run" && sql.includes("SET status='settling'")) {
      intercepted = true;
      transitionEntered.resolve();
      await releaseOriginal.promise;
    }
    return run();
  });
  const original = purchase(f.env,f.args,f.dependencies);
  const originalRejected = assert.rejects(original,codeIs("settlement_pending_recovery"));
  await transitionEntered.promise;
  const saved = f.row().prepared_json;
  const resumed = purchase(f.env,f.args,f.dependencies);
  await settlementEntered.promise;
  const contenders = await Promise.allSettled(Array.from({length:6},()=>purchase(f.env,f.args,f.dependencies)));
  assert.ok(contenders.every(result=>result.status === "rejected" && result.reason.code === "settlement_pending_recovery"));
  releaseOriginal.resolve();
  await originalRejected;
  assert.equal(f.payment().status,"verified");
  assert.equal(f.calls.settle.length,1);
  releaseSettlement.resolve();
  const result = await resumed;
  assert.deepEqual(result.body.result,{value:42});
  assert.equal(f.row().prepared_json,saved);
  assert.equal(f.row().status,"settled");
  assert.equal(f.executions(),1);
  assert.equal(f.calls.settle.length,1);
});

test("a public payment signature cannot take over prepared ownership without the private token", async t => {
  const f = await fixture(t);
  f.db.sqlite.exec(`CREATE TRIGGER fixture_transition_failure BEFORE UPDATE ON commerce_purchases
    WHEN NEW.status='settling' BEGIN SELECT RAISE(ABORT,'temporary transition failure'); END`);
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_prepared_retry"));
  f.db.sqlite.exec("DROP TRIGGER fixture_transition_failure");
  const owner = f.row().owner;
  const {recoveryToken:_token,...publicAttempt} = f.args;
  await assert.rejects(purchase(f.env,publicAttempt,f.dependencies),error=>error.status === 401);
  await assert.rejects(purchase(f.env,{...f.args,recoveryToken:"x".repeat(43)},f.dependencies),error=>error.status === 401);
  assert.equal(f.row().owner,owner);
  assert.equal(f.row().status,"prepared");
  assert.equal(f.calls.settle.length,0);
  await purchase(f.env,f.args,f.dependencies);
  assert.equal(f.calls.settle.length,1);
});

test("a committed prepared result survives a lost write acknowledgement", async t => {
  const f = await fixture(t);
  let injected = false;
  interceptStatements(f.db,async (sql,method,run) => {
    const result = await run();
    if (!injected && method === "run" && sql.includes("SET status='prepared'")) {
      injected = true;
      throw new Error("prepared result acknowledgement lost");
    }
    return result;
  });
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_prepared_retry"));
  const saved = f.row().prepared_json;
  assert.equal(f.row().status,"prepared");
  assert.equal(f.payment().status,"verified");
  const result = await purchase(f.env,f.args,f.dependencies);
  assert.deepEqual(result.body.result,{value:42});
  assert.equal(f.row().prepared_json,saved);
  assert.equal(f.executions(),1);
  assert.equal(f.calls.settle.length,1);
});

test("an uncommitted prepared-result write fails terminally without repeating external execution", async t => {
  const f = await fixture(t);
  f.db.sqlite.exec(`CREATE TRIGGER fixture_preparation_failure BEFORE UPDATE ON commerce_purchases
    WHEN NEW.status='prepared' BEGIN SELECT RAISE(ABORT,'temporary result write failure'); END`);
  await assert.rejects(purchase(f.env,f.args,f.dependencies));
  assert.equal(f.row().status,"failed");
  assert.equal(f.payment().status,"failed");
  f.db.sqlite.exec("DROP TRIGGER fixture_preparation_failure");
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_failed"));
  assert.equal(f.executions(),1);
  assert.equal(f.calls.settle.length,0);
});

test("an abandoned execution closes after the bound and a late result cannot settle", async t => {
  const executionEntered = deferred();
  const finishExecution = deferred();
  const f = await fixture(t,{async execute() {
    executionEntered.resolve();
    await finishExecution.promise;
    return {ok:true,result:{value:42}};
  }});
  const original = purchase(f.env,f.args,f.dependencies);
  const originalRejected = assert.rejects(original,codeIs("purchase_failed"));
  await executionEntered.promise;
  agePreparation(f.db);
  const {recoveryToken:_token,...publicAttempt} = f.args;
  await assert.rejects(purchase(f.env,publicAttempt,f.dependencies),error=>error.status === 401);
  assert.equal(f.row().status,"executing");
  await assert.rejects(purchase(f.env,f.args,f.dependencies),error=>error.code === "purchase_failed"
    && error.details.charged === false && error.details.execution_outcome === "unknown");
  assert.equal(f.row().status,"failed");
  assert.equal(f.payment().status,"failed");
  finishExecution.resolve();
  await originalRejected;
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_failed"));
  assert.equal(f.executions(),1);
  assert.equal(f.calls.settle.length,0);
});

test("a lost claim acknowledgement has a bounded terminal outcome and never starts execution", async t => {
  const f = await fixture(t);
  const batch = f.db.batch.bind(f.db);
  let injected = false;
  f.db.batch = async statements => {
    const result = await batch(statements);
    if (!injected) {
      injected = true;
      throw new Error("claim acknowledgement lost");
    }
    return result;
  };
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_record_unavailable"));
  assert.equal(f.row().status,"claimed");
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("payment_in_progress"));
  agePreparation(f.db);
  await assert.rejects(recoverGrant(f.env,f.row().payment_id,f.args.recoveryToken),codeIs("purchase_failed"));
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_failed"));
  assert.equal(f.row().status,"failed");
  assert.equal(f.payment().status,"failed");
  assert.equal(f.executions(),0);
  assert.equal(f.calls.settle.length,0);
});

test("a late execution-entry write cannot revive an authenticated closed claim", async t => {
  const entryReached = deferred();
  const resumeEntry = deferred();
  const f = await fixture(t);
  let paused = false;
  interceptStatements(f.db,async (sql,method,run) => {
    if (!paused && method === "run" && sql.includes("SET status='executing'")) {
      paused = true;
      entryReached.resolve();
      await resumeEntry.promise;
    }
    return run();
  });
  const original = purchase(f.env,f.args,f.dependencies);
  const originalRejected = assert.rejects(original,codeIs("purchase_failed"));
  await entryReached.promise;
  assert.equal(f.row().status,"claimed");
  agePreparation(f.db);
  await assert.rejects(purchase(f.env,f.args,f.dependencies),codeIs("purchase_failed"));
  resumeEntry.resolve();
  await originalRejected;
  assert.equal(f.row().status,"failed");
  assert.equal(f.payment().status,"failed");
  assert.equal(f.executions(),0);
  assert.equal(f.calls.settle.length,0);
});

test("stale cleanup cannot fail the ledger after the original owner advances to settlement", async t => {
  const executionEntered = deferred();
  const finishExecution = deferred();
  const cleanupEntered = deferred();
  const finishCleanup = deferred();
  const settlementEntered = deferred();
  const finishSettlement = deferred();
  const f = await fixture(t,{async execute() {
    executionEntered.resolve();
    await finishExecution.promise;
    return {ok:true,result:{value:42}};
  },async settlePayment() {
    settlementEntered.resolve();
    await finishSettlement.promise;
    return settled();
  }});
  const original = purchase(f.env,f.args,f.dependencies);
  await executionEntered.promise;
  agePreparation(f.db);
  const batch = f.db.batch.bind(f.db);
  let pause = true;
  f.db.batch = async statements => {
    if (pause) {
      pause = false;
      cleanupEntered.resolve();
      await finishCleanup.promise;
    }
    return batch(statements);
  };
  const staleRetry = purchase(f.env,f.args,f.dependencies);
  const staleRejected = assert.rejects(staleRetry,codeIs("settlement_pending_recovery"));
  await cleanupEntered.promise;
  finishExecution.resolve();
  await settlementEntered.promise;
  finishCleanup.resolve();
  await staleRejected;
  assert.equal(f.row().status,"settling");
  assert.equal(f.payment().status,"verified");
  finishSettlement.resolve();
  await original;
  assert.equal(f.row().status,"settled");
  assert.equal(f.payment().status,"settled");
  assert.equal(f.executions(),1);
  assert.equal(f.calls.settle.length,1);
});
