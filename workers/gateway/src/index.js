import { Hono } from "hono";
import { newWorkersRpcResponse } from "capnweb";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { ProductService } from "./product-service.js";
import { describeProduct, searchCatalog, checkConfiguration } from "./catalog.js";
import { createQuote, createExecutionQuote, readQuote, purchase, recoverGrant, deliverGrant,
  createRecoveryChallenge, recoverWithWallet } from "./commerce.js";
import { CommerceError, NETWORK, ORIGIN, paymentConfig, paymentReadiness, requirementsFor } from "./contracts.js";
import { toolsDocument, resourcesDocument, openApiDocument, llmsDocument } from "./discovery.js";

async function jsonBody(request) {
  if (Number(request.headers.get("content-length") || 0) > 100_000) throw new CommerceError("request_too_large",413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 100_000) throw new CommerceError("request_too_large",413);
  try {
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body;
  } catch { throw new CommerceError("invalid_json",400); }
}

function signatureFrom(request) {
  if (request.method === "HEAD") return null;
  const header = request.headers.get("PAYMENT-SIGNATURE");
  if (!header) return null;
  if (header.length > 24_000) throw new CommerceError("invalid_payment_header",400);
  try { return decodePaymentSignatureHeader(header); }
  catch { throw new CommerceError("invalid_payment_header",400); }
}

function quoteFrom(request,payload,body = {}) {
  const requested = new URL(request.url).searchParams.get("quote_id") || body.quoteId;
  let embedded;
  try { embedded = new URL(payload?.resource?.url).searchParams.get("quote_id"); } catch { /* optional */ }
  if (requested && embedded && requested !== embedded) throw new CommerceError("quote_mismatch",409);
  return requested || embedded;
}

function recoveryToken(request,body = {}) {
  const authorization = request.headers.get("Authorization");
  return request.headers.get("X-Recovery-Token") ||
    (authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined) || body.recoveryToken;
}

function challenge(c,quote,route) {
  const requirements = {
    x402Version:2,
    resource:{url:`${ORIGIN}${route}?quote_id=${encodeURIComponent(quote.id)}`,
      description:quote.kind === "execution" ? "One JavaScript Code Mode invocation" : `Second Wind ${quote.sku} v${quote.version}`,
      mimeType:"application/json"},
    accepts:[requirementsFor(quote)],
  };
  c.header("PAYMENT-REQUIRED",encodePaymentRequiredHeader(requirements));
  return c.json({...requirements,error:"payment_required",quoteId:quote.id,
    sku:quote.sku,version:quote.version,content_hash:quote.content_hash,
    retry_url:requirements.resource.url,
    recovery:"Preserve quote_id. Set a random 32-byte base64url X-Recovery-Token before payment for response-loss recovery; otherwise save the token returned on success."},402);
}

