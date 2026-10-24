import {buyerView,publicProduct} from '../src/public-identity.js';
import test from "node:test";
import assert from "node:assert/strict";
import {
  RpcTarget, newHttpBatchRpcSession, newHttpBatchRpcResponse, newMessagePortRpcSession,
} from "capnweb";
import { ProductService } from "../src/product-service.js";
import { purchase } from "./helpers/purchase.mjs";
import { createQuote, deliverGrant, recoverGrant } from "../src/commerce.js";
import { describeProduct, searchCatalog } from "../src/catalog.js";
import { createFixtureDb, insertItem } from "./helpers/d1.mjs";
import { fixtureEnv, makePayment, createRail } from "./helpers/fixtures.mjs";

function fixture(t) {
  const db = createFixtureDb();
  t.after(() => db.close());
  const item = insertItem(db);
  return { db, item, env: fixtureEnv(db) };
}

test("Cap'n Web and plain product calls expose the same public contract", async (t) => {
  const { db, item, env } = fixture(t);
  const service = new ProductService(env);
  assert.deepEqual(await service.describe(item.sku), publicProduct(await describeProduct(db, item.sku)));
  assert.deepEqual(await service.search("recovery", 10), (await searchCatalog(db, "recovery", 10)).map(publicProduct));
  assert.deepEqual(await service.describeProduct(item.sku), await service.describe(item.sku));
  assert.equal(Object.hasOwn(service, "env"), false, "RPC roots do not expose raw bindings");
  assert.equal(Object.hasOwn(service, "grant"), false);
});

test("getGrant and recoverSession both require the secret purchase credential", async (t) => {
  const { env, item } = fixture(t);
  const service = new ProductService(env);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  const paid = await purchase(env, { quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: {} }, { rail });
  const { paymentId, recoveryToken } = paid.body;
  for (const method of ["getGrant", "recoverSession"]) {
    await assert.rejects(service[method](paymentId));
    await assert.rejects(service[method](paymentId, "not-the-owner"));
    const capability = await service[method](paymentId, recoveryToken);
    assert.equal((await capability.info()).paymentId, paymentId);
    assert.equal(Object.hasOwn(capability, "env"), false);
    assert.equal(Object.hasOwn(capability, "grant"), false);
  }
  assert.equal(calls.settle.length, 1);
});

test("dependent grant→info/delivery calls pipeline in one actual HTTP batch", async (t) => {
  const { env, item } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  const paid = await purchase(env, { quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: {} }, { rail });
  const { paymentId, recoveryToken } = paid.body;
  const expected = await deliverGrant(env, await recoverGrant(env, paymentId, recoveryToken));
  const realFetch = globalThis.fetch;
  let roundTrips = 0;
  globalThis.fetch = async (input, init) => {
    roundTrips += 1;
    const request = new Request(input, init);
    assert.equal(request.url, "https://secondwindai.com/capnp");
    return newHttpBatchRpcResponse(request, new ProductService(env));
  };
  try {
    const session = newHttpBatchRpcSession("https://secondwindai.com/capnp");
    // The second and third calls target the capability returned by the first.
    // This demonstrates dependent promise pipelining, not merely batching.
    const capability = session.getGrant(paymentId, recoveryToken);
    const infoPromise = capability.info();
    const deliveryPromise = capability.deliver();
    const [info, delivered] = await Promise.all([infoPromise, deliveryPromise]);
    assert.equal(roundTrips, 1);
    assert.equal(info.paymentId, paymentId);
    assert.equal(info.slug, item.slug);
    assert.deepEqual(delivered, await buyerView(env.SW_DB,expected));
    assert.equal(calls.settle.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("bidirectional progress callbacks cross a real RPC session, and reconnect recovers the same purchase", async (t) => {
  const { env, item } = fixture(t);
  const quote = await createQuote(env, item.sku, {});
  const { rail, calls } = createRail();
  const paid = await purchase(env, { quoteId: quote.acceptanceId, paymentPayload: makePayment(quote), requestData: {} }, { rail });
  const { paymentId, recoveryToken } = paid.body;
  const progress = [];
  class Progress extends RpcTarget {
    report(stage, details) { progress.push({ stage, details }); }
  }
  function connect() {
    const channel = new MessageChannel();
    const server = newMessagePortRpcSession(channel.port1, new ProductService(env));
    const client = newMessagePortRpcSession(channel.port2);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      client[Symbol.dispose]();
      server[Symbol.dispose]();
      channel.port1.close();
      channel.port2.close();
    };
    t.after(close);
    return { client, close };
  }
  const first = connect();
  const firstGrant = await first.client.getGrant(paymentId, recoveryToken);
  const delivered = await firstGrant.deliver(new Progress());
  assert.equal(delivered.paymentId, paymentId);
  assert.deepEqual(progress.map((event) => event.stage), ["start", "complete"]);
  assert.equal(progress[0].details.operation, "delivery");
  assert.equal(progress[1].details.ok, true);
  firstGrant[Symbol.dispose]();
  first.close();

  const second = connect();
  const recoveredGrant = await second.client.recoverSession(paymentId, recoveryToken);
  const recovered = await recoveredGrant.deliver(new Progress());
  assert.deepEqual(recovered, delivered);
  assert.equal(progress.length, 4);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.settle.length, 1);
  recoveredGrant[Symbol.dispose]();
});

test('free product selection, configuration pipeline in one HTTP round trip', async t => {
 const {env,item}=fixture(t);
 const realFetch=globalThis.fetch; let trips=0;
 globalThis.fetch=async(input,init)=>{trips++;return newHttpBatchRpcResponse(new Request(input,init),new ProductService(env));};
 try {
  const client=newHttpBatchRpcSession('https://secondwindai.com/capnp');
  const quote=await client.select(item.sku).configure({}).configuration();
  assert.equal(quote.slug,item.slug); assert.equal(trips,1);
 } finally {globalThis.fetch=realFetch;}
});

test('buyer answers the exact language question over bidirectional RPC before purchase',async t=>{
 const {env,item,db}=fixture(t);
 db.sqlite.prepare('UPDATE items SET input_schema=? WHERE sku=?').run(JSON.stringify({type:'object',required:['language'],properties:{language:{enum:['python']}},additionalProperties:false}),item.sku);
 const channel=new MessageChannel();
 const server=newMessagePortRpcSession(channel.port1,new ProductService(env));
 const client=newMessagePortRpcSession(channel.port2);
 t.after(()=>{client[Symbol.dispose]();server[Symbol.dispose]();channel.port1.close();channel.port2.close();});
 let questions;
 class Buyer extends RpcTarget {clarify(q){questions=q;return {language:'python'};}}
 const configured=await client.select(item.sku).configure({},new Buyer());
 assert.equal(questions[0].question,'What programming language do you want the product delivered in?');
 assert.equal((await configured.configuration()).config.language,'python');
 configured[Symbol.dispose]();
});

test('selected capabilities reject catalog changes and incomplete configuration',async t=>{
 const {env,item,db}=fixture(t); const service=new ProductService(env);
 const product=await service.select(item.sku);
 assert.equal(product.configuration().ok,false);
 const configured=await product.configure({});
 db.sqlite.prepare('UPDATE items SET guidance=? WHERE sku=?').run('changed deliverable',item.sku);
 await assert.rejects(configured.compatibility(),/product_changed/);
});
