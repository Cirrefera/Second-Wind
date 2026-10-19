import { listCatalog } from "./catalog.js";
import { NETWORK, USDC, ORIGIN, paymentConfig } from "./contracts.js";

export const toolUrl = item => `${ORIGIN}/api/x402/${encodeURIComponent(item.slug || item.sku)}`;
export const toolMethod = item => item.invoke_kind === "bedrock" ? "POST" : "GET";

export async function toolsDocument(env) {
  const items = await listCatalog(env.SW_DB);
  return {
    service:"Second Wind", total_live:items.length,
    payment:{rail:"x402",network:NETWORK,asset:"USDC"},
    tools:items.map(item => ({...item,url:toolUrl(item),method:toolMethod(item)})),
    discovery:{quotes:`${ORIGIN}/api/quotes`,intent:`${ORIGIN}/api/resolve`,
      capnweb:`${ORIGIN}/capnp`,openapi:`${ORIGIN}/openapi.json`},
    toolGuidance:{
      purchase:"Request a quote or an unpaid tool URL, sign its x402 v2 requirements, and retry with PAYMENT-SIGNATURE.",
      recovery:"Save paymentId and recoveryToken. Redelivery and Cap'n Web recovery require that private token and never initiate settlement.",
      disconnect:"For response-loss recovery, choose a random 32-byte base64url X-Recovery-Token before purchase and retain the quote ID.",
      execution:"Code Mode orchestration explicitly uses JavaScript. An existing artifact's language is determined by its product contract.",
    },
  };
}

export async function resourcesDocument(env) {
  const document = await toolsDocument(env);
  let payTo;
  try { payTo = paymentConfig(env).payTo; } catch { /* mark unavailable below */ }
  return {
    x402Version:2, payment_configured:Boolean(payTo),
    items:document.tools.map(item => ({
      resource:item.url,type:"http",x402Version:2,
      accepts:payTo ? [{scheme:"exact",network:NETWORK,asset:USDC,payTo,
        amount:item.price_usdc_micros,maxTimeoutSeconds:300,extra:{name:"USD Coin",version:"2"}}] : [],
      description:item.summary,sku:item.sku,method:item.method,
      content_hash:item.content_hash,content_hash_scope:item.content_hash_scope,version:item.version,
      lastUpdated:Math.floor(Date.parse(item.updated_at)/1000),
    })),
  };
}

export async function openApiDocument(env) {
  const tools = (await toolsDocument(env)).tools;
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

export async function llmsDocument(env) {
  const document = await toolsDocument(env);
  return `# Second Wind\n\nSpecific AWS products for buying agents. USDC on Base via x402 v2.\n\n`+
    `## Discover and buy\n\n`+
    `1. GET ${ORIGIN}/api/tools and ${ORIGIN}/api/proof.\n`+
    `2. POST ${ORIGIN}/api/quotes with {"sku":"...","config":{...}} to validate configuration and pin a version, hash, and price.\n`+
    `3. Request quote.purchase.url with its declared method; sign PAYMENT-REQUIRED and retry with PAYMENT-SIGNATURE. Keep quote_id unchanged.\n`+
    `4. Save paymentId, recoveryToken, content_hash, and receipt.tx_hash.\n\n`+
    `Supply a cryptographically random 32-byte base64url X-Recovery-Token before the first paid attempt if a disconnected response must be recoverable immediately.\n`+
    `A completed retry requires the same private token. Never treat a payment ID or on-chain signature as a recovery secret.\n\n`+
    `## Cap'n Web\n\n${ORIGIN}/capnp supports HTTP batch and bidirectional WebSocket RPC. `+
    `Free methods: describe, search, configure, quote. getGrant(paymentId,recoveryToken) and recoverSession(paymentId,recoveryToken) `+
    `return purchase-scoped capabilities with info() and deliver(). Execution grants can replay their one purchased invocation with execute(invocationId,code,"javascript",callback). `+
    `New transport sessions reacquire capabilities from D1; promise pipelining does not make a disconnected session durable.\n\n`+
    `## Recovery\n\nGET ${ORIGIN}/api/purchases/{paymentId}/delivery with X-Recovery-Token is free. `+
    `If a token was lost, POST the recovery-challenge endpoint and then POST its wallet-signed response to recover. `+
    `An uncertain settlement is never retried as a new charge.\n\n`+
    `## Live products (${document.total_live})\n\n`+
    document.tools.map(item=>`- ${item.sku}: ${item.name} — $${item.price_usd} USDC — ${item.method} ${item.url} — v${item.version}, SHA-256 ${item.content_hash}\n`).join("");
}
