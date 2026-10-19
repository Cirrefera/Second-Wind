import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { verifyMessage } from "viem";
import { checkConfiguration } from "./catalog.js";
import { resolveCapability } from "../../../src/lib/curation.js";
import {
  CommerceError, NETWORK, ORIGIN, FACILITATOR, canonicalJson, sha256,
  randomToken, validToken, paymentConfig, requirementsFor, sameAddress,
} from "./contracts.js";

export { CommerceError } from "./contracts.js";
const rails = new WeakMap();
const now = () => new Date().toISOString();
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

function database(env) {
  if (!env.SW_DB) throw new CommerceError("database_not_configured", 503);
  return env.SW_DB;
}

async function railFor(env) {
  if (rails.has(env)) return rails.get(env);
  const pending = (async () => {
    paymentConfig(env);
    let key;
    try { key = JSON.parse(env.CDP_FACILITATOR_KEY); } catch { /* fail below */ }
    if (!key?.id || !key?.privateKey) throw new CommerceError("facilitator_not_configured", 503);
    const { createAuthHeaders } = createFacilitatorConfig(key.id, key.privateKey);
    const server = new x402ResourceServer(new HTTPFacilitatorClient({
      url: FACILITATOR, createAuthHeaders,
    })).register(NETWORK, new ExactEvmScheme());
    await server.initialize();
    return server;
  })();
  rails.set(env, pending);
  try { return await pending; } catch (error) { rails.delete(env); throw error; }
}

function publicQuote(row) {
  const snapshot = JSON.parse(row.snapshot_json);
  const path = row.kind === "execution" ? "/rpc"
    : `/api/x402/${encodeURIComponent(snapshot.slug || row.sku)}`;
  return {
    quoteId: row.id, sku: row.sku, version: row.version,
    price_usd: Number(row.amount_usdc_micros) / 1_000_000,
    price_usdc_micros: row.amount_usdc_micros,
    amount_usdc_micros: row.amount_usdc_micros,
    content_hash: row.content_hash,
    content_hash_scope: snapshot.payload?.hash_scope || "execution-result",
    manifest_hash: snapshot.manifest_hash || null,
    config: JSON.parse(row.config_json),
    accepts: [requirementsFor(row)],
    issued_at: row.created_at, expires_at: new Date(row.expires_at).toISOString(),
    purchase: {
      method: snapshot.invoke_kind === "bedrock" || row.kind === "execution" ? "POST" : "GET",
      url: `${ORIGIN}${path}?quote_id=${encodeURIComponent(row.id)}`,
    },
  };
}

async function insertQuote(env, { sku, version, kind, amount, config, snapshot }) {
  const rail = paymentConfig(env);
  const configJson = canonicalJson(config);
  const snapshotJson = canonicalJson(snapshot);
  if (new TextEncoder().encode(snapshotJson).length > 1_000_000) {
    throw new CommerceError("product_snapshot_too_large", 503);
  }
  const row = {
    id: `q_${crypto.randomUUID()}`, sku, version, kind,
    amount_usdc_micros: String(amount), asset: rail.asset,
    network: rail.network, pay_to: rail.payTo, config_json: configJson,
    request_hash: await sha256(configJson), snapshot_json: snapshotJson,
    content_hash: snapshot.payload?.content_hash || "", created_at: now(),
    expires_at: Date.now() + 5 * 60_000,
  };
  await database(env).prepare(`INSERT INTO commerce_quotes
    (id,sku,version,kind,amount_usdc_micros,asset,network,pay_to,config_json,
     request_hash,snapshot_json,content_hash,created_at,expires_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`)
    .bind(row.id,row.sku,row.version,row.kind,row.amount_usdc_micros,row.asset,
      row.network,row.pay_to,row.config_json,row.request_hash,row.snapshot_json,
      row.content_hash,row.created_at,row.expires_at).run();
  return publicQuote(row);
}

