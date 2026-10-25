import {publicProduct} from './public-identity.js';
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
    introduction:"Second Wind sells AWS knowledge, guidance, and advice. The marketplace and private sandbox run on Cloudflare. Pay only for what you need. Listed product amounts are maximum payments, never automatic charges. For supported products, preview access costs $0.01 per new trial through x402; recovery is free. Product purchases remain separately priced.",
    total_live:items.length,
    payment:{rail:"x402",network:NETWORK,asset:"USDC"},
    tools:items.map(item => ({...publicProduct(item),url:toolUrl(item),method:toolMethod(item),
      sandbox_eligible:Boolean(item.sandbox_eligible),
      sandbox_available:Boolean(item.sandbox_available),
      ...(item.sandbox_access_url?{sandbox_access_url:item.sandbox_access_url}:{})})),
    discovery:{intent:`${ORIGIN}/api/resolve`,
      capnweb:`${ORIGIN}/capnp`,openapi:`${ORIGIN}/openapi.json`},
    toolGuidance:{
      sandbox_scope:"Previews demonstrate the selected product privately on Cloudflare. They may use local fixtures and return bounded diagnostics. They do not provision AWS resources or verify a live AWS service; product source remains private until a separate purchase.",
      trial:"Check sandbox_eligible and sandbox_available. Eligibility is the approved product policy; availability also requires an active compatible release. Only sandbox_available products support previews now. Generate and retain input.trial_id (trial_ plus a random UUID) and input.trial_token (32 random bytes as base64url); include components, code, and language:'javascript'. Prepare access with POST /api/trials/access or Cap'n Web prepareTrial. HTTP returns a $0.01 x402 challenge; Cap'n Web returns a public acceptance with its payment URL. Authorize the challenge using the returned URL and X-Recovery-Token equal to input.trial_token. Then run the paid trial with POST /api/trials or Cap'n Web trial and the identical product slug, config, and input. Recovery and retry of that same trial are free. Product-specific contracts define whether delivery-language choices are previewed through JavaScript. Products marked whole-product sell their complete declared deliverable and do not offer component selection.",
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
      description:item.summary,slug:item.slug,method:item.method,
      ...(item.pricing_mode ? {pricing_mode:item.pricing_mode,pricing_status:item.pricing_status,
        price_role:item.price_role,components_url:item.components_url,trial_url:item.trial_url} : {}),
      sandbox_eligible:Boolean(item.sandbox_eligible),
      sandbox_available:Boolean(item.sandbox_available),
      ...(item.sandbox_access_url?{sandbox_access_url:item.sandbox_access_url}:{}),
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
    "/api/products/{slug}/components":{get:{summary:"Available components, dependencies and maximum payment",
      parameters:[{in:"path",name:"slug",required:true,schema:{type:"string"}}],
      responses:{"200":ok("Available components, dependencies and maximum product payment"),"409":ok("Component trial unavailable")}}},
    "/api/trials/access":{post:{summary:"Prepare or recover one-cent sandbox access for an eligible product",
      requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["slug","input"],properties:{
        slug:{type:"string"},config:{type:"object"},input:{type:"object",required:["trial_id","trial_token","components","code","language"],properties:{
          trial_id:{type:"string",pattern:"^trial_[A-Za-z0-9_-]{1,96}$"},
          trial_token:{type:"string",pattern:"^[A-Za-z0-9_-]{43}$"},components:{type:"array",minItems:1,uniqueItems:true,items:{type:"string"}},
          code:{type:"string"},language:{type:"string",enum:["javascript"]}}}}}}}},
      responses:{"200":ok("Paid sandbox access or recovered acceptance"),"402":ok("Initial $0.01 x402 sandbox-access challenge"),
        "400":ok("Invalid preview input or unsupported execution language"),"403":ok("Sandbox payment required or product unavailable")}}},
    "/api/trials":{post:{summary:"Run a paid sandbox trial or recover its identical prior result",
      requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["slug","input"],properties:{
        slug:{type:"string"},config:{type:"object"},input:{type:"object",required:["code","language","trial_id","trial_token","components"],properties:{
            code:{type:"string"},language:{type:"string",enum:["javascript","js"]},
            components:{type:"array",minItems:1,uniqueItems:true,items:{type:"string"}},
            trial_id:{type:"string",pattern:"^trial_[A-Za-z0-9_-]{1,96}$",description:"Generate and retain before starting a recoverable trial."},
            trial_token:{type:"string",pattern:"^[A-Za-z0-9_-]{43}$",description:"Private random 32-byte base64url token; retain before starting."}}}}}}}},
      responses:{"200":ok("Stored bounded preview result or running/unknown status with private recovery credentials"),
        "403":ok("Sandbox access payment required; prepare access at /api/trials/access"),
        "400":ok("Invalid input or incomplete recovery credentials"),"401":ok("Invalid trial token"),
        "409":ok("Changed request, changed release or expired trial"),"503":ok("Start outcome requires recovery")}}},
    "/api/trials/{id}":{get:{summary:"Recover the original trial with X-Trial-Token, including after a catalog update",
      parameters:[{in:"path",name:"id",required:true,schema:{type:"string"}}],security:[{TrialToken:[]}],
      responses:{"200":ok("Stored result or running/unknown status; never executes again"),"401":ok("Invalid credentials"),"409":ok("Trial expired")}}},
    "/api/trials/{id}/selection":{post:{summary:"Choose components after a completed trial using X-Trial-Token",
      parameters:[{in:"path",name:"id",required:true,schema:{type:"string"}}],security:[{TrialToken:[]}],
      requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["components"],properties:{components:{type:"array",minItems:1,uniqueItems:true,items:{type:"string"}}}}}}},
      responses:{"200":ok("Selected scope, maximum and final amount"),"400":ok("Invalid selection or missing dependencies"),"401":ok("Invalid credentials"),"409":ok("Trial incomplete, expired or release changed")}}},
    "/api/trials/{id}/accept":{post:{summary:"Accept the exact selected scope_hash using X-Trial-Token; no charge",
      parameters:[{in:"path",name:"id",required:true,schema:{type:"string"}}],security:[{TrialToken:[]}],
      requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["components","scope_hash"],properties:{
        components:{type:"array",minItems:1,uniqueItems:true,items:{type:"string"}},scope_hash:{type:"string",pattern:"^[a-f0-9]{64}$"}}}}}},
      responses:{"200":ok("Accepted purchase and payment URL"),"401":ok("Invalid credentials"),"409":ok("Selection mismatch, expired trial or release changed")}}},
    "/rpc":{post:{summary:"Pay for an accepted product, or one explicitly chosen JavaScript invocation",responses}},
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
  }
  return {openapi:"3.1.0",info:{title:"Second Wind",version:"2.0.0",
      description:"One product service for HTTP/x402 and Cap'n Web. Sandbox access is a separate one-cent x402 payment for eligible products; a buyer's identical retry/recovery is free. Accepted product purchases are priced separately."},
    servers:[{url:ORIGIN}],paths,components:{securitySchemes:{RecoveryToken:{type:"apiKey",in:"header",name:"X-Recovery-Token"},
      TrialToken:{type:"apiKey",in:"header",name:"X-Trial-Token"}}}};
}

