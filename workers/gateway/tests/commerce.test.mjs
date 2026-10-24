import test from "node:test";
import assert from "node:assert/strict";
import { purchase } from "./helpers/purchase.mjs";
import {
  createQuote,
  createExecutionQuote,
  recoverGrant,
  deliverGrant,
  executeGrantedInvocation,
} from "../src/commerce.js";
import { createFixtureDb, insertItem, rowCount } from "./helpers/d1.mjs";
import { createRail, deferred, fixtureEnv, makePayment, sha256 } from "./helpers/fixtures.mjs";

function fixture(t, itemOverrides) {
  const db = createFixtureDb();
  t.after(() => db.close());
  const item = insertItem(db, itemOverrides);
  const env = fixtureEnv(db);
  return { db, item, env };
}

function identity(result) {
  const { paymentId, recoveryToken } = result.body;
  assert.equal(typeof paymentId, "string", "purchase returns a durable payment identity");
  assert.ok(paymentId.startsWith("pay_"));
  assert.equal(typeof recoveryToken, "string", "purchase returns a secret recovery credential");
  assert.ok(recoveryToken.length >= 32);
  return { paymentId, recoveryToken };
}

function denied(error) {
  return [400, 401, 403, 404, 409].includes(error.status);
}

async function buy(env, quote, rail, sequence = 1, requestData = {}) {
  return purchase(env, {
    quoteId: quote.acceptanceId,
    paymentPayload: makePayment(quote, sequence),
    requestData,
  }, { rail });
}

test("concurrent retries claim one purchase and reach settlement exactly once", async (t) => {
  const { db, item, env } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const entered = deferred();
  const release = deferred();
  const { rail, calls } = createRail({
    async settlePayment() {
      entered.resolve();
      await release.promise;
      return {
        success: true, payer: `0x${"2".repeat(40)}`,
        transaction: `0x${"a".repeat(64)}`, network: "eip155:8453",
      };
    },
  });
  const args = {
    quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: {},
    recoveryToken: "b".repeat(43),
  };
  const owner = purchase(env, args, { rail });
  await Promise.race([entered.promise, owner.then(() => { throw new Error("purchase completed without settlement"); })]);
  const competing = await Promise.allSettled(
    Array.from({ length: 8 }, () => purchase(env, structuredClone(args), { rail })),
  );
  assert.ok(competing.every((result) => result.status === "rejected" && result.reason.status === 409));
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
  release.resolve();
  const initial = await owner;
  const firstIdentity = identity(initial);
  assert.equal(calls.settle.length, 1);
  assert.equal(rowCount(db, "payments"), 1);
  const payment = db.sqlite.prepare("SELECT * FROM payments WHERE id = ?").get(firstIdentity.paymentId);
  assert.equal(payment.status, "settled");
  assert.match(payment.tx_hash, /^0x[0-9a-f]{64}$/i);

  const { recoveryToken: _token, ...withoutToken } = args;
  await assert.rejects(purchase(env, withoutToken, { rail }), (error) => error.status === 401);
  const replay = await purchase(env, { ...args, recoveryToken: firstIdentity.recoveryToken }, { rail });
  assert.equal(replay.body.paymentId, firstIdentity.paymentId);
  assert.equal(replay.body.redelivery, true);
  assert.equal(calls.verify.length, 1, "settled replay uses the ledger, without re-verification");
  assert.equal(calls.settle.length, 1, "settled replay never calls the facilitator again");
  assert.equal(rowCount(db, "payments"), 1);
});

test("facilitator verification failure produces no settled purchase and no delivery", async (t) => {
  const { db, item, env } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail({
    async verifyPayment() { return { isValid: false, invalidReason: "invalid_signature" }; },
  });
  await assert.rejects(buy(env, quote, rail), (error) => error.status === 402);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 0);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 0);
  assert.equal(rowCount(db, "deliveries"), 0);
});

test("settlement rejection cannot issue a receipt or authorize recovery", async (t) => {
  const { db, item, env } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail } = createRail({
    async settlePayment() { return { success: false, errorReason: "insufficient_funds" }; },
  });
  await assert.rejects(buy(env, quote, rail));
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 0);
  assert.equal(rowCount(db, "deliveries"), 0);
  const row = db.sqlite.prepare("SELECT id FROM payments LIMIT 1").get();
  if (row) await assert.rejects(recoverGrant(env, row.id, "incorrect-token"), denied);
});

test("success without an on-chain transaction is not a settled purchase", async (t) => {
  const { db, item, env } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail } = createRail({
    async settlePayment() { return { success: true, transaction: "", network: "eip155:8453" }; },
  });
  await assert.rejects(buy(env, quote, rail));
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 0);
  assert.equal(rowCount(db, "deliveries"), 0);
});

