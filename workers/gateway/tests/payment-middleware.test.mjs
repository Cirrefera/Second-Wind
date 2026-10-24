import test from "node:test";
import assert from "node:assert/strict";
import { encodePaymentSignatureHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { createApp } from "../src/index.js";
import { createQuote, createExecutionQuote } from "../src/commerce.js";
import { createFixtureDb, insertItem } from "./helpers/d1.mjs";
import { createRail, fixtureEnv, makePayment, NETWORK, PAYER, deferred } from "./helpers/fixtures.mjs";

const tx = `0x${"a".repeat(64)}`;
const pending = {success:false,errorReason:"settlement_pending",transaction:tx,network:NETWORK,payer:PAYER};
const settled = {success:true,transaction:tx,network:NETWORK,payer:PAYER};
function fixture(t,overrides = {}) {
  const db = createFixtureDb(); t.after(()=>db.close());
  const item = insertItem(db), env = fixtureEnv(db), {rail,calls} = createRail(overrides);
  let executions = 0;
  const app = createApp({facilitator:rail,execute:async()=>{ executions++; return {ok:true,result:42}; }});
  const buy = (quote,payload = makePayment(quote),config = {}) => app.fetch(new Request(
    `https://secondwindai.com/rpc?quote_id=${quote.acceptanceId}`,{method:"POST",
      headers:{"Content-Type":"application/json","PAYMENT-SIGNATURE":encodePaymentSignatureHeader(payload),"X-Recovery-Token":"p".repeat(43)},
      body:JSON.stringify({quoteId:quote.acceptanceId,config}),
    }),env,{waitUntil(){}});
  return {db,item,env,calls,buy,app,executions:()=>executions};
}

test("SDK pending retry stays uncertain, retains broadcast evidence and cannot start another charge",async t=>{
  const f=fixture(t,{settlePayment:async()=>pending});
  const input={code:"return 42",language:"javascript"},q=await createExecutionQuote(f.env,input),proof=makePayment(q);
  const response=await f.buy(q,proof,input),body=await response.json();
  assert.equal(response.status,409); assert.equal(body.error,"settlement_pending_recovery");
  assert.equal(body.transaction,tx); assert.notEqual(body.charged,false);
  assert.equal(decodePaymentResponseHeader(response.headers.get("PAYMENT-RESPONSE")).errorReason,"settlement_pending");
  assert.equal(f.calls.settle.length,2,"only the SDK owns its bounded identical-payment retry");
  assert.deepEqual(f.calls.settle[0],f.calls.settle[1]); assert.equal(f.executions(),1);
  assert.equal(f.db.sqlite.prepare("SELECT status FROM commerce_purchases").get().status,"uncertain");
  assert.deepEqual({...f.db.sqlite.prepare("SELECT status,tx_hash FROM payments").get()},{status:"verified",tx_hash:tx});
  assert.equal((await f.buy(q,proof,input)).status,409);
  assert.equal(f.calls.settle.length,2); assert.equal(f.calls.verify.length,1); assert.equal(f.executions(),1);
});

test("SDK pending reconciliation can confirm one purchase without executing twice",async t=>{
  let attempts=0;
  const f=fixture(t,{settlePayment:async()=>++attempts===1?pending:settled});
  const input={code:"return 42",language:"javascript"},q=await createExecutionQuote(f.env,input);
  const response=await f.buy(q,makePayment(q),input),body=await response.json();
  assert.equal(response.status,200); assert.equal(body.result,42); assert.equal(body.receipt.tx_hash,tx);
  assert.equal(f.executions(),1); assert.equal(f.calls.settle.length,2);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM deliveries").get().n,1);
});

test("invalid SDK verification cannot create a claim even though afterVerify is invoked",async t=>{
  const f=fixture(t,{verifyPayment:async()=>({isValid:false,invalidReason:"invalid_signature"})});
  const q=await createQuote(f.env,f.item.sku,{}),response=await f.buy(q);
  assert.equal(response.status,402); assert.equal(f.calls.verify.length,1); assert.equal(f.calls.settle.length,0);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM commerce_purchases").get().n,0);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM payments").get().n,0);
});

test("confirmed settlement preserves the SDK receipt header through D1 failure and free repair",async t=>{
  const f=fixture(t),q=await createQuote(f.env,f.item.sku,{}),proof=makePayment(q);
  f.db.sqlite.exec("CREATE TRIGGER receipt_fault BEFORE UPDATE ON payments WHEN NEW.status='settled' BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END");
  const response=await f.buy(q,proof),body=await response.json();
  assert.equal(response.status,503); assert.equal(body.charged,true); assert.equal(body.payment_settled,true);
  const receipt=decodePaymentResponseHeader(response.headers.get("PAYMENT-RESPONSE"));
  assert.equal(receipt.success,true); assert.equal(receipt.transaction,body.receipt.tx_hash);
  f.db.sqlite.exec("DROP TRIGGER receipt_fault");
  const replay=await f.buy(q,proof),recovered=await replay.json();
  assert.equal(replay.status,200); assert.equal(recovered.paymentId,body.paymentId); assert.equal(recovered.redelivery,true);
  assert.equal(f.calls.verify.length,1); assert.equal(f.calls.settle.length,1);
});

