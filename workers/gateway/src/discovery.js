import { listCatalog } from "./catalog.js";
import { NETWORK, USDC, ORIGIN, paymentConfig, paymentReadiness } from "./contracts.js";
import {enqueueObservation} from './telemetry.js';

export const toolUrl = item => `${ORIGIN}/api/x402/${encodeURIComponent(item.slug || item.sku)}`;
export const toolMethod = item => item.invoke_kind === "bedrock" ||
  (item.pricing_mode === "whole-product" && item.language_policy?.mode === "configured") ? "POST" : "GET";

export async function toolsDocument(env,{journey}={}) {
  const items = await listCatalog(env.SW_DB);
  if(journey) await enqueueObservation(env,'discovery.described',{journey,
    payload:{result_count:items.length,candidate_product_ids:items.slice(0,50).map(item=>item.sku)}});
  return {
    service:"Second Wind",
    introduction:"Pay only for what you need. Listed amounts are maximum payments, never automatic charges. Test supported products in the sandbox, choose what you want, and authorize only the selected purchase amount.",
    total_live:items.length,
    payment:{rail:"x402",network:NETWORK,asset:"USDC"},
    tools:items.map(item => ({...item,url:toolUrl(item),method:toolMethod(item)})),
    discovery:{intent:`${ORIGIN}/api/resolve`,
      capnweb:`${ORIGIN}/capnp`,openapi:`${ORIGIN}/openapi.json`},
    toolGuidance:{
      trial:"Check pricing_mode for proportional-components and read components_url for the product's available selections. Complete a sandbox trial, choose what you need, and accept the exact scope before authorizing payment. Products marked whole-product sell their complete declared deliverable; their component trial is unavailable.",
      purchase:"After trial and selection, accept the selected scope. For a whole product with a configured language, POST its declared HTTP endpoint with {config:{language:<supported language>}}. Other whole products use their declared HTTP method. Component acceptance records the selected scope without charging. Follow its purchase.url to receive the official x402 challenge, review its exact amount, and authorize payment with PAYMENT-SIGNATURE. Preserve that URL for retries. Existing accepted GET URLs remain readable.",
      recovery:"Save paymentId and recoveryToken. Redelivery and Cap'n Web recovery require that private token and never initiate settlement.",
      disconnect:"For response-loss recovery, choose a random 32-byte base64url X-Recovery-Token before purchase and retain the accepted purchase URL.",
      execution:"Code Mode orchestration explicitly uses JavaScript. An existing artifact's language is determined by its product contract.",
    },
  };
}

export async function resourcesDocument(env,options) {
  const document = await toolsDocument(env,options);
  let payTo;
  try { payTo = paymentConfig(env).payTo; } catch { /* mark unavailable below */ }
  return {
    x402Version:2, payment_configured:Boolean(payTo), ...paymentReadiness(env),
    payment:{rail:"x402",network:NETWORK,asset:USDC,...(payTo ? {payTo} : {})},
    items:document.tools.map(item => ({
      resource:item.url,type:"http",x402Version:2,
      // A catalog ceiling is not a signable exact payment. The SDK emits the
      // requirements at the purchase URL after the buyer chooses a scope.
      accepts:[],
      payment_requirements_url:item.url,
      ...(item.max_amount_atomic ? {max_amount_atomic:item.max_amount_atomic} : {}),
      description:item.summary,sku:item.sku,method:item.method,
      ...(item.pricing_mode ? {pricing_mode:item.pricing_mode,pricing_status:item.pricing_status,
        price_role:item.price_role,components_url:item.components_url,trial_url:item.trial_url} : {}),
      content_hash:item.content_hash,content_hash_scope:item.content_hash_scope,version:item.version,
      lastUpdated:Math.floor(Date.parse(item.updated_at)/1000),
    })),
  };
}

