import test from "node:test";
import assert from "node:assert/strict";
import {encodePaymentSignatureHeader} from "@x402/core/http";
import {paymentConfig, paymentReadiness, NETWORK, USDC} from "../src/contracts.js";
import {createApp} from "../src/index.js";
import {createFixtureDb, insertItem} from "./helpers/d1.mjs";
import {createRail, fixtureEnv, makePayment, RECIPIENT} from "./helpers/fixtures.mjs";

// Synthetic offline-test addresses; these are never production destinations.
const otherAddress = `0x${"2".repeat(40)}`;

function fixture(t) {
  const db = createFixtureDb();
  t.after(() => db.close());
  const item = insertItem(db);
  const env = fixtureEnv(db);
  env.CDP_FACILITATOR_KEY = JSON.stringify({id:"offline-fixture", privateKey:"offline-fixture"});
  const {rail, calls} = createRail();
  const app = createApp({rail});
  const call = (path, init = {}) => app.fetch(new Request(`https://secondwindai.com${path}`, init), env, {
    waitUntil() {},
  });
  return {db, item, env, calls, call};
}

test("recipient readiness distinguishes absent, invalid, unverified and mismatched configuration without values", () => {
  const cases = [
    [{}, false, "missing", "payment_rail_not_configured"],
    [{X402_PAY_TO:"not-an-address"}, false, "invalid", "payment_rail_not_configured"],
    [{X402_PAY_TO:17}, false, "invalid", "payment_rail_not_configured"],
    [{X402_PAY_TO:` ${RECIPIENT}`}, false, "invalid", "payment_rail_not_configured"],
    [{X402_PAY_TO:RECIPIENT}, true, "unverified", "payment_recipient_unverified"],
    [{X402_PAY_TO:RECIPIENT, X402_EXPECTED_PAY_TO:"invalid"}, true, "invalid_verification", "payment_recipient_unverified"],
    [{X402_PAY_TO:RECIPIENT, X402_EXPECTED_PAY_TO:otherAddress}, true, "mismatch", "payment_recipient_unverified"],
    [{X402_PAY_TO:RECIPIENT, X402_PAYTO:otherAddress}, false, "conflict", "payment_recipient_conflict"],
  ];
  for (const [env, configured, status, error] of cases) {
    const readiness = paymentReadiness(env);
    assert.deepEqual(readiness, {
      payment_recipient_configured:configured, payment_recipient_verified:false,
      payment_recipient_status:status, payment_configuration_error:error,
    }, status);
    assert.throws(() => paymentConfig(env), err => err.code === error && err.status === 503, status);
    assert.doesNotMatch(JSON.stringify(readiness), /0x[0-9a-fA-F]{40}|not-an-address/);
  }
});

test("matching independent configuration keeps legacy recipient aliases and address casing compatible", () => {
  const lower = `0x${"a".repeat(40)}`;
  const upper = `0x${"A".repeat(40)}`;
  for (const name of ["X402_PAY_TO", "X402_PAYTO", "X402_PAYTO_PUBLIC"]) {
    const env = {[name]:upper, X402_EXPECTED_PAY_TO:lower};
    assert.equal(paymentConfig(env).payTo, upper);
    assert.deepEqual(paymentReadiness(env), {
      payment_recipient_configured:true, payment_recipient_verified:true,
      payment_recipient_status:"verified", payment_configuration_error:null,
    });
  }
  assert.equal(paymentConfig({X402_PAY_TO:upper, X402_PAYTO_PUBLIC:lower, X402_EXPECTED_PAY_TO:lower}).payTo, upper);
});

test("known burn destinations cannot become recipients or independent verification assertions", () => {
  for (const burn of [
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dEaD",
    "0x0000000000000000000000000000000000000001",
    "0xdead000000000000000042069420694206942069",
  ]) {
    const env = {X402_PAY_TO:burn, X402_EXPECTED_PAY_TO:burn};
    assert.throws(() => paymentConfig(env), /payment_rail_not_configured/);
    assert.equal(paymentReadiness(env).payment_recipient_status, "burn");
    assert.equal(paymentReadiness(env).payment_recipient_verified, false);
    const invalidAssertion = {X402_PAY_TO:RECIPIENT, X402_EXPECTED_PAY_TO:burn};
    assert.equal(paymentReadiness(invalidAssertion).payment_recipient_status, "invalid_verification");
    assert.throws(() => paymentConfig(invalidAssertion), /payment_recipient_unverified/);
  }
});

test("an unsupported network remains unconfigured even with a matching recipient", () => {
  const env = {X402_PAY_TO:RECIPIENT, X402_EXPECTED_PAY_TO:RECIPIENT, X402_NETWORK:"eip155:84532"};
  assert.throws(() => paymentConfig(env), /unsupported_payment_network/);
  assert.deepEqual(paymentReadiness(env), {
    payment_recipient_configured:false, payment_recipient_verified:false,
    payment_recipient_status:"unsupported_network", payment_configuration_error:"unsupported_payment_network",
  });
});