async function readPayload(env, payload) {
  if (payload.via === "inline") {
    const bytes = new TextEncoder().encode(payload.guidance);
    if (await sha256(bytes) !== payload.content_hash) throw new CommerceError("content_hash_mismatch", 503);
    return bytes;
  }
  if (payload.r2_bucket !== "secondwind-payloads") throw new CommerceError("invalid_payload_bucket", 503);
  if (!env.PAYLOADS) throw new CommerceError("payload_store_not_configured", 503);
  const object = await env.PAYLOADS.get(payload.r2_key);
  if (!object) throw new CommerceError("payload_missing", 503);
  if (object.size > MAX_PAYLOAD_BYTES || payload.size_bytes > MAX_PAYLOAD_BYTES) {
    throw new CommerceError("payload_too_large", 503);
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== payload.size_bytes || await sha256(bytes) !== payload.content_hash) {
    throw new CommerceError("content_hash_mismatch", 503);
  }
  return bytes;
}

/** Pin a real catalog version and verify that its contents exist before payment. */
export async function createQuote(env, sku, config = {}) {
  const db = database(env);
  const check = await checkConfiguration(db, sku, config);
  if (!check.ok) throw new CommerceError("incomplete_configuration", 400,
    { missing: check.missing, errors: check.errors });
  const item = await db.prepare("SELECT * FROM items WHERE sku = ?1 AND status = 'live'")
    .bind(check.sku).first();
  if (!item) throw new CommerceError("unknown_product", 404);
  if (item.version !== check.version) throw new CommerceError("product_changed", 409);
  const resolved = await resolveCapability(env, item, ORIGIN);
  const object = await db.prepare(`SELECT * FROM payload_objects WHERE sku = ?1 AND version = ?2`)
    .bind(item.sku, item.version).first();
  let payload;
  if (object) {
    payload = {
      via: "r2", id: object.id, sku: item.sku, version: item.version,
      r2_bucket: object.r2_bucket, r2_key: object.r2_key,
      content_hash: object.content_hash, size_bytes: object.size_bytes,
      mime_type: object.mime_type, hash_scope: "artifact-bytes",
    };
    await readPayload(env, payload);
  } else if (item.invoke_kind === "r2") {
    throw new CommerceError("payload_not_published", 503);
  } else {
    if (!item.guidance && item.invoke_kind !== "bedrock") throw new CommerceError("payload_missing", 503);
    payload = {
      via: "inline", sku: item.sku, version: item.version,
      guidance: item.guidance || "", mime_type: "text/markdown; charset=utf-8",
      size_bytes: new TextEncoder().encode(item.guidance || "").byteLength,
      content_hash: await sha256(item.guidance || ""), hash_scope: "guidance-utf8",
    };
  }
  resolved.content_hash = payload.content_hash;
  resolved.content_hash_scope = payload.hash_scope;
  if (payload.via === "r2") resolved.invoke = {
    how:"GET",url_template:`${ORIGIN}/api/purchases/{paymentId}/delivery?format=artifact`,
    authorization:"X-Recovery-Token",mime_type:payload.mime_type,
    note:"This artifact is included in the purchase. Authenticated redelivery is free.",
  };
  const snapshot = {
    sku: item.sku, slug: item.slug, version: item.version,
    invoke_kind: item.invoke_kind, invoke_key: item.invoke_key,
    resolved, payload, manifest_hash: await sha256(canonicalJson(resolved)),
  };
  return insertQuote(env, {
    sku: item.sku, version: item.version, kind: "product",
    amount: Math.round(Number(item.price_usd) * 1_000_000),
    config: check.config, snapshot,
  });
}

export function executionInput(input) {
  if (!input || typeof input.code !== "string" || !input.code.trim() || input.code.length > 65536) {
    throw new CommerceError("invalid_code", 400);
  }
  if (input.language !== "javascript" && input.language !== "js") {
    throw new CommerceError("unsupported_execution_language", 400,
      { supported: ["javascript"], hint: "Code Mode orchestration requires an explicit JavaScript language." });
  }
  if (input.invocationId !== undefined &&
      (typeof input.invocationId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.invocationId))) {
    throw new CommerceError("invalid_invocation_id", 400);
  }
  return { code: input.code, language: "javascript", ...(input.invocationId ? { invocationId: input.invocationId } : {}) };
}

/** Preserve the existing metered sandbox as an explicit one-execution product. */
export async function createExecutionQuote(env, input) {
  const config = executionInput(input);
  return insertQuote(env, {
    sku: "SW-EXEC", version: 1, kind: "execution", amount: "2000", config,
    snapshot: { sku: "SW-EXEC", version: 1, invoke_kind: "codemode", allowedActions: ["execute", "deliver"] },
  });
}