export async function openApiDocument(env,options) {
  const tools = (await toolsDocument(env,options)).tools;
  const ok = description => ({description});
  const responses = {"200":ok("Purchased content, receipt, and private recovery token"),
    "402":ok("x402 v2 PAYMENT-REQUIRED or PAYMENT-RESPONSE"),
    "409":ok("Purchase in progress or settlement needs recovery; do not re-sign"),
    "503":ok("Dependency unavailable; response states whether payment settled")};
  const paths = {
    "/api/tools":{get:{summary:"Free live product metadata",responses:{"200":ok("Catalog")}}},
    "/api/proof":{get:{summary:"Serving dependencies and configuration",responses:{"200":ok("Readiness"),"503":ok("Degraded")}}},
    "/api/resolve":{post:{summary:"Deterministic intent search",responses:{"200":ok("Matches or no_match")}}},
    "/api/products/{sku}/components":{get:{summary:"Available components, dependencies and maximum payment",responses:{"200":ok("Component menu"),"409":ok("Component trial unavailable")}}},
    "/api/trials":{post:{summary:"Run or recover the identical sandbox trial without payment",
      requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["sku","input"],properties:{
        sku:{type:"string"},config:{type:"object"},input:{type:"object",required:["code","language"],
          dependentRequired:{trial_id:["trial_token"],trial_token:["trial_id"]},properties:{
            code:{type:"string"},language:{type:"string",enum:["javascript","js"]},
            trial_id:{type:"string",pattern:"^trial_[A-Za-z0-9_-]{1,96}$",description:"Generate and retain before starting a recoverable trial."},
            trial_token:{type:"string",pattern:"^[A-Za-z0-9_-]{43}$",description:"Private random 32-byte base64url token; retain before starting."}}}}}}}},
      responses:{"200":ok("Stored result or running/unknown status with private recovery credentials"),
        "400":ok("Invalid input or incomplete recovery credentials"),"401":ok("Invalid trial token"),
        "409":ok("Changed request, changed release or expired trial"),"503":ok("Start outcome requires recovery")}}},
    "/api/trials/{id}":{get:{summary:"Recover a trial with X-Trial-Token",responses:{"200":ok("Trial result")}}},
    "/api/trials/{id}/selection":{post:{summary:"Choose components after a completed trial using X-Trial-Token",responses:{"200":ok("Selected scope, maximum and final amount")}}},
    "/api/trials/{id}/accept":{post:{summary:"Accept the exact selected scope_hash using X-Trial-Token; no charge",responses:{"200":ok("Accepted purchase and payment URL")}}},
    "/rpc":{post:{summary:"Pay for an accepted SKU, or one explicitly chosen JavaScript invocation",responses}},
    "/capnp":{post:{summary:"Cap'n Web HTTP batch; GET Upgrade also supports WebSocket",responses:{"200":ok("RPC batch result")}}},
    "/api/purchases/{paymentId}/delivery":{get:{summary:"Free authenticated delivery of the purchased version",
      parameters:[{in:"path",name:"paymentId",required:true,schema:{type:"string"}}],
      security:[{RecoveryToken:[]}],responses:{"200":ok("Delivery"),"401":ok("Recovery token required")}}},
    "/api/purchases/{paymentId}/reconcile":{post:{
      summary:"Confirm the original finalized Base transfer and repair its purchase records without submitting payment",
      parameters:[{in:"path",name:"paymentId",required:true,schema:{type:"string"}}],
      security:[{RecoveryToken:[]}],
      requestBody:{required:true,content:{"application/json":{schema:{type:"object",properties:{
        transaction:{type:"string",pattern:"^0x[0-9a-fA-F]{64}$",description:"Original transaction hash; omit only when already recorded on the purchase"}}}}}},
      responses:{"200":{description:"Confirmed purchase; use authenticated delivery",content:{"application/json":{schema:{
        type:"object",required:["paymentId","status","receipt","recovery"],properties:{
          paymentId:{type:"string"},status:{const:"settled"},receipt:{type:"object"},recovery:{type:"string"}}}}}},
        "400":ok("Original transaction hash required"),"401":ok("Private recovery token required"),
        "409":ok("Purchase or transaction cannot be reconciled, does not match, or is not finalized"),
        "503":ok("Chain evidence or durable recording temporarily unavailable; never pay again")}}},
    "/api/purchases/{paymentId}/recovery-challenge":{post:{summary:"Get or reuse a one-use wallet recovery challenge",
      parameters:[{in:"path",name:"paymentId",required:true,schema:{type:"string"}}],responses:{"200":ok("Wallet challenge")}}},
    "/api/purchases/{paymentId}/recover":{post:{summary:"Exchange a wallet-signed challenge for a new recovery token",
      parameters:[{in:"path",name:"paymentId",required:true,schema:{type:"string"}}],responses:{"200":ok("New token"),"401":ok("Invalid proof")}}},
  };
  for (const item of tools) {
    const operation = {summary:item.name,description:item.summary,responses,
      parameters:[{in:"query",name:"acceptance_id",schema:{type:"string"}},
        {in:"header",name:"PAYMENT-SIGNATURE",schema:{type:"string"}},
        {in:"header",name:"X-Recovery-Token",schema:{type:"string"}}]};
    const path = `/api/x402/${encodeURIComponent(item.slug || item.sku)}`;
    const configured = item.pricing_mode === "whole-product" && item.language_policy?.mode === "configured";
    if (configured) operation.requestBody={required:true,content:{"application/json":{schema:{type:"object",required:["config"],properties:{
      config:{type:"object",required:["language"],properties:{language:{type:"string",enum:item.language_policy.adapters}},additionalProperties:true}}}}}};
    if (configured) {
      const historicalGet = {...operation,summary:`Legacy accepted GET purchase for ${item.name}`};
      delete historicalGet.requestBody;
      historicalGet.parameters=operation.parameters.map(parameter=>parameter.name==='acceptance_id'?{...parameter,required:true}:parameter);
      paths[path] = {post:operation,get:historicalGet};
    } else paths[path] = {[item.method.toLowerCase()]:operation};
    if (item.slug && item.sku !== item.slug) paths[`/api/x402/${encodeURIComponent(item.sku)}`] = paths[path];
  }
  return {openapi:"3.1.0",info:{title:"Second Wind",version:"2.0.0",
    description:"One product service for HTTP/x402 and Cap'n Web. Accepted purchases pin selected content and the final amount; private purchase credentials enable free recovery."},
    servers:[{url:ORIGIN}],paths,components:{securitySchemes:{RecoveryToken:{type:"apiKey",in:"header",name:"X-Recovery-Token"}}}};
}

