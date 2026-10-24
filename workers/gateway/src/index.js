import {resolveIntent} from './routing.js';
import {describeComponents,trialProduct,recoverTrial,selectTrialComponents,acceptTrialSelection} from './trials.js';
import {prepareTrialAccess} from './trial-access.js';
import { dispatchOutbox,createJourneyContext,enqueueObservation } from './telemetry.js';
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { paymentHandler } from "./payments.js";
import { newWorkersRpcResponse } from "capnweb";
import { decodePaymentSignatureHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { ProductService } from "./product-service.js";
import { describeProduct } from "./catalog.js";
import { createQuote, createExecutionQuote, readQuote, openPurchase, recoverGrant, deliverGrant,
  createRecoveryChallenge, recoverWithWallet, reconcilePurchase } from "./commerce.js";
import { CommerceError, NETWORK, ORIGIN, paymentReadiness, sha256, validToken } from "./contracts.js";
import { toolsDocument, resourcesDocument, openApiDocument, llmsDocument, toolMethod } from "./discovery.js";

async function jsonBody(request, allowEmpty = false) {
  if (Number(request.headers.get("content-length") || 0) > 100_000) throw new CommerceError("request_too_large",413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 100_000) throw new CommerceError("request_too_large",413);
  if (allowEmpty && !text.trim()) return {};
  try {
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body;
  } catch { throw new CommerceError("invalid_json",400); }
}

function signatureFrom(request) {
  if (request.method === "HEAD") return null;
  const header = request.headers.get("PAYMENT-SIGNATURE") || request.headers.get("X-PAYMENT");
  if (!header) return null;
  if (header.length > 24_000) throw new CommerceError("invalid_payment_header",400);
  try { return decodePaymentSignatureHeader(header); }
  catch { throw new CommerceError("invalid_payment_header",400); }
}

function acceptanceFrom(request,payload,body = {}) {
  const params = new URL(request.url).searchParams;
  let embedded;
  try { embedded = new URL(payload?.resource?.url).searchParams; } catch { /* optional */ }
  const ids = [...params.getAll("acceptance_id"), ...params.getAll("quote_id"),
    body.acceptanceId, body.quoteId, ...(embedded?.getAll("acceptance_id") || []),
    ...(embedded?.getAll("quote_id") || [])].filter(value => value !== undefined && value !== null);
  if (ids.some(id => id !== ids[0])) throw new CommerceError("acceptance_mismatch",409);
  return ids[0];
}

function recoveryToken(request,body = {}) {
  const authorization = request.headers.get("Authorization");
  return request.headers.get("X-Recovery-Token") ||
    (authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined) || body.recoveryToken;
}

function retainWork(c,pending) {
  try { c.executionCtx.waitUntil(pending.catch(()=>{})); } catch { /* Local fetch may have no execution context. */ }
}

/** Dependency injection is a test/server-construction seam, never an env bypass. */
export function createApp(dependencies = {}) {
  const app = new Hono();
  const pay = paymentHandler(dependencies);
  app.use("*",contextStorage());
  app.use("*",async(c,next)=>{
    if (c.req.method === "OPTIONS") return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type, PAYMENT-SIGNATURE, X-Recovery-Token, X-Trial-Token, Authorization, Idempotency-Key, X-Journey-Id",
      "Access-Control-Expose-Headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Content-Hash, X-Recovery-Token, X-Payment-Id, X-Worker-Version, X-Journey-Id",
    }});
    const journey=createJourneyContext({journey_id:c.req.header("X-Journey-Id"),transport:"http"});
    c.set("journey",journey);
    await next();
    if (c.res.status === 101 || c.res.webSocket) return;
    c.header("Access-Control-Allow-Origin","*");
    c.header("X-Journey-Id",journey.journey_id);
    c.header("Access-Control-Expose-Headers","PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Content-Hash, X-Recovery-Token, X-Payment-Id, X-Worker-Version, X-Journey-Id");
    if (c.env.CF_VERSION_METADATA?.id) c.header("X-Worker-Version",c.env.CF_VERSION_METADATA.id);
    c.header("Cache-Control","private, no-store");
  });
  app.onError((error,c)=>{
    const known = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599;
    const details = known && error.details && typeof error.details === "object" ? error.details : {};
    if (details.paymentResponse) c.header("PAYMENT-RESPONSE",encodePaymentResponseHeader(details.paymentResponse));
    if (details.retry_after) c.header("Retry-After",String(details.retry_after));
    return c.json({error:known ? error.code || error.message : "service_unavailable",...details},known ? error.status : 503);
  });

  app.get("/health",c=>c.json({ok:true,worker:"secondwind-gateway",mode:"unified",
    network:NETWORK,surfaces:["http-x402:/api/x402/{sku}","http-x402:/rpc","capnweb:/capnp"],do_free:true,
    deployment:c.env.CF_VERSION_METADATA || null}));
  app.get("/api/proof",async c=>{
    let db = false,commerce = false,key = false;
    let tools_live = null;
    try {
      const count = await c.env.SW_DB.prepare("SELECT COUNT(*) AS count FROM items WHERE status='live'").first();
      tools_live = count.count; db = true;
      await c.env.SW_DB.prepare("SELECT payment_id FROM commerce_purchases LIMIT 1").first();
      commerce = true;
    } catch { /* explicit degraded state */ }
    try { const value = JSON.parse(c.env.CDP_FACILITATOR_KEY); key = Boolean(value.id && value.privateKey); } catch { /* below */ }
    const recipientReadiness = paymentReadiness(c.env);
    // Preserve this legacy field's mismatch behavior; the explicit fields below
    // distinguish a valid address from an independently verified recipient.
    const legacyRecipientConfigured = recipientReadiness.payment_recipient_configured
      && ["unverified", "verified"].includes(recipientReadiness.payment_recipient_status);
    const ready = db && commerce && key && recipientReadiness.payment_recipient_verified;
    return c.json({service:"Second Wind",status:ready ? "ready" : "degraded",tools_live,
      payment:{rail:"x402",x402Version:2,network:NETWORK,asset:"USDC",
        payTo_configured:legacyRecipientConfigured,...recipientReadiness,facilitator_configured:key},
      dependencies:{database:db,commerce_schema:commerce,payload_store:Boolean(c.env.PAYLOADS),delivery_store:Boolean(c.env.DELIVERIES)},
      discovery:{tools:`${ORIGIN}/api/tools`,openapi:`${ORIGIN}/openapi.json`,x402_resources:`${ORIGIN}/v2/x402/discovery/resources`},
      note:"Configuration readiness does not assert that a live purchase test has passed."},ready ? 200 : 503);
  });
  app.get("/api/tools",async c=>c.json(await toolsDocument(c.env,{journey:c.get("journey")})));
  app.all("/api/catalog",c=>c.redirect(`/api/tools${new URL(c.req.url).search}`,308));
  app.get("/openapi.json",async c=>c.json(await openApiDocument(c.env,{journey:c.get("journey")})));
  for (const path of ["/.well-known/x402","/v2/x402/discovery/resources","/discovery/resources"])
    app.get(path,async c=>c.json(await resourcesDocument(c.env,{journey:c.get("journey")})));
  app.get("/llms.txt",async c=>c.text(await llmsDocument(c.env,{journey:c.get("journey")})));
  app.post("/api/resolve",async c=>{
    const body = await jsonBody(c.req.raw);
    return c.json(await resolveIntent(c.env,body.intent ?? body.query ?? "",body.limit ?? 10,{journey:c.get("journey")}));
  });
  app.get('/api/products/:sku/components',async c=>{
    const menu=await describeComponents(c.env,c.req.param('sku'));
    await enqueueObservation(c.env,'discovery.described',{journey:c.get('journey'),payload:{sku:menu.sku,product_version_ref:menu.version}});
    return c.json(menu);
  });
  app.post('/api/trials/access',c=>paid(c,false,true));
  app.post('/api/trials',async c=>{
    const b=await jsonBody(c.req.raw);
    const pending=trialProduct(c.env,b.sku,b.config || {},b.input,null,{journey:c.get("journey")});
    // Bounded continuation helps on disconnect; D1 remains the recovery authority.
    retainWork(c,pending);
    return c.json(await pending);
  });
  app.get('/api/trials/:id',async c=>c.json(await recoverTrial(c.env,c.req.param('id'),c.req.header('X-Trial-Token'),{journey:c.get('journey')})));
  app.post('/api/trials/:id/selection',async c=>{
    const b=await jsonBody(c.req.raw);
    return c.json(await selectTrialComponents(c.env,c.req.param('id'),c.req.header('X-Trial-Token'),b.components));
  });
  app.post('/api/trials/:id/accept',async c=>{
    const b=await jsonBody(c.req.raw);
    return c.json(await acceptTrialSelection(c.env,c.req.param('id'),c.req.header('X-Trial-Token'),b.components,b.scope_hash,{journey:c.get("journey")}));
  });
  app.post("/api/configure",async c=>{
    const body = await jsonBody(c.req.raw);
    return c.json(await new ProductService(c.env,c.get("journey")).configure(body.sku,body.config || {}));
  });

  async function paid(c,isRpc = false,isSandbox = false) {
    const body = c.req.method === "POST" ? await jsonBody(c.req.raw,true) : {};
    const paymentPayload = signatureFrom(c.req.raw);
    let quoteId = acceptanceFrom(c.req.raw,paymentPayload,body);
    if (!quoteId && paymentPayload) throw new CommerceError("acceptance_required",400,{hint:"Retry the original accepted purchase URL."});
    let requestData,route,trialToken;
    if (isSandbox) {
      if (!quoteId || body.sku !== undefined || body.input !== undefined || body.config !== undefined) {
        const prepared=await prepareTrialAccess(c.env,body.sku,body.config || {},body.input,{journey:c.get('journey')});
        if (quoteId && quoteId !== prepared.acceptance.acceptanceId) throw new CommerceError('acceptance_mismatch',409);
        quoteId=prepared.acceptance.acceptanceId;
        requestData=prepared.request;
        trialToken=prepared.token;
        const provided=recoveryToken(c.req.raw,body);
        if (provided && provided !== trialToken) throw new CommerceError('trial_unauthorized',401);
      } else {
        const accepted=await readQuote(c.env,quoteId,{allowExpired:Boolean(paymentPayload)});
        requestData=JSON.parse(accepted.config_json);
        trialToken=recoveryToken(c.req.raw,body);
      }
      route='/api/trials/access';
    } else if (isRpc) {
      requestData = body.code !== undefined ? {code:body.code,language:body.language,
        ...(body.invocationId ? {invocationId:body.invocationId} : {})} : body.config || {};
      if (!quoteId) {
        if (body.sku) quoteId = (await createQuote(c.env,body.sku,requestData,{journey:c.get("journey")})).acceptanceId;
        else quoteId = (await createExecutionQuote(c.env,requestData,{journey:c.get("journey")})).acceptanceId;
      }
      route = "/rpc";
    } else {
      const key = c.req.param("key");
      requestData = body.config ?? body;
      if (requestData === body) {
        requestData = {...body}; delete requestData.quoteId; delete requestData.acceptanceId; delete requestData.recoveryToken;
      }
      if (!quoteId) {
        const product = await describeProduct(c.env.SW_DB,key);
        const requiredMethod = toolMethod(product);
        if (c.req.method !== requiredMethod && !(c.req.method === "HEAD" && requiredMethod === "GET")) {
          throw new CommerceError("method_not_allowed",405,{hint:`Use ${requiredMethod} for this product.`});
        }
        if (product.invoke_kind === "bedrock" && c.req.method !== "POST") {
          throw new CommerceError("method_not_allowed",405,{hint:"Use POST with the product's input schema."});
        }
        quoteId = (await createQuote(c.env,key,requestData,{journey:c.get("journey"),purchaseMethod:requiredMethod})).acceptanceId;
      }
      route = `/api/x402/${encodeURIComponent(key)}`;
    }
    const quote = await readQuote(c.env,quoteId,{allowExpired:Boolean(paymentPayload)});
    const purchaseSnapshot=JSON.parse(quote.snapshot_json);
    if (isSandbox) {
      if (purchaseSnapshot.purchase_purpose !== 'sandbox-access') throw new CommerceError('acceptance_product_mismatch',409);
      // The pre-retained trial credential also protects this bound access
      // receipt. A bearer token alone never establishes payment settlement.
      if (paymentPayload && (!validToken(trialToken) || await sha256(trialToken) !== requestData.trial_token_hash))
        throw new CommerceError('trial_unauthorized',401);
    } else if (purchaseSnapshot.purchase_purpose === 'sandbox-access') {
      throw new CommerceError('sandbox_payment_route_required',409,{purchase:'/api/trials/access'});
    }
    if (!isRpc && !isSandbox) {
      const snapshot = JSON.parse(quote.snapshot_json);
      if (c.req.param("key") !== quote.sku && c.req.param("key") !== snapshot.slug) throw new CommerceError("acceptance_product_mismatch",409);
      if (new URL(c.req.url).pathname.endsWith("/artifact") && snapshot.payload?.via !== "r2") {
        throw new CommerceError("unknown_artifact",404);
      }
      // Accepted requests use their immutable method, never today's catalog.
      const expectedMethod = snapshot.purchase_method || (snapshot.invoke_kind === "bedrock" ? "POST" : "GET");
      const acceptedRead = expectedMethod === "GET" && (c.req.method === "GET" || c.req.method === "HEAD");
      if (c.req.method !== expectedMethod && !acceptedRead) {
        throw new CommerceError("method_not_allowed",405,{hint:`Use ${expectedMethod} for this product.`});
      }
      if (acceptedRead || (expectedMethod === "POST" && snapshot.invoke_kind !== "bedrock"
          && body.config === undefined && Object.keys(requestData).length === 0)) {
        requestData = JSON.parse(quote.config_json);
      }
    } else if (isRpc && quote.kind === "product" && body.config === undefined) requestData = JSON.parse(quote.config_json);
    const input = {quoteId,paymentPayload,requestData,
      recoveryToken:isSandbox?trialToken:recoveryToken(c.req.raw,body),journey:c.get("journey")};
    const state = paymentPayload ? await openPurchase(c.env,input) : {env:c.env,quote,input};
    if (c.req.method === "HEAD") {
      // A HEAD request may inspect a resource but never submit a payment.
      const headers = new Headers(c.req.raw.headers);
      headers.delete("PAYMENT-SIGNATURE"); headers.delete("X-PAYMENT");
      c.req.raw = new Request(c.req.raw,{headers});
    }
    const pending = state.response ? Promise.resolve(state.response) : pay(c,state,route);
    try { c.executionCtx.waitUntil(pending.catch(()=>{})); } catch { /* local fetch has no context */ }
    const response = await pending;
    if (!response) return c.res;
    // Historical authenticated replay uses the SDK's header serializer; fresh
    // payment responses already carry the official middleware's headers.
    if (state.response) c.header("PAYMENT-RESPONSE",encodePaymentResponseHeader(response.paymentResponse));
    if (response.body.content_hash) c.header("X-Content-Hash",response.body.content_hash);
    if (!isRpc && new URL(c.req.url).pathname.endsWith("/artifact")) {
      c.header("X-Payment-Id",response.body.paymentId);
      c.header("X-Recovery-Token",response.body.recoveryToken);
      c.header("Content-Type",response.body.artifact.mime_type);
      c.res = c.body(Buffer.from(response.body.artifact.data,"base64"));
      return c.res;
    }
    c.res = c.json(response.body);
    return c.res;
  }
  app.post("/rpc",c=>paid(c,true));
  app.get("/api/x402/:key",c=>paid(c));
  app.post("/api/x402/:key",c=>paid(c));
  app.get("/api/x402/:key/artifact",c=>paid(c));
  app.all("/capnp",c=>newWorkersRpcResponse(c.req.raw,new ProductService(c.env,{...c.get("journey"),transport:"rpc"},pending=>retainWork(c,pending))));
  app.get("/api/purchases/:paymentId/delivery",async c=>{
    const grant = await recoverGrant(c.env,c.req.param("paymentId"),recoveryToken(c.req.raw));
    await enqueueObservation(c.env,"recovery.grant_recovered",{journey:c.get("journey"),payload:{payment_id:grant.paymentId,sku:grant.sku}});
    const body = await deliverGrant(c.env,grant,{journey:c.get("journey")});
    c.header("PAYMENT-RESPONSE",encodePaymentResponseHeader(grant.paymentResponse));
    c.header("X-Content-Hash",body.content_hash);
    if (new URL(c.req.url).searchParams.get("format") === "artifact") {
      if (!body.artifact) throw new CommerceError("unknown_artifact",404);
      c.header("Content-Type",body.artifact.mime_type);
      return c.body(Buffer.from(body.artifact.data,"base64"));
    }
    return c.json(body);
  });
  app.post("/api/purchases/:paymentId/reconcile",async c=>{
    const body = await jsonBody(c.req.raw);
    return c.json(await reconcilePurchase(c.env,c.req.param("paymentId"),
      recoveryToken(c.req.raw,body),{transaction:body.transaction}));
  });
  app.post("/api/purchases/:paymentId/recovery-challenge",async c=>
    c.json(await createRecoveryChallenge(c.env,c.req.param("paymentId"),{journey:c.get("journey")})));
  app.post("/api/purchases/:paymentId/recover",async c=>{
    const body = await jsonBody(c.req.raw);
    return c.json(await recoverWithWallet(c.env,c.req.param("paymentId"),body,{journey:c.get("journey")}));
  });
  app.all("*",c=>c.json({error:c.req.method === "GET" || c.req.method === "HEAD" ? "unknown_path" : "method_not_allowed",
    tools:"/api/tools",openapi:"/openapi.json"},c.req.method === "GET" || c.req.method === "HEAD" ? 404 : 405));
  return app;
}

const app = createApp();
export default {
  fetch: app.fetch,
  async scheduled(_controller, env) {
    await dispatchOutbox(env);
  },
};