export async function readQuote(env, quoteId, { allowExpired = false } = {}) {
  if (typeof quoteId !== "string" || !/^q_[A-Za-z0-9-]{20,80}$/.test(quoteId)) {
    throw new CommerceError("quote_required", 400, { quotes: "/api/quotes" });
  }
  const quote = await database(env).prepare("SELECT * FROM commerce_quotes WHERE id = ?1")
    .bind(quoteId).first();
  if (!quote) throw new CommerceError("unknown_quote", 404);
  if (!allowExpired && quote.expires_at < Date.now()) throw new CommerceError("quote_expired", 409);
  return quote;
}

export async function describeQuote(env, quoteId) {
  return publicQuote(await readQuote(env, quoteId));
}

async function paymentIdentity(payload, quote) {
  const accepted = payload?.accepted;
  const auth = payload?.payload?.authorization;
  const signature = payload?.payload?.signature;
  if (payload?.x402Version !== 2 || accepted?.scheme !== "exact"
      || accepted.network !== quote.network || !sameAddress(accepted.asset, quote.asset)
      || !sameAddress(accepted.payTo, quote.pay_to)
      || String(accepted.amount) !== quote.amount_usdc_micros
      || !auth || !/^0x[\da-f]{64}$/i.test(auth.nonce || "")
      || !/^0x[\da-f]{40}$/i.test(auth.from || "")
      || !sameAddress(auth.to, quote.pay_to) || String(auth.value) !== quote.amount_usdc_micros
      || typeof signature !== "string" || !/^0x[\da-f]+$/i.test(signature)) {
    throw new CommerceError("payment_requirements_mismatch", 402);
  }
  return {
    payer: auth.from,
    key: `x402:${await sha256(canonicalJson({ network: quote.network,
      asset: quote.asset.toLowerCase(), payer: auth.from.toLowerCase(), nonce: auth.nonce.toLowerCase() }))}`,
    proofHash: await sha256(canonicalJson({ authorization: auth, signature })),
  };
}

async function purchaseRow(db, id) {
  return db.prepare("SELECT * FROM commerce_purchases WHERE payment_id = ?1").bind(id).first();
}

async function authenticatedRow(env, paymentId, token) {
  if (!validToken(token)) throw new CommerceError("recovery_required", 401,
    { hint: "Present your private recovery token. A payment ID or on-chain signature alone is not a credential." });
  const row = await purchaseRow(database(env), paymentId);
  if (!row || row.recovery_token_hash !== await sha256(token)) {
    throw new CommerceError("invalid_recovery_token", 401);
  }
  return row;
}

async function setFailed(db, row, code) {
  await db.batch([
    db.prepare(`UPDATE commerce_purchases SET status='failed',error_code=?1,updated_at=?2
      WHERE payment_id=?3 AND owner=?4 AND status IN ('claimed','executing','prepared','settling')`)
      .bind(code,now(),row.payment_id,row.owner),
    db.prepare("UPDATE payments SET status='failed' WHERE id=?1 AND status='verified'").bind(row.payment_id),
  ]);
}

function receiptFor(row, quote, settled) {
  return {
    payment_id: row.payment_id, sku: quote.sku, version: quote.version,
    protocol: "x402", network: quote.network, asset: quote.asset, pay_to: quote.pay_to,
    payer: row.payer, amount_usdc_micros: quote.amount_usdc_micros,
    tx_hash: settled.transaction, settled_at: now(),
    content_hash: quote.content_hash, facilitator: "cdp", facilitator_response: settled,
  };
}

async function persistSettlement(env, row, quote, receipt) {
  const db = database(env);
  const snapshot = JSON.parse(quote.snapshot_json);
  const statements = [
    db.prepare(`UPDATE payments SET status='settled', tx_hash=?1, payer=?2, settled_at=?3,
      facilitator_ref='cdp' WHERE id=?4 AND status='verified'`)
      .bind(receipt.tx_hash,row.payer,receipt.settled_at,row.payment_id),
    db.prepare(`UPDATE commerce_purchases SET status='settled',receipt_json=?1,updated_at=?2
      WHERE payment_id=?3 AND status IN ('settling','uncertain')`)
      .bind(canonicalJson(receipt),now(),row.payment_id),
  ];
  if (snapshot.payload?.id) statements.push(db.prepare(`INSERT INTO delivery_grants
    (id,payment_id,payload_id) VALUES (?1,?2,?3) ON CONFLICT(payment_id,payload_id) DO NOTHING`)
    .bind(`dg_${crypto.randomUUID()}`,row.payment_id,snapshot.payload.id));
  await db.batch(statements);
}