test("an unknown unsuccessful settlement never becomes a terminal uncharged purchase",async t=>{
  const f=fixture(t,{settlePayment:async()=>({success:false,errorReason:"unrecognized_provider_outcome",network:NETWORK,transaction:""})});
  const q=await createQuote(f.env,f.item.sku,{}),proof=makePayment(q);
  const response=await f.buy(q,proof),body=await response.json();
  assert.equal(response.status,409); assert.notEqual(body.charged,false);
  assert.equal(f.db.sqlite.prepare("SELECT status FROM commerce_purchases").get().status,"uncertain");
  await f.buy(q,proof); assert.equal(f.calls.settle.length,1);
});

test("prepared replay must pass verification again without re-executing its saved result",async t=>{
  let valid=true;
  const f=fixture(t,{verifyPayment:async()=>({isValid:valid,payer:PAYER})});
  const input={code:"return 42",language:"javascript"},q=await createExecutionQuote(f.env,input),proof=makePayment(q);
  f.db.sqlite.exec("CREATE TRIGGER gate_fault BEFORE UPDATE ON commerce_purchases WHEN NEW.status='settling' BEGIN SELECT RAISE(ABORT,'gate unavailable'); END");
  assert.equal((await f.buy(q,proof,input)).status,503);
  f.db.sqlite.exec("DROP TRIGGER gate_fault"); valid=false;
  assert.equal((await f.buy(q,proof,input)).status,402);
  assert.equal(f.db.sqlite.prepare("SELECT status FROM commerce_purchases").get().status,"prepared");
  assert.equal(f.executions(),1); assert.equal(f.calls.settle.length,0); assert.equal(f.calls.verify.length,2);
});

test("concurrent distinct purchases keep request-local amounts and identities separate",async t=>{
  const entered=deferred(),release=deferred(); let seen=0;
  const f=fixture(t,{verifyPayment:async()=>{if(++seen===2)entered.resolve(); await release.promise;return {isValid:true,payer:PAYER};}});
  const second=insertItem(f.db,{sku:"SW-OTHER",slug:"another-product",price_usd:0.75,guidance:"Second product"});
  const first=await createQuote(f.env,f.item.sku,{}),other=await createQuote(f.env,second.sku,{});
  const a=f.buy(first,makePayment(first,101)),b=f.buy(other,makePayment(other,102));
  await entered.promise; release.resolve();
  const responses=await Promise.all([a,b]); assert.ok(responses.every(r=>r.status===200));
  const [one,two]=await Promise.all(responses.map(r=>r.json()));
  assert.equal(one.receipt.sku,first.sku); assert.equal(two.receipt.sku,other.sku);
  assert.equal(one.receipt.amount_usdc_micros,"250000"); assert.equal(two.receipt.amount_usdc_micros,"750000");
  assert.notEqual(one.paymentId,two.paymentId); assert.equal(f.calls.settle.length,2);
});

test("the bundled Worker runs official payment hooks and free replay in workerd",async t=>{
  const {build}=await import("esbuild");
  const {Miniflare,convertV4MiniflareOptions}=await import("miniflare");
  const {fileURLToPath}=await import("node:url");
  const entry=fileURLToPath(new URL("../src/index.js",import.meta.url));
  const source=`import {createApp} from ${JSON.stringify(entry)};
    let verifies=0,settles=0;
    const app=createApp({facilitator:{
      async getSupported(){return {kinds:[{x402Version:2,scheme:'exact',network:'${NETWORK}'}],extensions:[],signers:{}};},
      async verify(){verifies++;return {isValid:true,payer:'${PAYER}'};},
      async settle(){settles++;return ${JSON.stringify(settled)};}
    },execute:async()=>({ok:true,result:42})});
    export default {fetch(request,env,ctx){
      if(new URL(request.url).pathname==='/test-counts') return Response.json({verifies,settles});
      return app.fetch(request,env,ctx);
    }};`;
  const output=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,
    format:"esm",platform:"browser",conditions:["workerd","worker","browser"],
    alias:{url:"node:url"},external:["cloudflare:*","node:*"]});
  const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,
    compatibilityDate:"2026-10-18",compatibilityFlags:["nodejs_compat"],d1Databases:["SW_DB"],
    r2Buckets:["PAYLOADS","DELIVERIES"],bindings:{X402_PAY_TO:`0x${"1".repeat(40)}`,X402_EXPECTED_PAY_TO:`0x${"1".repeat(40)}`}}));
  t.after(()=>runtime.dispose());
  const schema=createFixtureDb();
  try {
    const d1=await runtime.getD1Database("SW_DB");
    const statements=schema.sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
    await d1.batch(statements.map(({sql})=>d1.prepare(sql)));
  } finally {schema.close();}
  const input={code:"return 42",language:"javascript"};
  const initial=await runtime.dispatchFetch("http://localhost/rpc",{method:"POST",body:JSON.stringify(input)});
  assert.equal(initial.status,402);const q=await initial.json(),proof=makePayment(q);
  const buy=()=>runtime.dispatchFetch(`http://localhost/rpc?quote_id=${q.acceptanceId}`,{method:"POST",
    headers:{"PAYMENT-SIGNATURE":encodePaymentSignatureHeader(proof),"X-Recovery-Token":"p".repeat(43)},body:JSON.stringify(input)});
  const paid=await buy();
  assert.equal(paid.status,200,await paid.clone().text());
  assert.equal((await paid.json()).result,42);
  assert.equal(decodePaymentResponseHeader(paid.headers.get("PAYMENT-RESPONSE")).success,true);
  assert.equal((await (await buy()).json()).redelivery,true);
  assert.deepEqual(await (await runtime.dispatchFetch("http://localhost/test-counts")).json(),{verifies:1,settles:1});
});
