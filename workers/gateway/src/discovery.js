import { listCatalog } from "./catalog.js";
import { NETWORK, USDC, ORIGIN, paymentConfig, paymentReadiness } from "./contracts.js";
import {enqueueObservation} from './telemetry.js';

export const toolUrl = item => `${ORIGIN}/api/x402/${encodeURIComponent(item.slug || item.sku)}`;
export const toolMethod = item => item.invoke_kind === "bedrock" ? "POST" : "GET";

export async function toolsDocument(env,{journey}={}) {
  const items = await listCatalog(env.SW_DB);
  if(journey) await enqueueObservation(env,'discovery.described',{journey,
    payload:{result_count:items.length,candidate_product_ids:items.slice(0,50).map(item=>item.sku)}});
  return {
    service:"Second Wind",
    introduction:"Pay only for what you need. Prices shown are for the full product. Where a product supports selection, test it in the sandbox and choose what you need before authorizing the exact price.",
    total_live:items.length,
    payment:{rail:"x402",network:NETWORK,asset:"USDC"},
    tools:items.map(item => ({...item,url:toolUrl(item),method:toolMethod(item)})),
    discovery:{quotes:`${ORIGIN}/api/quotes`,intent:`${ORIGIN}/api/resolve`,
      capnweb:`${ORIGIN}/capnp`,openapi:`${ORIGIN}/openapi.json`},
    toolGuidance:{
      trial:"Check pricing_mode for proportional-components and read components_url for the product's available selections. Complete a sandbox trial, choose what you need, and accept the exact scope before authorizing payment. Products without this mode use their listed fixed-price contract.",
      purchase:"For products that support selection, acceptance creates a quote for your chosen scope. For fixed-price products, request a quote. Acceptance does not charge you. Review the exact amount, sign x402 v2 requirements, and retry with PAYMENT-SIGNATURE.",
      recovery:"Save paymentId and recoveryToken. Redelivery and Cap'n Web recovery require that private token and never initiate settlement.",
      disconnect:"For response-loss recovery, choose a random 32-byte base64url X-Recovery-Token before purchase and retain the quote ID.",
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
    items:document.tools.map(item => ({
      resource:item.url,type:"http",x402Version:2,
      accepts:payTo && item.pricing_status!=='not_configured' ? [{scheme:"exact",network:NETWORK,asset:USDC,payTo,
        amount:item.price_usdc_micros,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}] : [],
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
    "/api/quotes":{post:{summary:"Validate and pin a product version and price",responses:{"200":ok("Quote"),"400":ok("Configuration requirements")}}},
    "/rpc":{post:{summary:"Buy a quoted SKU, or one explicitly identified JavaScript execution",responses}},
    "/capnp":{post:{summary:"Cap'n Web HTTP batch; GET Upgrade also supports WebSocket",responses:{"200":ok("RPC batch result")}}},
    "/api/purchases/{paymentId}/delivery":{get:{summary:"Free authenticated delivery of the purchased version",
      parameters:[{in:"path",name:"paymentId",required:true,schema:{type:"string"}}],
      security:[{RecoveryToken:[]}],responses:{"200":ok("Delivery"),"401":ok("Recovery token required")}}},
    "/api/purchases/{paymentId}/recovery-challenge":{post:{summary:"Create a one-use wallet recovery challenge",
      parameters:[{in:"path",name:"paymentId",required:true,schema:{type:"string"}}],responses:{"200":ok("Wallet challenge")}}},
    "/api/purchases/{paymentId}/recover":{post:{summary:"Exchange a wallet-signed challenge for a new recovery token",
      parameters:[{in:"path",name:"paymentId",required:true,schema:{type:"string"}}],responses:{"200":ok("New token"),"401":ok("Invalid proof")}}},
  };
  for (const item of tools) {
    const operation = {summary:item.name,description:item.summary,responses,
      parameters:[{in:"query",name:"quote_id",schema:{type:"string"}},
        {in:"header",name:"PAYMENT-SIGNATURE",schema:{type:"string"}},
        {in:"header",name:"X-Recovery-Token",schema:{type:"string"}}]};
    paths[`/api/x402/${encodeURIComponent(item.slug || item.sku)}`] = {[item.method.toLowerCase()]:operation};
    if (item.slug && item.sku !== item.slug) paths[`/api/x402/${encodeURIComponent(item.sku)}`] = {[item.method.toLowerCase()]:operation};
  }
  return {openapi:"3.1.0",info:{title:"Second Wind",version:"2.0.0",
    description:"One product service for HTTP/x402 and Cap'n Web. Quotes pin content and price; private purchase credentials enable free recovery."},
    servers:[{url:ORIGIN}],paths,components:{securitySchemes:{RecoveryToken:{type:"apiKey",in:"header",name:"X-Recovery-Token"}}}};
}

export async function llmsDocument(env,options) {
  const document = await toolsDocument(env,options);
  return `# Second Wind\n\nPay only for what you need. Prices shown are for the full product. Where a product supports selection, test it in the sandbox and choose what you need before authorizing the exact price. USDC on Base via x402 v2.\n\n`+
    `## Try and choose\n\n`+
    `Check /api/tools for pricing_mode: proportional-components. Only those products offer selection through a sandbox trial; other listings retain their stated fixed-price contract. Read components_url for available selections, shares, dependencies, and the maximum price.\n\n`+
    `Use select(sku).configure(config).trial({code,language:"javascript"}) over Cap'n Web. Inspect trial.info(), save trial.recovery() privately, then call trial.selectComponents(ids). Inspect selection.info() and call selection.accept(scope_hash) with that exact hash. Acceptance prepares payment requirements; it does not charge you. Authorize payment only after reviewing your selected scope and exact amount.\n\n`+
    `HTTP equivalents: POST /api/trials with {sku,config,input:{code,language:"javascript"}}; POST /api/trials/{id}/selection with {components}; POST /api/trials/{id}/accept with {components,scope_hash}. Use X-Trial-Token for selection, acceptance, and GET /api/trials/{id} recovery.\n\n`+
    `Trials execute JavaScript in an isolated Dynamic Worker with scoped product access and no outbound networking. A completed trial means your test code executed successfully; it does not establish that a deployment in your AWS account works. Product language support is stated separately in its contract.\n\n`+
    `## Fixed-price products and payment\n\n`+
    `1. GET ${ORIGIN}/api/tools and ${ORIGIN}/api/proof.\n`+
    `2. POST ${ORIGIN}/api/quotes with {"sku":"...","config":{...}} to validate configuration and pin a version, hash, and price.\n`+
    `3. Request quote.purchase.url with its declared method; sign PAYMENT-REQUIRED and retry with PAYMENT-SIGNATURE. Keep quote_id unchanged.\n`+
    `4. Save paymentId, recoveryToken, content_hash, and receipt.tx_hash.\n\n`+
    `Supply a cryptographically random 32-byte base64url X-Recovery-Token before the first paid attempt if a disconnected response must be recoverable immediately.\n`+
    `A completed retry requires the same private token. Never treat a payment ID or on-chain signature as a recovery secret.\n\n`+
    `## Cap'n Web\n\n${ORIGIN}/capnp supports HTTP batch and bidirectional WebSocket RPC. `+
    `Free methods: describe, search, select, configure, quote. select(sku) returns a product capability; pipeline select(sku).configure(config).quote(). configure accepts an optional buyer callback with clarify(questions). getGrant(paymentId,recoveryToken) and recoverSession(paymentId,recoveryToken) `+
    `return purchase-scoped capabilities with info() and deliver(). Execution grants can replay their one purchased invocation with execute(invocationId,code,"javascript",callback). `+
    `New transport sessions reacquire capabilities from D1; promise pipelining does not make a disconnected session durable.\n\n`+
    `## Recovery\n\nGET ${ORIGIN}/api/purchases/{paymentId}/delivery with X-Recovery-Token is free. `+
    `If a token was lost, POST the recovery-challenge endpoint and then POST its wallet-signed response to recover. `+
    `An uncertain settlement is never retried as a new charge.\n\n`+
    `## Live products (${document.total_live})\n\n`+
    document.tools.map(item=>`- ${item.sku}: ${item.name} — $${item.price_usd} USDC — ${item.method} ${item.url} — v${item.version}, SHA-256 ${item.content_hash}\n`).join("");
}