export async function llmsDocument(env,options) {
  const document = await toolsDocument(env,options);
  return `# Second Wind\n\nPay only for what you need. Listed amounts are maximum payments, never automatic charges. Test supported products in the sandbox, choose what you want, and authorize only the selected purchase amount. USDC on Base via x402 v2.\n\n`+
    `## Try and choose\n\n`+
    `Check /api/tools for pricing_mode: proportional-components. Only those products offer selection through a sandbox trial; whole-product listings sell their complete declared deliverable and do not offer a component trial. Read components_url for available selections, shares, dependencies, and the maximum price.\n\n`+
    `Use select(sku).configure(config).trial({code,language:"javascript"}) over Cap'n Web. Inspect trial.info(), save trial.recovery() privately, then call trial.selectComponents(ids). Inspect selection.info() and call selection.accept(scope_hash) with that exact hash. Acceptance records the selected purchase; it does not charge you. Authorize payment only after reviewing your selected scope and exact amount.\n\n`+
    `HTTP equivalents: POST /api/trials with {sku,config,input:{code,language:"javascript",trial_id,trial_token}}; POST /api/trials/{id}/selection with {components}; POST /api/trials/{id}/accept with {components,scope_hash}. Use X-Trial-Token for selection, acceptance, and GET /api/trials/{id} recovery.\n\n`+
    `Before starting a recoverable trial, generate and privately retain trial_id ("trial_" plus a random UUID) and trial_token (32 cryptographically random bytes encoded as base64url). Pass both in the trial input object over HTTP or Cap’n Web. Retry with the same credentials and identical SKU, configuration and code to recover that attempt; changed requests are rejected. GET /api/trials/{id} with X-Trial-Token recovers its stored status/result. Running work may report unknown after its execution window; it is never automatically rerun. Credentials omitted for legacy clients are generated server-side and cannot recover a lost initial response.\n\n`+
    `Trials execute JavaScript in an isolated Dynamic Worker with scoped product access and no outbound networking. A completed trial means your test code executed successfully; it does not establish that a deployment in your AWS account works. Product language support is stated separately in its contract.\n\n`+
    `## Whole-product purchases and payment\n\n`+
    `1. GET ${ORIGIN}/api/tools and ${ORIGIN}/api/proof.\n`+
    `2. Choose the whole product and configure it. For a configured-language product, POST its endpoint with {"config":{"language":"..."}}; otherwise use its declared HTTP method. You can also POST ${ORIGIN}/rpc with {"sku":"...","config":{...}}. There is no separate price-request stage.\n`+
    `3. The official x402 middleware returns PAYMENT-REQUIRED; review the exact amount and retry with PAYMENT-SIGNATURE. Keep the accepted purchase URL unchanged.\n`+
    `4. Save paymentId, recoveryToken, content_hash, and receipt.tx_hash.\n\n`+
    `Supply a cryptographically random 32-byte base64url X-Recovery-Token before the first paid attempt if a disconnected response must be recoverable immediately.\n`+
    `A completed retry requires the same private token. Never treat a payment ID or on-chain signature as a recovery secret.\n\n`+
    `## Cap'n Web\n\n${ORIGIN}/capnp supports HTTP batch and bidirectional WebSocket RPC. `+
    `Free methods: describe, search, select, configure. select(sku) returns a product capability; pipeline select(sku).configure(config).configuration(). configure accepts an optional buyer callback with clarify(questions). getGrant(paymentId,recoveryToken) and recoverSession(paymentId,recoveryToken) `+
    `return purchase-scoped capabilities with info() and deliver(). Execution grants can replay their one purchased invocation with execute(invocationId,code,"javascript",callback). `+
    `New transport sessions reacquire capabilities from D1; promise pipelining does not make a disconnected session durable.\n\n`+
    `## Recovery\n\nGET ${ORIGIN}/api/purchases/{paymentId}/delivery with X-Recovery-Token is free. `+
    `If a token was lost, POST the recovery-challenge endpoint and then POST its wallet-signed response to recover. `+
    `For a pending purchase without a saved receipt, POST /api/purchases/{paymentId}/reconcile with X-Recovery-Token and {"transaction":"0x..."}, or call reconcilePurchase(paymentId,recoveryToken,transaction) over Cap'n Web. The transaction hash may be omitted only when already recorded. This reads finalized Base evidence and repairs the original purchase; it never submits a transfer. Then use delivery or getGrant as usual. An uncertain settlement is never retried as a new charge.\n\n`+
    `## Live products (${document.total_live})\n\n`+
    document.tools.map(item=>`- ${item.sku}: ${item.name} — ${item.max_amount_atomic ? `maximum $${item.price_usd} USDC` : "pricing not configured"} — ${item.method} ${item.url} — v${item.version}, SHA-256 ${item.content_hash}\n`).join("");
}