async function durableReceipt(env, row, quote, receipt) {
  // The DB is the entitlement authority. This private R2 copy is also usable to
  // repair a DB write failure after a confirmed facilitator response.
  if (env.DELIVERIES) {
    try {
      await env.DELIVERIES.put(`deliveries/${row.payment_id}/settlement.json`, canonicalJson({
        payment_id: row.payment_id, proof_hash: row.proof_hash, receipt,
      }), { httpMetadata: { contentType: "application/json" } });
    } catch { /* The atomic D1 write below remains mandatory. */ }
  }
  await persistSettlement(env, row, quote, receipt);
}

async function reconcileStoredReceipt(env, row, quote) {
  if (!env.DELIVERIES || !["settling", "uncertain"].includes(row.status)) return row;
  const object = await env.DELIVERIES.get(`deliveries/${row.payment_id}/settlement.json`);
  if (!object) return row;
  const saved = JSON.parse(await object.text());
  if (saved.payment_id !== row.payment_id || saved.proof_hash !== row.proof_hash
      || !saved.receipt?.tx_hash || saved.receipt?.facilitator_response?.success !== true
      || saved.receipt.sku !== quote.sku || saved.receipt.network !== quote.network
      || !sameAddress(saved.receipt.pay_to,quote.pay_to)) {
    throw new CommerceError("settlement_record_mismatch", 503);
  }
  await persistSettlement(env,row,quote,saved.receipt);
  return purchaseRow(database(env),row.payment_id);
}

/**
 * The only money path. Verification precedes a durable UNIQUE claim; only the
 * claim owner executes and settles. Completed retries never call the rail.
 */