test("a D1 failure after successful settlement is repaired from the private receipt without charging again", async (t) => {
  const { db, item, env } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  const args = {
    quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: {},
    recoveryToken: "e".repeat(43),
  };
  db.sqlite.exec(`CREATE TRIGGER fixture_settlement_write_failure BEFORE UPDATE ON payments
    WHEN NEW.status = 'settled'
    BEGIN SELECT RAISE(ABORT, 'fixture D1 write failure after settlement'); END`);
  let error;
  try { await purchase(env, args, { rail }); } catch (caught) { error = caught; }
  assert.equal(error?.code, "settlement_pending_recovery");
  assert.equal(calls.settle.length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 0);
  assert.equal(env.DELIVERIES.writes.length, 1, "confirmed settlement has an independent private receipt copy");
  db.sqlite.exec("DROP TRIGGER fixture_settlement_write_failure");
  const recovered = await purchase(env, args, { rail });
  assert.equal(recovered.body.redelivery, true);
  assert.equal(recovered.body.recoveryToken, args.recoveryToken);
  assert.match(recovered.body.receipt.tx_hash, /^0x[0-9a-f]{64}$/i);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 1);
});

test("a settlement timeout stays unresolved, and replay cannot launch a second settlement", async (t) => {
  const { db, item, env } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail({
    async settlePayment() { throw new Error("facilitator connection lost after submission"); },
  });
  const args = {
    quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: {},
    recoveryToken: "c".repeat(43),
  };
  await assert.rejects(purchase(env, args, { rail }), (error) => error.code === "settlement_pending_recovery");
  await assert.rejects(purchase(env, args, { rail }), (error) => error.code === "settlement_pending_recovery");
  assert.equal(calls.settle.length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 0);
  assert.equal(rowCount(db, "deliveries"), 0);
});

test("simultaneous paid execution attempts execute and settle once across SQLite claims", async (t) => {
  const { env, db } = fixture(t);
  const input = { code: "return 42", language: "javascript", invocationId: "race-invocation" };
  const quote = await createExecutionQuote(env, input);
  const { rail, calls } = createRail();
  let executions = 0;
  const dependencies = {
    rail,
    async execute() { executions += 1; return { ok: true, result: 42 }; },
  };
  const args = {
    quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: input,
    recoveryToken: "d".repeat(43),
  };
  const results = await Promise.allSettled(Array.from({ length: 8 },
    () => purchase(env, structuredClone(args), dependencies)));
  const successful = results.filter((result) => result.status === "fulfilled");
  assert.equal(successful.filter((result) => !result.value.body.redelivery).length, 1);
  assert.ok(results.every((result) => result.status === "fulfilled" || result.reason.status === 409));
  assert.equal(executions, 1);
  assert.equal(calls.settle.length, 1);
  assert.equal(rowCount(db, "payments"), 1);
  assert.equal(rowCount(db, "commerce_purchases"), 1);
});

test("payment IDs alone cannot retrieve an entitlement or recover a paid session", async (t) => {
  const { env, item } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  const paid = await buy(env, quote, rail);
  const { paymentId, recoveryToken } = identity(paid);
  await assert.rejects(recoverGrant(env, paymentId), denied);
  await assert.rejects(recoverGrant(env, paymentId, "wrong-recovery-token"), denied);
  const grant = await recoverGrant(env, paymentId, recoveryToken);
  assert.equal(grant.paymentId, paymentId);
  assert.equal(grant.sku, item.sku);
  assert.equal(calls.settle.length, 1);
});

test("a signed proof for one quote cannot purchase another SKU", async (t) => {
  const { env, db, item } = fixture(t);
  const other = insertItem(db, { sku: "SW-PT-0007", slug: "other-product", guidance: "Another paid product." });
  const firstQuote = await createQuote(env, item.sku, {});
  const otherQuote = await createQuote(env, other.sku, {});
  const proof = makePayment(firstQuote);
  const { rail, calls } = createRail();
  const first = await purchase(env, { quoteId: firstQuote.acceptanceId, paymentPayload: proof, requestData: {} }, { rail });
  const firstIdentity = identity(first);
  await assert.rejects(
    purchase(env, {
      quoteId: otherQuote.acceptanceId, paymentPayload: proof, requestData: {},
      recoveryToken: firstIdentity.recoveryToken,
    }, { rail }),
    denied,
  );
  assert.equal(calls.settle.length, 1);
  assert.equal(rowCount(db, "payments"), 1);
});

test("delivery remains bound to the bought version after a catalog edit and retirement", async (t) => {
  const { env, db, item } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  const paid = await buy(env, quote, rail);
  const { paymentId, recoveryToken } = identity(paid);
  const grant = await recoverGrant(env, paymentId, recoveryToken);
  const original = await deliverGrant(env, grant);
  db.sqlite.prepare("UPDATE items SET guidance=?, version=2, status='retired', content_hash=? WHERE sku=?")
    .run("This content did not exist at purchase.", "f".repeat(64), item.sku);
  db.sqlite.prepare("UPDATE commerce_quotes SET expires_at=1 WHERE id=?").run(quote.acceptanceId);
  const recovered = await recoverGrant(env, paymentId, recoveryToken);
  const after = await deliverGrant(env, recovered);
  assert.deepEqual(after, original);
  assert.match(JSON.stringify(after), /Paid version one/);
  assert.doesNotMatch(JSON.stringify(after), /did not exist at purchase/);
  assert.equal(calls.settle.length, 1);
});