test("an unverified recipient publishes no payable requirements and cannot create a quote", async t => {
  const {env, db, calls, call, item} = fixture(t);
  delete env.X402_EXPECTED_PAY_TO;
  const proofResponse = await call("/api/proof");
  assert.equal(proofResponse.status, 503);
  const proof = await proofResponse.json();
  assert.equal(proof.payment.payTo_configured, true);
  assert.equal(proof.payment.payment_recipient_configured, true);
  assert.equal(proof.payment.payment_recipient_verified, false);
  assert.equal(proof.payment.payment_recipient_status, "unverified");
  assert.equal(proof.payment.payment_configuration_error, "payment_recipient_unverified");
  assert.doesNotMatch(JSON.stringify(proof), new RegExp(RECIPIENT));
  for (const path of ["/.well-known/x402", "/v2/x402/discovery/resources", "/discovery/resources"]) {
    const response = await call(path);
    assert.equal(response.status, 200);
    const discovery = await response.json();
    assert.equal(discovery.payment_configured, false);
    assert.equal(discovery.payment_recipient_status, "unverified");
    assert.ok(discovery.items.length > 0);
    assert.ok(discovery.items.every(item => item.accepts.length === 0));
    assert.doesNotMatch(JSON.stringify(discovery), new RegExp(RECIPIENT));
  }
  const response = await call("/api/quotes", {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({sku:item.sku}),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "payment_recipient_unverified");
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM commerce_quotes").get().n, 0);
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.settle.length, 0);
});

test("proof and discovery expose only sanitized reasons for invalid and mismatched recipients", async t => {
  for (const [patch, status, configured] of [
    [{X402_PAY_TO:"malformed-private-setting"}, "invalid", false],
    [{X402_PAY_TO:undefined}, "missing", false],
    [{X402_PAY_TO:"0x000000000000000000000000000000000000dEaD"}, "burn", false],
    [{X402_EXPECTED_PAY_TO:otherAddress}, "mismatch", true],
  ]) {
    await t.test(status, async subtest => {
      const {env, call, calls} = fixture(subtest);
      Object.assign(env, patch);
      const response = await call("/api/proof");
      assert.equal(response.status, 503);
      const proof = await response.json();
      assert.equal(proof.payment.payment_recipient_configured, configured);
      assert.equal(proof.payment.payTo_configured, false);
      assert.equal(proof.payment.payment_recipient_verified, false);
      assert.equal(proof.payment.payment_recipient_status, status);
      assert.doesNotMatch(JSON.stringify(proof), /0x[0-9a-fA-F]{40}|malformed-private-setting/);
      const discovery = await (await call("/.well-known/x402")).json();
      assert.equal(discovery.payment_configured, false);
      assert.ok(discovery.items.every(item => item.accepts.length === 0));
      assert.equal(calls.verify.length, 0);
      assert.equal(calls.settle.length, 0);
    });
  }
});

test("verified recipient discovery publishes the exact intended requirements", async t => {
  const {call, item, calls} = fixture(t);
  const proofResponse = await call("/api/proof");
  assert.equal(proofResponse.status, 200);
  const proof = await proofResponse.json();
  assert.equal(proof.payment.payment_recipient_status, "verified");
  assert.equal(proof.payment.payment_configuration_error, null);
  const discovery = await (await call("/.well-known/x402")).json();
  assert.equal(discovery.payment_configured, true);
  assert.deepEqual(discovery.items.find(entry => entry.sku === item.sku).accepts, [{
    scheme:"exact", network:NETWORK, asset:USDC, payTo:RECIPIENT,
    amount:"250000", maxTimeoutSeconds:300, extra:{name:"USD Coin", version:"2"},
  }]);
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.settle.length, 0);
});

test("loss of recipient verification blocks an unpurchased quote before any payment call", async t => {
  const {call, env, item, calls, db} = fixture(t);
  const quote = await (await call(`/api/x402/${item.sku}`)).json();
  const signature = encodePaymentSignatureHeader(makePayment(quote));
  delete env.X402_EXPECTED_PAY_TO;
  const response = await call(`/api/x402/${item.sku}?quote_id=${quote.quoteId}`, {
    headers:{"PAYMENT-SIGNATURE":signature},
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "payment_recipient_unverified");
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM commerce_purchases").get().n, 0);
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.settle.length, 0);
});

test("recipient configuration failures preserve paid recovery and original receipt identity", async t => {
  const {call, env, item, calls} = fixture(t);
  const quote = await (await call(`/api/x402/${item.sku}`)).json();
  const signature = encodePaymentSignatureHeader(makePayment(quote));
  const purchasePath = `/api/x402/${item.sku}?quote_id=${quote.quoteId}`;
  const paidResponse = await call(purchasePath, {headers:{"PAYMENT-SIGNATURE":signature}});
  assert.equal(paidResponse.status, 200);
  const paid = await paidResponse.json();
  delete env.X402_EXPECTED_PAY_TO;
  const recovered = await call(`/api/purchases/${paid.paymentId}/delivery`, {
    headers:{"X-Recovery-Token":paid.recoveryToken},
  });
  assert.equal(recovered.status, 200);
  const delivery = await recovered.json();
  assert.equal(delivery.content_hash, paid.content_hash);
  assert.equal(delivery.guidance, item.guidance);
  assert.equal(delivery.receipt.tx_hash, paid.receipt.tx_hash);
  const replay = await call(purchasePath, {
    headers:{"PAYMENT-SIGNATURE":signature, "X-Recovery-Token":paid.recoveryToken},
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).redelivery, true);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
});