export async function purchase(env, input, dependencies = {}) {
  const db = database(env);
  const quote = await readQuote(env,input.quoteId,{ allowExpired: true });
  const identity = await paymentIdentity(input.paymentPayload,quote);
  const request = quote.kind === "execution" ? executionInput(input.requestData) : (input.requestData || {});
  if (await sha256(canonicalJson(request)) !== quote.request_hash) {
    throw new CommerceError("purchase_request_mismatch",409);
  }
  const existing = await db.prepare("SELECT * FROM commerce_purchases WHERE payment_key=?1")
    .bind(identity.key).first();
  if (existing) {
    if (existing.quote_id !== quote.id || existing.proof_hash !== identity.proofHash) {
      throw new CommerceError("payment_reuse_mismatch",409);
    }
    if (["claimed","executing","prepared"].includes(existing.status)) {
      throw new CommerceError("payment_in_progress",409,{paymentId:existing.payment_id,retry_after:2});
    }
    try { await authenticatedRow(env,existing.payment_id,input.recoveryToken); }
    catch (error) {
      if (error.status !== 401) throw error;
      throw new CommerceError(error.code,401,{...error.details,paymentId:existing.payment_id,
        recovery_challenge:`/api/purchases/${existing.payment_id}/recovery-challenge`});
    }
    const row = await reconcileStoredReceipt(env,existing,quote);
    if (row.status === "failed") throw new CommerceError("purchase_failed",409,
      {paymentId:row.payment_id,charged:false,quotes:"/api/quotes",
        hint:"This attempt failed before confirmed settlement. Correct the input or service failure and request a new quote."});
    if (row.status !== "settled") throw new CommerceError("settlement_pending_recovery",409,
      {paymentId:row.payment_id,hint:"Do not re-sign or submit another payment for this purchase."});
    const grant = await recoverGrant(env,row.payment_id,input.recoveryToken);
    return {body:{...await deliverGrant(env,grant),recoveryToken:input.recoveryToken,redelivery:true},
      paymentResponse:grant.receipt.facilitator_response};
  }
  if (quote.expires_at < Date.now()) throw new CommerceError("quote_expired",409);
  const config = paymentConfig(env);
  if (!sameAddress(config.payTo,quote.pay_to)) throw new CommerceError("quote_recipient_changed",409);
  const recoveryToken = input.recoveryToken || randomToken();
  if (!validToken(recoveryToken)) throw new CommerceError("invalid_recovery_token",400);
  const rail = dependencies.rail || await railFor(env);
  const requirements = requirementsFor(quote);
  let verification;
  try { verification = await rail.verifyPayment(input.paymentPayload,requirements); }
  catch { throw new CommerceError("payment_verification_unavailable",503); }
  if (!verification?.isValid || (verification.payer && !sameAddress(verification.payer,identity.payer))) {
    throw new CommerceError("payment_verification_failed",402);
  }
  const row = {
    payment_id:`pay_${crypto.randomUUID()}`,quote_id:quote.id,payment_key:identity.key,
    proof_hash:identity.proofHash,recovery_token_hash:await sha256(recoveryToken),
    payer:identity.payer,owner:crypto.randomUUID(),status:"claimed",
  };
  try {
    await db.batch([
      db.prepare(`INSERT INTO payments (id,sku,price_usd,amount_usdc_micros,payer,
        tx_hash,network,scheme,idempotency_key,status)
        VALUES (?1,?2,?3,?4,?5,'',?6,'exact',?7,'verified')`)
        .bind(row.payment_id,quote.sku,Number(quote.amount_usdc_micros)/1_000_000,
          quote.amount_usdc_micros,row.payer,quote.network,identity.key),
      db.prepare(`INSERT INTO commerce_purchases (payment_id,quote_id,payment_key,
        proof_hash,recovery_token_hash,payer,owner,status,created_at,updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,'claimed',?8,?8)`)
        .bind(row.payment_id,quote.id,identity.key,identity.proofHash,row.recovery_token_hash,
          row.payer,row.owner,now()),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error?.message || error))) {
      throw new CommerceError("payment_in_progress",409,{retry_after:2,
        hint:"This quote or payment is already claimed. Retry the original purchase; do not re-sign."});
    }
    throw new CommerceError("purchase_record_unavailable",503);
  }
  const snapshot = JSON.parse(quote.snapshot_json);
  let prepared;
  try {
    if (quote.kind === "execution" || snapshot.invoke_kind === "bedrock") {
      await db.prepare("UPDATE commerce_purchases SET status='executing',updated_at=?1 WHERE payment_id=?2 AND owner=?3")
        .bind(now(),row.payment_id,row.owner).run();
      let run;
      if (dependencies.execute) run = await dependencies.execute(request,{paymentId:row.payment_id,sku:quote.sku});
      else if (quote.kind === "execution") {
        const {executeCode} = await import("./execution.js");
        run = await executeCode(env,request.code,request.language,null,null);
      } else {
        const {invokeAgent} = await import("../../../src/lib/bedrock.js");
        run = await invokeAgent(env,snapshot.invoke_key,request);
      }
      if (!run?.ok || run.error) throw new CommerceError("execution_failed",422);
      prepared = {ok:true,sku:quote.sku,version:quote.version,
        result:quote.kind === "execution" ? run.result : {completion:run.completion,sessionId:run.sessionId},
        invocationId:request.invocationId || "initial"};
      const content = canonicalJson(prepared.result);
      if (new TextEncoder().encode(content).length > 750_000) throw new CommerceError("execution_result_too_large",422);
      prepared.content_hash = await sha256(content);
      prepared.content_hash_scope = "result-canonical-json";
    } else {
      await readPayload(env,snapshot.payload);
      prepared = {...snapshot.resolved, manifest_hash:snapshot.manifest_hash};
    }
    await db.prepare(`UPDATE commerce_purchases SET status='prepared',prepared_json=?1,updated_at=?2
      WHERE payment_id=?3 AND owner=?4 AND status IN ('claimed','executing')`)
      .bind(canonicalJson(prepared),now(),row.payment_id,row.owner).run();
  } catch (error) {
    await setFailed(db,row,error.code || "execution_failed");
    throw new CommerceError(error.code || "execution_failed",error.status || 422,
      {paymentId:row.payment_id,recoveryToken,charged:false,quotes:"/api/quotes"});
  }
  const transition = await db.prepare(`UPDATE commerce_purchases SET status='settling',updated_at=?1
    WHERE payment_id=?2 AND owner=?3 AND status='prepared'`).bind(now(),row.payment_id,row.owner).run();
  if (transition.meta.changes !== 1) throw new CommerceError("payment_in_progress",409);
  let settlement;
  try { settlement = await rail.settlePayment(input.paymentPayload,requirements); }
  catch {
    await db.prepare("UPDATE commerce_purchases SET status='uncertain',updated_at=?1 WHERE payment_id=?2 AND status='settling'")
      .bind(now(),row.payment_id).run();
    throw new CommerceError("settlement_pending_recovery",409,
      {paymentId:row.payment_id,recoveryToken,hint:"Settlement outcome is unknown. Do not re-sign."});
  }
  if (!settlement?.success) {
    await setFailed(db,row,"settlement_failed");
    throw new CommerceError("settlement_failed",402,{paymentId:row.payment_id,recoveryToken,
      charged:false,quotes:"/api/quotes",paymentResponse:settlement});
  }
  if (!/^0x[\da-f]{64}$/i.test(settlement.transaction || "")
      || settlement.network !== quote.network
      || (settlement.payer && !sameAddress(settlement.payer,row.payer))) {
    await db.prepare("UPDATE commerce_purchases SET status='uncertain',updated_at=?1 WHERE payment_id=?2")
      .bind(now(),row.payment_id).run();
    throw new CommerceError("settlement_pending_recovery",409,{paymentId:row.payment_id,recoveryToken});
  }
  const receipt = receiptFor(row,quote,settlement);
  receipt.content_hash = prepared.content_hash;
  try { await durableReceipt(env,row,quote,receipt); }
  catch { throw new CommerceError("settlement_pending_recovery",503,
    {paymentId:row.payment_id,recoveryToken,hint:"Payment settled; recovery will repair the purchase record. Do not re-sign."}); }
  try {
    const grant = await recoverGrant(env,row.payment_id,recoveryToken);
    return {body:{...await deliverGrant(env,grant),recoveryToken,redelivery:false},paymentResponse:settlement};
  } catch {
    throw new CommerceError("delivery_pending",503,{paymentId:row.payment_id,recoveryToken,
      charged:true,payment_settled:true,receipt,paymentResponse:settlement,
      recovery:`/api/purchases/${row.payment_id}/delivery`,
      hint:"Payment settled. Save the recovery token and retry delivery; do not pay again."});
  }
}

