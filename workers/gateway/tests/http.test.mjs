import test from "node:test";
import assert from "node:assert/strict";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { newHttpBatchRpcSession } from "capnweb";
import { createApp } from "../src/index.js";
import { createFixtureDb, insertItem } from "./helpers/d1.mjs";
import { createRail, fixtureEnv, makePayment, sha256 } from "./helpers/fixtures.mjs";

function fixture(t, dependencies = {}) {
  const db = createFixtureDb();
  t.after(() => db.close());
  const item = insertItem(db);
  const env = fixtureEnv(db);
  // Readiness checks shape only. This is never passed to a real facilitator.
  env.CDP_FACILITATOR_KEY = JSON.stringify({ id: "offline-fixture", privateKey: "offline-fixture" });
  const { rail, calls } = createRail();
  const app = createApp({ facilitator:rail, ...dependencies });
  const call = (path, init = {}) => app.fetch(new Request(`https://secondwindai.com${path}`, init), env, {
    waitUntil() {},
  });
  return { db, item, env, app, calls, call };
}

function signedHeaders(payload, token) {
  return {
    "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload),
    ...(token ? { "X-Recovery-Token": token } : {}),
  };
}

test('HTTP and Capn Web preserve opaque journey correlation across discovery, payment and free recovery',async t=>{
 const {call,item,db,app,env,calls}=fixture(t);
 const catalog=await call('/api/tools');const journeyId=catalog.headers.get('X-Journey-Id');
 assert.match(journeyId,/^jrn_[0-9a-f-]{36}$/);
 const unsigned=await call(`/api/x402/${item.sku}`,{headers:{'X-Journey-Id':journeyId}});
 const quote=await unsigned.json();
 const payment=makePayment({...quote,amount_usdc_micros:'250000'});
 const paidResponse=await call(`/api/x402/${item.sku}?quote_id=${quote.acceptanceId}`,{headers:{...signedHeaders(payment),'X-Journey-Id':journeyId}});
 assert.equal(paidResponse.headers.get('X-Journey-Id'),journeyId);
 const paid=await paidResponse.json();assert.ok(paid.paymentId);
 const realFetch=globalThis.fetch;
 globalThis.fetch=(url,init)=>app.fetch(new Request(url,{...init,headers:{...init?.headers,'X-Journey-Id':journeyId}}),env,{waitUntil(){}});
 try {
  const client=newHttpBatchRpcSession('https://secondwindai.com/capnp');
  assert.equal((await client.getGrant(paid.paymentId,paid.recoveryToken).deliver()).guidance,item.guidance);
 } finally {globalThis.fetch=realFetch;}
 const events=db.sqlite.prepare('SELECT event_type,payload FROM business_event_outbox').all();
 for(const type of ['discovery.described','journey.linked','delivery.prepared','recovery.grant_recovered']) {
  const observed=events.filter(e=>e.event_type===type);assert.ok(observed.length,type);
  assert.ok(observed.every(e=>JSON.parse(e.payload).journey_id===journeyId),type);
 }
 assert.equal(calls.settle.length,1);
 const preflight=await call('/api/quotes',{method:'OPTIONS'});
 assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/X-Journey-Id/);
 const replaced=await call('/health',{headers:{'X-Journey-Id':'buyer-private-free-text'}});
 assert.notEqual(replaced.headers.get('X-Journey-Id'),'buyer-private-free-text');
 assert.doesNotMatch(JSON.stringify(events),new RegExp(paid.recoveryToken));
});

test("all public discovery aliases serve one live catalog and exclude paid content", async (t) => {
  const { call, item, calls } = fixture(t);
  const paths = [
    "/api/tools", "/api/proof", "/openapi.json", "/.well-known/x402",
    "/llms.txt", "/v2/x402/discovery/resources", "/discovery/resources",
  ];
  for (const path of paths) {
    const response = await call(path);
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /Paid version one/, path);
  }
  const resources = await (await call("/.well-known/x402")).json();
  assert.deepEqual(await (await call("/discovery/resources")).json(), resources);
  assert.deepEqual(await (await call("/v2/x402/discovery/resources")).json(), resources);
  assert.match(JSON.stringify(await (await call("/api/tools")).json()), new RegExp(item.sku));
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.settle.length, 0);
});