/** Dependency injection is a test/server-construction seam, never an env bypass. */
export function createApp(dependencies = {}) {
  const app = new Hono();
  app.use("*",async(c,next)=>{
    if (c.req.method === "OPTIONS") return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type, PAYMENT-SIGNATURE, X-Recovery-Token, Authorization, Idempotency-Key",
      "Access-Control-Expose-Headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Content-Hash, X-Recovery-Token, X-Payment-Id, X-Worker-Version",
    }});
    await next();
    if (c.res.status === 101 || c.res.webSocket) return;
    c.header("Access-Control-Allow-Origin","*");
    c.header("Access-Control-Expose-Headers","PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Content-Hash, X-Recovery-Token, X-Payment-Id, X-Worker-Version");
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
    let db = false,commerce = false,recipient = false,key = false;
    let tools_live = null;
    try {
      const count = await c.env.SW_DB.prepare("SELECT COUNT(*) AS count FROM items WHERE status='live'").first();
      tools_live = count.count; db = true;
      await c.env.SW_DB.prepare("SELECT payment_id FROM commerce_purchases LIMIT 1").first();
      commerce = true;
    } catch { /* explicit degraded state */ }
    try { paymentConfig(c.env); recipient = true; } catch { /* explicit below */ }
    try { const value = JSON.parse(c.env.CDP_FACILITATOR_KEY); key = Boolean(value.id && value.privateKey); } catch { /* below */ }
    const recipientReadiness = paymentReadiness(c.env);
    const ready = db && commerce && recipient && key && recipientReadiness.payment_recipient_verified;
    return c.json({service:"Second Wind",status:ready ? "ready" : "degraded",tools_live,
      payment:{rail:"x402",x402Version:2,network:NETWORK,asset:"USDC",payTo_configured:recipient,...recipientReadiness,facilitator_configured:key},
      dependencies:{database:db,commerce_schema:commerce,payload_store:Boolean(c.env.PAYLOADS),delivery_store:Boolean(c.env.DELIVERIES)},
      discovery:{tools:`${ORIGIN}/api/tools`,openapi:`${ORIGIN}/openapi.json`,x402_resources:`${ORIGIN}/v2/x402/discovery/resources`},
      note:"Configuration readiness does not assert that a live purchase test has passed."},ready ? 200 : 503);
  });
  app.get("/api/tools",async c=>c.json(await toolsDocument(c.env)));
  app.all("/api/catalog",c=>c.redirect(`/api/tools${new URL(c.req.url).search}`,308));
  app.get("/openapi.json",async c=>c.json(await openApiDocument(c.env)));
  for (const path of ["/.well-known/x402","/v2/x402/discovery/resources","/discovery/resources"])
    app.get(path,async c=>c.json(await resourcesDocument(c.env)));
  app.get("/llms.txt",async c=>c.text(await llmsDocument(c.env)));
  app.post("/api/resolve",async c=>{
    const body = await jsonBody(c.req.raw);
    const matches = await searchCatalog(c.env.SW_DB,body.intent ?? body.query ?? "",body.limit ?? 10);
    return c.json({matched:matches.length>0,status:matches.length ? "matches" : "no_match",matches});
  });
  app.post("/api/quotes",async c=>{
    const body = await jsonBody(c.req.raw);
    return c.json(await createQuote(c.env,body.sku,body.config || {}));
  });
  app.post("/api/configure",async c=>{
    const body = await jsonBody(c.req.raw);
    return c.json(await checkConfiguration(c.env.SW_DB,body.sku,body.config || {}));
  });

  async function paid(c,isRpc = false) {
    const body = c.req.method === "POST" ? await jsonBody(c.req.raw) : {};
    const paymentPayload = signatureFrom(c.req.raw);
    let quoteId = quoteFrom(c.req.raw,paymentPayload,body);
    if (!quoteId && paymentPayload) throw new CommerceError("quote_required",400,{hint:"Retry the original quoted URL."});
    let requestData,route;
    if (isRpc) {
      requestData = body.code !== undefined ? {code:body.code,language:body.language,
        ...(body.invocationId ? {invocationId:body.invocationId} : {})} : body.config || {};
      if (!quoteId) {
        if (body.sku) quoteId = (await createQuote(c.env,body.sku,requestData)).quoteId;
        else quoteId = (await createExecutionQuote(c.env,requestData)).quoteId;
      }
      route = "/rpc";
    } else {
      const key = c.req.param("key");
      requestData = body.config ?? body;
      if (requestData === body) {
        requestData = {...body}; delete requestData.quoteId; delete requestData.recoveryToken;
      }
      if (!quoteId) {
        const product = await describeProduct(c.env.SW_DB,key);
        if (product.invoke_kind === "bedrock" && c.req.method !== "POST") {
          throw new CommerceError("method_not_allowed",405,{hint:"Use POST with the product's input schema."});
        }
        quoteId = (await createQuote(c.env,key,requestData)).quoteId;
      }
      route = `/api/x402/${encodeURIComponent(key)}`;
    }
    const quote = await readQuote(c.env,quoteId,{allowExpired:Boolean(paymentPayload)});
    if (!isRpc) {
      const snapshot = JSON.parse(quote.snapshot_json);
      if (c.req.param("key") !== quote.sku && c.req.param("key") !== snapshot.slug) throw new CommerceError("quote_product_mismatch",409);
      if (new URL(c.req.url).pathname.endsWith("/artifact") && snapshot.payload?.via !== "r2") {
        throw new CommerceError("unknown_artifact",404);
      }
      const expectedMethod = snapshot.invoke_kind === "bedrock" ? "POST" : "GET";
      if (c.req.method !== expectedMethod && !(c.req.method === "HEAD" && expectedMethod === "GET")) {
        throw new CommerceError("method_not_allowed",405,{hint:`Use ${expectedMethod} for this product.`});
      }
      if (c.req.method === "GET" || c.req.method === "HEAD") requestData = JSON.parse(quote.config_json);
    } else if (quote.kind === "product" && body.config === undefined) requestData = JSON.parse(quote.config_json);
    if (!paymentPayload) return challenge(c,quote,route);
    const pending = purchase(c.env,{quoteId,paymentPayload,requestData,
      recoveryToken:recoveryToken(c.req.raw,body)},dependencies);
    try { c.executionCtx.waitUntil(pending.catch(()=>{})); } catch { /* local fetch has no context */ }
    const response = await pending;
    c.header("PAYMENT-RESPONSE",encodePaymentResponseHeader(response.paymentResponse));
    if (response.body.content_hash) c.header("X-Content-Hash",response.body.content_hash);
    if (!isRpc && new URL(c.req.url).pathname.endsWith("/artifact")) {
      c.header("X-Payment-Id",response.body.paymentId);
      c.header("X-Recovery-Token",response.body.recoveryToken);
      c.header("Content-Type",response.body.artifact.mime_type);
      return c.body(Buffer.from(response.body.artifact.data,"base64"));
    }
    return c.json(response.body);
  }
  app.post("/rpc",c=>paid(c,true));
  app.get("/api/x402/:key",c=>paid(c));
  app.post("/api/x402/:key",c=>paid(c));
  app.get("/api/x402/:key/artifact",c=>paid(c));
  app.all("/capnp",c=>newWorkersRpcResponse(c.req.raw,new ProductService(c.env)));
  app.get("/api/purchases/:paymentId/delivery",async c=>{
    const grant = await recoverGrant(c.env,c.req.param("paymentId"),recoveryToken(c.req.raw));
    const body = await deliverGrant(c.env,grant);
    c.header("PAYMENT-RESPONSE",encodePaymentResponseHeader(grant.receipt.facilitator_response));
    c.header("X-Content-Hash",body.content_hash);
    if (new URL(c.req.url).searchParams.get("format") === "artifact") {
      if (!body.artifact) throw new CommerceError("unknown_artifact",404);
      c.header("Content-Type",body.artifact.mime_type);
      return c.body(Buffer.from(body.artifact.data,"base64"));
    }
    return c.json(body);
  });
  app.post("/api/purchases/:paymentId/recovery-challenge",async c=>
    c.json(await createRecoveryChallenge(c.env,c.req.param("paymentId"))));
  app.post("/api/purchases/:paymentId/recover",async c=>{
    const body = await jsonBody(c.req.raw);
    return c.json(await recoverWithWallet(c.env,c.req.param("paymentId"),body));
  });
  app.all("*",c=>c.json({error:c.req.method === "GET" || c.req.method === "HEAD" ? "unknown_path" : "method_not_allowed",
    tools:"/api/tools",openapi:"/openapi.json"},c.req.method === "GET" || c.req.method === "HEAD" ? 404 : 405));
  return app;
}

export default createApp();