export async function recoverGrant(env,paymentId,recoveryToken) {
  let row = await authenticatedRow(env,paymentId,recoveryToken);
  const quote = await readQuote(env,row.quote_id,{allowExpired:true});
  row = await reconcileStoredReceipt(env,row,quote);
  const pay = await database(env).prepare("SELECT * FROM payments WHERE id=?1").bind(paymentId).first();
  if (row.status !== "settled" || pay?.status !== "settled" || !/^0x[\da-f]{64}$/i.test(pay.tx_hash || "")) {
    throw new CommerceError("not_settled",409,{paymentId,hint:"Do not submit a new payment."});
  }
  const receipt = JSON.parse(row.receipt_json);
  const snapshot = JSON.parse(quote.snapshot_json);
  return {
    paymentId,sku:quote.sku,payer:pay.payer,txHash:pay.tx_hash,network:pay.network,
    settledAt:pay.settled_at,receipt,payload:snapshot.payload,
    allowedActions:quote.kind === "execution" ? ["execute","deliver"] : ["deliver"],
    recoveryToken,
  };
}

export async function deliverGrant(env,grant) {
  const current = await recoverGrant(env,grant.paymentId,grant.recoveryToken);
  const row = await purchaseRow(database(env),current.paymentId);
  const quote = await readQuote(env,row.quote_id,{allowExpired:true});
  const snapshot = JSON.parse(quote.snapshot_json);
  const prepared = JSON.parse(row.prepared_json);
  let artifact;
  if (snapshot.payload?.via === "r2") {
    const bytes = await readPayload(env,snapshot.payload);
    artifact = {encoding:"base64",data:Buffer.from(bytes).toString("base64"),
      mime_type:snapshot.payload.mime_type,size_bytes:bytes.length,
      content_hash:snapshot.payload.content_hash};
  }
  const body = {...prepared,paymentId:current.paymentId,receipt:current.receipt,
    ...(artifact ? {artifact} : {}),redelivery:true};
  await database(env).prepare("INSERT INTO deliveries (id,payment_id,sku,content_hash) VALUES (?1,?2,?3,?4)")
    .bind(`del_${crypto.randomUUID()}`,current.paymentId,current.sku,body.content_hash).run();
  return body;
}