test("HTTP purchase, HTTP replay and Cap'n Web recovery share one paid purchase", async (t) => {
  const { call, item, app, env, calls, db } = fixture(t);
  const unsigned = await call(`/api/x402/${item.sku}`);
  assert.equal(unsigned.status, 402);
  const required = decodePaymentRequiredHeader(unsigned.headers.get("PAYMENT-REQUIRED"));
  const challenge = await unsigned.json();
  assert.equal(required.accepts[0].amount, "250000");
  assert.ok(challenge.acceptanceId);
  assert.match(challenge.content_hash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(challenge), /Paid version one/);
  const payment = makePayment({ ...challenge, price_usdc_micros: required.accepts[0].amount });
  payment.resource = required.resource;
  const paidResponse = await call(new URL(required.resource.url).pathname + new URL(required.resource.url).search, {
    headers: signedHeaders(payment),
  });
  assert.equal(paidResponse.status, 200, await paidResponse.clone().text());
  assert.ok(paidResponse.headers.get("PAYMENT-RESPONSE"));
  const paid = await paidResponse.json();
  assert.equal(paid.guidance, item.guidance);
  assert.equal(paid.redelivery, false);

  const unsignedRecovery = await call(`/api/purchases/${paid.paymentId}/delivery`);
  assert.equal(unsignedRecovery.status, 401);
  const replay = await call("/rpc", {
    method: "POST",
    headers: { ...signedHeaders(payment, paid.recoveryToken), "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId: challenge.acceptanceId, config: {} }),
  });
  assert.equal(replay.status, 200, await replay.clone().text());
  const replayed = await replay.json();
  assert.equal(replayed.paymentId, paid.paymentId);
  assert.equal(replayed.redelivery, true);
  assert.equal(replayed.content_hash, paid.content_hash);

  const realFetch = globalThis.fetch;
  let batchCount = 0;
  globalThis.fetch = async (input, init) => {
    batchCount += 1;
    return app.fetch(new Request(input, init), env, { waitUntil() {} });
  };
  try {
    const session = newHttpBatchRpcSession("https://secondwindai.com/capnp");
    const capability = session.recoverSession(paid.paymentId, paid.recoveryToken);
    const delivered = await capability.deliver();
    assert.equal(batchCount, 1);
    assert.equal(delivered.paymentId, paid.paymentId);
    assert.equal(delivered.guidance, paid.guidance);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM payments").get().n, 1);
});

test("HEAD requests never submit a signed payment for verification or settlement", async (t) => {
  const { call, item, calls } = fixture(t);
  const challenge = await (await call(`/api/x402/${item.sku}`)).json();
  const payment = makePayment(challenge);
  const response = await call(`/api/x402/${item.sku}?quote_id=${challenge.acceptanceId}`, {
    method: "HEAD", headers: signedHeaders(payment),
  });
  assert.equal(response.status, 402);
  assert.equal(await response.text(), "");
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.settle.length, 0);
});

test("a delivery failure after settlement returns the receipt and credential needed for free recovery", async (t) => {
  const { call, item, db, calls } = fixture(t);
  const challenge = await (await call(`/api/x402/${item.sku}`)).json();
  const payment = makePayment(challenge);
  db.sqlite.exec(`CREATE TRIGGER fixture_delivery_audit_failure BEFORE INSERT ON deliveries
    BEGIN SELECT RAISE(ABORT, 'fixture delivery audit write failure'); END`);
  const failed = await call(`/api/x402/${item.sku}?quote_id=${challenge.acceptanceId}`, {
    headers: signedHeaders(payment),
  });
  assert.equal(failed.status, 503);
  assert.ok(failed.headers.get("PAYMENT-RESPONSE"));
  const recovery = await failed.json();
  assert.equal(recovery.error, "delivery_pending");
  assert.equal(recovery.charged, true);
  assert.equal(recovery.payment_settled, true);
  assert.equal(typeof recovery.recoveryToken, "string");
  assert.match(recovery.receipt.tx_hash, /^0x[0-9a-f]{64}$/i);
  db.sqlite.exec("DROP TRIGGER fixture_delivery_audit_failure");
  const delivered = await call(recovery.recovery, {
    headers: { "X-Recovery-Token": recovery.recoveryToken },
  });
  assert.equal(delivered.status, 200);
  const body = await delivered.json();
  assert.equal(body.paymentId, recovery.paymentId);
  assert.equal(body.guidance, item.guidance);
  assert.equal(body.redelivery, true);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
});

test("RPC execution requires explicit valid input before payment and settles a successful result once", async (t) => {
  let executions = 0;
  const { call, calls } = fixture(t, {
    async execute() { executions += 1; return { ok: true, result: 42 }; },
  });
  const post = (body, headers = {}) => call("/rpc", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  assert.equal((await post({ code: "return 42" })).status, 400);
  const input = { code: "return 42", language: "javascript", invocationId: "http-invocation" };
  const first = await post(input);
  assert.equal(first.status, 402);
  const challenge = await first.json();
  const payment = makePayment(challenge);
  payment.resource.url = challenge.retry_url;
  const response = await post({ ...input, quoteId: challenge.acceptanceId }, signedHeaders(payment));
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  assert.equal(result.result, 42);
  assert.equal(result.receipt.amount_usdc_micros, "2000");
  const replay = await post({ ...input, quoteId: challenge.acceptanceId }, signedHeaders(payment, result.recoveryToken));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).redelivery, true);
  assert.equal(executions, 1);
  assert.equal(calls.settle.length, 1);
});