export async function llmsDocument(env,options) {
  const document = await toolsDocument(env,options);
  return `# Second Wind\n\nSecond Wind sells AWS knowledge, guidance, and advice. The marketplace and private sandbox run on Cloudflare.\n\n${document.toolGuidance.sandbox_scope}\n\nPay only for what you need. Listed amounts are maximum payments, never automatic charges. Test supported products in the sandbox, choose what you want, and authorize only the selected purchase amount. USDC on Base via x402 v2.\n\n`+
    `## Try and choose\n\n`+
    `Check /api/tools for pricing_mode: proportional-components. Only those products offer selection through a sandbox trial; whole-product listings sell their complete declared deliverable and do not offer a component trial. Read components_url for available selections, shares, dependencies, and the maximum price.\n\n`+
    `Check sandbox_eligible and sandbox_available in /api/tools. Eligibility is the approved product policy; availability also requires an active compatible release. Only sandbox_available products can be previewed. Generate and retain trial_id ("trial_" plus a random UUID) and trial_token (32 random bytes as base64url). Prepare access with select(slug).configure(config).prepareTrial({trial_id,trial_token,components,code,language:"javascript"}) over Cap'n Web, or POST /api/trials/access with {slug,config,input:{trial_id,trial_token,components,code,language:"javascript"}}. HTTP returns a separate $0.01 x402 sandbox-access challenge; Cap'n Web returns a public acceptance with its payment URL. Authorize using the payment URL and X-Recovery-Token equal to trial_token. Product purchase pricing is separate.\n\n`+
    `After paying, run the identical trial with POST /api/trials using the same {slug,config,input}. Cap'n Web trial uses the same input. The trial code can call only codemode.preview(), codemode.components(), and codemode.configuration(); product source and modules remain private to the trusted adapter. codemode.preview() returns only the product-approved summary fields; it never returns source, cookbook text, a full plan, operation inputs, or arbitrary product logs. Your own code controls its returned result and logs. Retry or recover using the same trial_id and trial_token; recovery is free and does not execute the trial again.\n\n`+
    `After the trial, inspect trial.info() and choose components with trial.selectComponents(ids). Inspect selection.info(), then call selection.accept(scope_hash) using that exact hash. Acceptance returns the selected scope and product purchase URL but does not charge for the product. The one-cent sandbox access is separate. Authorize the product's exact x402 amount at the returned URL. HTTP equivalents are POST /api/trials/{id}/selection with {components}, then POST /api/trials/{id}/accept with {components,scope_hash}; send X-Trial-Token with both.\n\n`+
    `Before starting any trial, generate and privately retain trial_id ("trial_" plus a random UUID) and trial_token (32 cryptographically random bytes encoded as base64url). Pass both in the trial input object over HTTP or Cap’n Web; missing credentials are rejected before execution. Retry with the same credentials and identical product slug, configuration and code to recover that attempt, even after a catalog update; changed requests are rejected. GET /api/trials/{id} with X-Trial-Token, or recoverTrial(trial_id,trial_token) over Cap’n Web, recovers its stored status/result. Recovery is available until the returned expires_at (one hour). Running work may report unknown after its execution window; it is never automatically rerun. A trial interrupted before saving its result cannot promise a completed result.\n\n`+
    `Buyer JavaScript runs in an isolated Dynamic Worker with no outbound networking and receives only the three codemode methods above. The product's trusted preview adapter privately runs its JavaScript planner and returns a bounded summary. Product delivery language is separate from sandbox execution language; Python source can be delivered where listed, but the sandbox does not execute Python. A completed trial does not establish that deployment in your AWS account works.\n\n`+
    `## Whole-product purchases and payment\n\n`+
    `1. GET ${ORIGIN}/api/tools and ${ORIGIN}/api/proof.\n`+
    `2. Choose the whole product and configure it. For a configured-language product, POST its endpoint with {"config":{"language":"..."}}; otherwise use its declared HTTP method. You can also POST ${ORIGIN}/rpc with {"slug":"...","config":{...}}. There is no separate price-request stage.\n`+
    `3. The official x402 middleware returns PAYMENT-REQUIRED; review the exact amount and retry with PAYMENT-SIGNATURE. Keep the accepted purchase URL unchanged.\n`+
    `4. Save paymentId, recoveryToken, content_hash, and receipt.tx_hash.\n\n`+
    `Supply a cryptographically random 32-byte base64url X-Recovery-Token before the first paid attempt if a disconnected response must be recoverable immediately.\n`+
    `A completed retry requires the same private token. Never treat a payment ID or on-chain signature as a recovery secret.\n\n`+
    `## Cap'n Web\n\n${ORIGIN}/capnp supports HTTP batch and bidirectional WebSocket RPC. `+
    `Free methods: describe, search, select, configure. select(slug) returns a product capability; pipeline select(slug).configure(config).configuration(). configure accepts an optional buyer callback with clarify(questions). getGrant(paymentId,recoveryToken) and recoverSession(paymentId,recoveryToken) `+
    `return purchase-scoped capabilities with info() and deliver(). Execution grants can replay their one purchased invocation with execute(invocationId,code,"javascript",callback). `+
    `New transport sessions reacquire capabilities from D1; promise pipelining does not make a disconnected session durable.\n\n`+
    `## Recovery\n\nGET ${ORIGIN}/api/purchases/{paymentId}/delivery with X-Recovery-Token is free. `+
    `If a token was lost, POST the recovery-challenge endpoint and then POST its wallet-signed response to recover. `+
    `For a pending purchase without a saved receipt, POST /api/purchases/{paymentId}/reconcile with X-Recovery-Token and {"transaction":"0x..."}, or call reconcilePurchase(paymentId,recoveryToken,transaction) over Cap'n Web. The transaction hash may be omitted only when already recorded. This reads finalized Base evidence and repairs the original purchase; it never submits a transfer. Then use delivery or getGrant as usual. An uncertain settlement is never retried as a new charge.\n\n`+
    `## Live products (${document.total_live})\n\n`+
    document.tools.map(item=>`- ${item.slug}: ${item.name} — ${item.max_amount_atomic ? `maximum $${item.price_usd} USDC` : "pricing not configured"} — ${item.method} ${item.url} — v${item.version}, SHA-256 ${item.content_hash}\n`).join("");
}