/** One paid execution buys one result. Repeated RPC calls recover that result. */
export async function executeGrantedInvocation(env,grant,input,_runner) {
  const current = await recoverGrant(env,grant.paymentId,grant.recoveryToken);
  if (!current.allowedActions.includes("execute")) throw new CommerceError("execution_not_entitled",403);
  const row = await purchaseRow(database(env),current.paymentId);
  const quote = await readQuote(env,row.quote_id,{allowExpired:true});
  const request = executionInput(input);
  if (await sha256(canonicalJson(request)) !== quote.request_hash) {
    throw new CommerceError("execution_allowance_exhausted",403,
      {hint:"This purchase includes one invocation. Only its identical result can be recovered."});
  }
  return {...JSON.parse(row.prepared_json),paymentId:current.paymentId,receipt:current.receipt,redelivery:true};
}

/** Public challenge, private one-use wallet signature: never a transfer request. */
export async function createRecoveryChallenge(env,paymentId) {
  const db = database(env);
  const row = await purchaseRow(db,paymentId);
  if (!row) throw new CommerceError("unknown_purchase",404);
  const recent = await db.prepare(`SELECT COUNT(*) AS n FROM commerce_recovery_challenges
    WHERE payment_id=?1 AND expires_at>?2 AND consumed_at IS NULL`).bind(paymentId,Date.now()).first();
  if (recent.n >= 5) throw new CommerceError("recovery_rate_limited",429,{retry_after:300});
  const challengeId = `rc_${crypto.randomUUID()}`;
  const expiresAt = Date.now()+5*60_000;
  const message = `Second Wind purchase recovery\nOrigin: ${ORIGIN}\nPurchase: ${paymentId}\n`+
    `Wallet: ${row.payer}\nNetwork: ${NETWORK}\nChallenge: ${challengeId}\n`+
    `Expires: ${new Date(expiresAt).toISOString()}\n`+
    `Sign only to replace this purchase's recovery credential. This message authorizes no transfer or new charge.`;
  await db.prepare(`INSERT INTO commerce_recovery_challenges (id,payment_id,message,expires_at)
    VALUES (?1,?2,?3,?4)`).bind(challengeId,paymentId,message,expiresAt).run();
  return {challengeId,message,payer:row.payer,expires_at:new Date(expiresAt).toISOString(),
    signature_type:"personal_sign",scope:"replace_purchase_recovery_token"};
}

export async function recoverWithWallet(env,paymentId,{challengeId,signature} = {}) {
  if (typeof challengeId !== "string" || typeof signature !== "string" || signature.length > 20_000) {
    throw new CommerceError("invalid_recovery_proof",401);
  }
  const db = database(env);
  const challenge = await db.prepare(`SELECT * FROM commerce_recovery_challenges
    WHERE id=?1 AND payment_id=?2`).bind(challengeId,paymentId).first();
  const row = await purchaseRow(db,paymentId);
  if (!challenge || !row || challenge.consumed_at || challenge.expires_at < Date.now()) {
    throw new CommerceError("invalid_recovery_proof",401);
  }
  let valid = false;
  try { valid = await verifyMessage({address:row.payer,message:challenge.message,signature}); }
  catch { /* invalid signatures fail closed */ }
  if (!valid) throw new CommerceError("invalid_recovery_proof",401,
    {hint:"Sign the exact challenge with the original payer. Contract wallets should use their retained recovery token."});
  const token = randomToken();
  const stamp = now();
  const expiresCheck = Date.now();
  const changes = await db.batch([
    db.prepare(`UPDATE commerce_purchases SET recovery_token_hash=?1,updated_at=?2
      WHERE payment_id=?3 AND EXISTS (SELECT 1 FROM commerce_recovery_challenges
        WHERE id=?4 AND payment_id=?3 AND consumed_at IS NULL AND expires_at>=?5)`)
      .bind(await sha256(token),stamp,paymentId,challengeId,expiresCheck),
    db.prepare(`UPDATE commerce_recovery_challenges SET consumed_at=?1
      WHERE id=?2 AND payment_id=?3 AND consumed_at IS NULL AND expires_at>=?4`)
      .bind(stamp,challengeId,paymentId,expiresCheck),
  ]);
  if (changes[0].meta.changes !== 1) throw new CommerceError("invalid_recovery_proof",401);
  return {paymentId,recoveryToken:token,recovery:`/api/purchases/${paymentId}/delivery`};
}