test("catalog changes between quote and payment cannot alter the agreed price or payload", async (t) => {
  const { env, db, item } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  db.sqlite.prepare("UPDATE items SET price_usd=1.50, guidance=?, version=2 WHERE sku=?")
    .run("A later version offered for a different price.", item.sku);
  const { rail, calls } = createRail();
  const paid = await buy(env, quote, rail);
  assert.equal(paid.body.version, 1);
  assert.equal(paid.body.guidance, item.guidance);
  assert.equal(paid.body.content_hash, quote.content_hash);
  assert.equal(paid.body.receipt.amount_usdc_micros, "250000");
  assert.equal(calls.settle[0].requirements.amount, "250000");
});

test("missing or corrupt R2 payloads are caught before asking the facilitator to charge", async (t) => {
  const { env, db, item } = fixture(t, { invoke_kind: "r2", invoke_key: "payloads/SW-PT-0006/v1/guide.md" });
  const bytes = new TextEncoder().encode("Expected exact bytes: caf\u00e9\n");
  db.sqlite.prepare(`INSERT INTO payload_objects
    (id,sku,r2_bucket,r2_key,content_hash,size_bytes,mime_type,version)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run("po_fixture", item.sku, "secondwind-payloads", item.invoke_key, sha256(bytes), bytes.length, "text/markdown", 1);
  await assert.rejects(createQuote(env, item.sku, {}));
  await env.PAYLOADS.put(item.invoke_key, "A substituted payload");
  await assert.rejects(createQuote(env, item.sku, {}));
  assert.equal(rowCount(db, "payments"), 0);
});

test("database claim failures stop before execution or settlement", async (t) => {
  const { env, db, item } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  // This is a real SQL failure, not a canned exception returned by a DB mock.
  db.sqlite.exec(`CREATE TRIGGER fixture_claim_failure BEFORE INSERT ON commerce_purchases
    BEGIN SELECT RAISE(ABORT, 'fixture database failure'); END`);
  await assert.rejects(buy(env, quote, rail));
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 0);
  assert.equal(rowCount(db, "payments"), 0);
});

test("SDK requirement matching and facilitator verification reject altered amounts or recipients", async (t) => {
  const { env, item, db } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  const mutations = [
    (proof) => { proof.accepted.amount = "1"; proof.payload.authorization.value = "1"; },
    (proof) => { proof.accepted.payTo = `0x${"4".repeat(40)}`; proof.payload.authorization.to = proof.accepted.payTo; },
    (proof) => { proof.payload.authorization.to = `0x${"4".repeat(40)}`; },
    (proof) => { proof.accepted.network = "eip155:84532"; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const proof = makePayment(quote, index + 10);
    mutate(proof);
    await assert.rejects(purchase(env, {
      quoteId: quote.acceptanceId, paymentPayload: proof, requestData: {},
    }, { rail }));
  }
  assert.equal(calls.verify.length, 1, "authorization contents are checked by the facilitator; unmatched offers never reach it");
  assert.equal(calls.settle.length, 0);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 0);
});

test("failed Code Mode work is not settled", async (t) => {
  const { env, db } = fixture(t);
  const input = { code: "throw new Error('failed')", language: "javascript", invocationId: "inv-failed" };
  const quote = await createExecutionQuote(env, input);
  const { rail, calls } = createRail();
  let executions = 0;
  await assert.rejects(purchase(env, {
    quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: input,
  }, {
    rail,
    async execute() { executions += 1; return { ok: false, error: "failed" }; },
  }));
  assert.equal(executions, 1);
  assert.equal(calls.settle.length, 0);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments WHERE status='settled'").get().n, 0);
});

test("an execution retry replays the paid result and rejects altered code or extra invocations", async (t) => {
  const { env } = fixture(t);
  const input = { code: "return { answer: 42 }", language: "javascript", invocationId: "inv-42" };
  const quote = await createExecutionQuote(env, input);
  const { rail, calls } = createRail();
  let executions = 0;
  const execute = async () => { executions += 1; return { ok: true, result: { answer: 42 } }; };
  const args = { quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: input };
  const initial = await purchase(env, args, { rail, execute });
  const { paymentId, recoveryToken } = identity(initial);
  const retry = await purchase(env, { ...structuredClone(args), recoveryToken }, { rail, execute });
  assert.equal(retry.body.redelivery, true);
  assert.equal(executions, 1);
  assert.equal(calls.settle.length, 1);
  await assert.rejects(purchase(env, {
    ...args, recoveryToken, requestData: { ...input, code: "return 99" },
  }, { rail, execute }), denied);
  const grant = await recoverGrant(env, paymentId, recoveryToken);
  const recoveredResult = await executeGrantedInvocation(env, grant, input, execute);
  assert.match(JSON.stringify(recoveredResult), /42/);
  await assert.rejects(executeGrantedInvocation(env, grant, { ...input, invocationId: "extra-unpaid-invocation" }, execute), denied);
  assert.equal(executions, 1);
  assert.equal(calls.settle.length, 1);
});