test("invalid paths, methods and conflicting wallet configuration fail without spending", async (t) => {
  const { call, env, calls } = fixture(t);
  assert.equal((await call("/api/x402/does-not-exist")).status, 404);
  assert.equal((await call("/api/tools", { method: "POST" })).status, 405);
  const options = await call("/rpc", { method: "OPTIONS" });
  assert.equal(options.status, 204);
  assert.match(options.headers.get("Access-Control-Allow-Headers"), /X-Recovery-Token/);
  env.X402_PAYTO = `0x${"4".repeat(40)}`;
  assert.equal((await call("/api/proof")).status, 503);
  const response = await call("/api/x402/SW-PT-0006");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "payment_recipient_conflict");
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.settle.length, 0);
});

test("the artifact endpoint delivers exact bytes and authenticated artifact redelivery is free", async (t) => {
  const { call, item, env, db, calls } = fixture(t);
  const key = `payloads/${item.sku}/v1/product.bin`;
  const bytes = new Uint8Array([0, 1, 255, 128, ...new TextEncoder().encode("Exact artifact: caf\u00e9\n")]);
  const hash = sha256(bytes);
  db.sqlite.prepare("UPDATE items SET kind='artifact',invoke_kind='r2',invoke_key=?,mime_type=? WHERE sku=?")
    .run(key, "application/octet-stream", item.sku);
  db.sqlite.prepare(`INSERT INTO payload_objects
    (id,sku,r2_bucket,r2_key,content_hash,size_bytes,mime_type,version)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run("po_http_artifact", item.sku, "secondwind-payloads", key, hash, bytes.length, "application/octet-stream", 1);
  await env.PAYLOADS.put(key, bytes);
  const challenge = await (await call(`/api/x402/${item.sku}/artifact`)).json();
  const payment = makePayment(challenge);
  const response = await call(`/api/x402/${item.sku}/artifact?quote_id=${challenge.acceptanceId}`, {
    headers: signedHeaders(payment),
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(response.headers.get("X-Content-Hash"), hash);
  assert.ok(response.headers.get("PAYMENT-RESPONSE"));
  const paymentId = response.headers.get("X-Payment-Id");
  const token = response.headers.get("X-Recovery-Token");
  assert.match(paymentId, /^pay_/);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  const redelivered = await call(`/api/purchases/${paymentId}/delivery?format=artifact`, {
    headers: { "X-Recovery-Token": token },
  });
  assert.equal(redelivered.status, 200);
  assert.equal(redelivered.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(redelivered.headers.get("X-Content-Hash"), hash);
  assert.ok(redelivered.headers.get("PAYMENT-RESPONSE"));
  assert.deepEqual(new Uint8Array(await redelivered.arrayBuffer()), bytes);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
});

test("a completed payment replay without its generated recovery token identifies the wallet recovery path", async (t) => {
  const { call, item, calls } = fixture(t);
  const challenge = await (await call(`/api/x402/${item.sku}`)).json();
  const payment = makePayment(challenge);
  const path = `/api/x402/${item.sku}?quote_id=${challenge.acceptanceId}`;
  const first = await call(path, { headers: signedHeaders(payment) });
  assert.equal(first.status, 200);
  const paid = await first.json();
  assert.match(paid.recoveryToken, /^[A-Za-z0-9_-]{43}$/);
  const replay = await call(path, { headers: signedHeaders(payment) });
  assert.equal(replay.status, 401);
  const error = await replay.json();
  assert.equal(error.error, "recovery_required");
  assert.equal(error.paymentId, paid.paymentId);
  assert.equal(error.recovery_challenge, `/api/purchases/${paid.paymentId}/recovery-challenge`);
  assert.equal(Object.hasOwn(error, "recoveryToken"), false);
  assert.doesNotMatch(JSON.stringify(error), /Paid version one/);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
});

test('quote APIs are removed; whole-product requests use the official challenge directly',async t=>{
 const {call,item,calls,env,db}=fixture(t);
 for(const path of ['/api/quotes','/api/purchases/accept']) {
  assert.equal((await call(path,{method:'POST',body:JSON.stringify({sku:item.sku,config:{}})})).status,405);
 }
 const {ProductService}=await import('../src/product-service.js');const service=new ProductService(env);
 const selected=await service.select(item.sku);
 assert.equal(service.quote,undefined);assert.equal(service.quoteProduct,undefined);assert.equal(selected.quote,undefined);
 assert.equal(service.accept,undefined,'no renamed quoting stage');
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM commerce_quotes').get().n,0);
 const response=await call('/rpc',{method:'POST',body:JSON.stringify({sku:item.sku,config:{}})});
 assert.equal(response.status,402);const body=await response.json();
 assert.equal(body.quoteId,undefined);assert.ok(body.acceptanceId);
 const required=decodePaymentRequiredHeader(response.headers.get('PAYMENT-REQUIRED'));
 assert.equal(required.accepts[0].amount,'250000');
 assert.equal(calls.verify.length,0);assert.equal(calls.settle.length,0);
});

test('historical signed purchase URLs remain recoverable and conflicting identifiers are rejected',async t=>{
 const {call,item,calls}=fixture(t);
 const initial=await call(`/api/x402/${item.sku}`),accepted=await initial.json();
 const legacy=`https://secondwindai.com/api/x402/${item.sku}?quote_id=${accepted.acceptanceId}`;
 const proof=makePayment(accepted);proof.resource.url=legacy;
 const wrong='q_00000000-0000-4000-8000-000000000000';
 for(const path of [`${legacy}&acceptance_id=${wrong}`,`${legacy}&quote_id=${wrong}`]) {
  const response=await call(path.replace('https://secondwindai.com',''),{headers:signedHeaders(proof)});
  assert.equal(response.status,409);assert.equal((await response.json()).error,'acceptance_mismatch');
 }
 assert.equal(calls.verify.length,0);
 const path=new URL(legacy).pathname+new URL(legacy).search;
 const paid=await call(path,{headers:signedHeaders(proof)});assert.equal(paid.status,200);
 const body=await paid.json();
 const replay=await call(path,{headers:signedHeaders(proof,body.recoveryToken)});
 assert.equal(replay.status,200);assert.equal((await replay.json()).paymentId,body.paymentId);
 assert.equal(calls.settle.length,1);
});
