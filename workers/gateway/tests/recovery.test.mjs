import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import {
  createQuote, purchase, recoverGrant, createRecoveryChallenge, recoverWithWallet,
} from "../src/commerce.js";
import { createFixtureDb, insertItem } from "./helpers/d1.mjs";
import { fixtureEnv, createRail, makePayment } from "./helpers/fixtures.mjs";

// Public synthetic test keys, never wallet configuration and never used on-chain.
const buyer = privateKeyToAccount(`0x${"a".repeat(64)}`);
const stranger = privateKeyToAccount(`0x${"b".repeat(64)}`);

async function paidFixture(t) {
  const db = createFixtureDb();
  t.after(() => db.close());
  const env = fixtureEnv(db);
  const item = insertItem(db);
  const quote = await createQuote(env, item.sku, {});
  const paymentPayload = makePayment(quote);
  paymentPayload.payload.authorization.from = buyer.address;
  const { rail, calls } = createRail({
    async verifyPayment() { return { isValid: true, payer: buyer.address }; },
    async settlePayment() {
      return { success: true, transaction: `0x${"c".repeat(64)}`, network: "eip155:8453", payer: buyer.address };
    },
  });
  const paid = await purchase(env, { quoteId: quote.quoteId, paymentPayload, requestData: {} }, { rail });
  return { db, env, calls, ...paid.body };
}

test("wallet-signed recovery checks ownership, rotates the private token and consumes its challenge once", async (t) => {
  const { env, paymentId, recoveryToken: originalToken, calls } = await paidFixture(t);
  const challenge = await createRecoveryChallenge(env, paymentId);
  assert.equal(typeof challenge.challengeId, "string");
  assert.match(challenge.message, /secondwindai\.com/);
  assert.ok(challenge.message.includes(paymentId));
  const wrongProof = {
    challengeId: challenge.challengeId,
    signature: await stranger.signMessage({ message: challenge.message }),
  };
  await assert.rejects(recoverWithWallet(env, paymentId, wrongProof));
  const proof = {
    challengeId: challenge.challengeId,
    signature: await buyer.signMessage({ message: challenge.message }),
  };
  const recovered = await recoverWithWallet(env, paymentId, proof);
  assert.equal(recovered.paymentId, paymentId);
  assert.equal(typeof recovered.recoveryToken, "string");
  assert.notEqual(recovered.recoveryToken, originalToken);
  await assert.rejects(recoverGrant(env, paymentId, originalToken));
  assert.equal((await recoverGrant(env, paymentId, recovered.recoveryToken)).paymentId, paymentId);
  await assert.rejects(recoverWithWallet(env, paymentId, proof));
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
});

test("expired recovery challenges cannot authorize a new token", async (t) => {
  const { env, db, paymentId, recoveryToken, calls } = await paidFixture(t);
  const challenge = await createRecoveryChallenge(env, paymentId);
  const signature = await buyer.signMessage({ message: challenge.message });
  db.sqlite.prepare("UPDATE commerce_recovery_challenges SET expires_at=1 WHERE id=?").run(challenge.challengeId);
  await assert.rejects(recoverWithWallet(env, paymentId, { challengeId: challenge.challengeId, signature }));
  assert.equal((await recoverGrant(env, paymentId, recoveryToken)).paymentId, paymentId);
  assert.equal(calls.settle.length, 1);
});
