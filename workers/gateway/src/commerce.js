import { verifyMessage } from "viem";
import { confirmPurchaseTransfer } from "./reconciliation.js";
import { checkConfiguration } from "./catalog.js";
import { resolveCapability } from "../../../src/lib/curation.js";
import { enqueueObservation } from "./telemetry.js";
import {
  CommerceError, NETWORK, ORIGIN, canonicalJson, sha256,
  randomToken, validToken, paymentConfig, sameAddress, authorizationKey,
} from "./contracts.js";

export { CommerceError } from "./contracts.js";
const now = () => new Date().toISOString();
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
// A retry may close an abandoned preparation, but never execute it again.
// Prepared results have their own atomic settlement claim and need no timeout.
const PREPARATION_TIMEOUT_MS = 5 * 60_000;

function database(env) {
  if (!env.SW_DB) throw new CommerceError("database_not_configured", 503);
  return env.SW_DB;
}

// Historical commerce_quotes rows remain immutable acceptance snapshots.
// Only the official middleware emits x402 payment requirements.
function publicAcceptance(row) {
  const snapshot = JSON.parse(row.snapshot_json);
  const path = row.kind === "execution" ? "/rpc"
    : `/api/x402/${encodeURIComponent(snapshot.slug || row.sku)}`;
  return {
    acceptanceId: row.id, sku: row.sku, version: row.version,
    price_usd: Number(row.amount_usdc_micros) / 1_000_000,
    price_usdc_micros: row.amount_usdc_micros,
    amount_usdc_micros: row.amount_usdc_micros,
    content_hash: row.content_hash,
    content_hash_scope: snapshot.payload?.hash_scope || "execution-result",
    manifest_hash: snapshot.manifest_hash || null,
    ...(snapshot.scope ? {scope:snapshot.scope} : {}),
    config: JSON.parse(row.config_json),
    max_amount_atomic: snapshot.scope?.max_amount_atomic || row.amount_usdc_micros,
    payment: {rail:"x402", network:row.network, asset:row.asset},
    issued_at: row.created_at, expires_at: new Date(row.expires_at).toISOString(),
    purchase: {
      method: snapshot.purchase_method || (snapshot.invoke_kind === "bedrock" || row.kind === "execution" ? "POST" : "GET"),
      url: `${ORIGIN}${path}?acceptance_id=${encodeURIComponent(row.id)}`,
    },
  };
}

async function renewUnclaimedAcceptance(env, id) {
  const db = database(env), stamp = Date.now();
  await db.prepare(`UPDATE commerce_quotes SET expires_at=?1
    WHERE id=?2 AND expires_at<=?3 AND NOT EXISTS
      (SELECT 1 FROM commerce_purchases WHERE quote_id=?2)`)
    .bind(stamp+5*60_000,id,stamp).run();
  return publicAcceptance(await readQuote(env,id,{allowExpired:true}));
}

async function insertQuote(env, { sku, version, kind, amount, config, snapshot, acceptanceKey, journey }) {
  if (acceptanceKey) {
    const previous=await database(env).prepare('SELECT quote_id FROM component_acceptances WHERE acceptance_key=?1').bind(acceptanceKey).first();
    if(previous) return renewUnclaimedAcceptance(env,previous.quote_id);
  }
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
  const statement = database(env).prepare(`INSERT INTO commerce_quotes
    (id,sku,version,kind,amount_usdc_micros,asset,network,pay_to,config_json,
     request_hash,snapshot_json,content_hash,created_at,expires_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`)
    .bind(row.id,row.sku,row.version,row.kind,row.amount_usdc_micros,row.asset,
      row.network,row.pay_to,row.config_json,row.request_hash,row.snapshot_json,
      row.content_hash,row.created_at,row.expires_at);
  if(acceptanceKey) {
    try {
      await database(env).batch([statement,database(env).prepare('INSERT INTO component_acceptances(acceptance_key,quote_id) VALUES (?1,?2)').bind(acceptanceKey,row.id)]);
    } catch(error) {
      const previous=await database(env).prepare('SELECT quote_id FROM component_acceptances WHERE acceptance_key=?1').bind(acceptanceKey).first();
      if(previous) return renewUnclaimedAcceptance(env,previous.quote_id);
      throw error;
    }
  } else await statement.run();
  if(journey) await enqueueObservation(env,'journey.linked',{journey,payload:{quote_id:row.id}});
  return publicAcceptance(row);
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
export async function createQuote(env, sku, config = {}, {journey,purchaseMethod} = {}) {
  const db = database(env);
  const check = await checkConfiguration(db, sku, config);
  if (!check.ok) throw new CommerceError("incomplete_configuration", 400,
    { missing: check.missing, errors: check.errors });
  const item = await db.prepare("SELECT * FROM items WHERE sku = ?1 AND status = 'live'")
    .bind(check.sku).first();
  if (!item) throw new CommerceError("unknown_product", 404);
  if (item.version !== check.version) throw new CommerceError("product_changed", 409);
  const componentRelease=await db.prepare(`SELECT sku FROM component_releases WHERE sku=?1 AND version=?2
    AND json_type(manifest_json,'$.components')='array' AND json_array_length(manifest_json,'$.components')>0`).bind(item.sku,item.version).first();
  if(componentRelease) throw new CommerceError('component_selection_required',409,{trial:'/api/trials'});
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
    ...(purchaseMethod ? {purchase_method:purchaseMethod} : {}),
    resolved, payload, manifest_hash: await sha256(canonicalJson(resolved)),
  };
  return insertQuote(env, {
    sku: item.sku, version: item.version, kind: "product",
    amount: Math.round(Number(item.price_usd) * 1_000_000),
    config: check.config, snapshot, journey,
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

/** One purchased invocation; component sandbox trials are free and separate. */
export async function createExecutionQuote(env, input, {journey} = {}) {
  const config = executionInput(input);
  return insertQuote(env, {
    sku: "SW-EXEC", version: 1, kind: "execution", amount: "2000", config, journey,
    snapshot: { sku: "SW-EXEC", version: 1, invoke_kind: "codemode", allowedActions: ["execute", "deliver"] },
  });
}

export async function readQuote(env, quoteId, { allowExpired = false } = {}) {
  if (typeof quoteId !== "string" || !/^q_[A-Za-z0-9-]{20,80}$/.test(quoteId)) {
    throw new CommerceError("acceptance_required", 400, { hint: "Preserve the accepted purchase URL." });
  }
  const quote = await database(env).prepare("SELECT * FROM commerce_quotes WHERE id = ?1")
    .bind(quoteId).first();
  if (!quote) throw new CommerceError("unknown_acceptance", 404);
  if (!allowExpired && quote.expires_at < Date.now()) throw new CommerceError("acceptance_expired", 409);
  return quote;
}

// Correlation only. Payment validity is established by the official SDK.
async function paymentIdentity(payload, quote) {
  const auth = payload?.payload?.authorization;
  const signature = payload?.payload?.signature;
  if (!/^0x[\da-f]{64}$/i.test(auth?.nonce || "")
      || !/^0x[\da-f]{40}$/i.test(auth?.from || "") || typeof signature !== "string") {
    throw new CommerceError("unsupported_payment_identity",402);
  }
  return {
    payer: auth.from,
    key: await authorizationKey(quote.network,quote.asset,auth.from,auth.nonce),
    proofHash: await sha256(canonicalJson({authorization:auth,signature})),
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

async function setFailed(db, row, code, settlement = false) {
  const states = settlement ? "'settling'" : "'claimed','executing'";
  await db.batch([
    db.prepare(`UPDATE commerce_purchases SET status='failed',error_code=?1,updated_at=?2
      WHERE payment_id=?3 AND owner=?4 AND status IN (${states})`)
      .bind(code,now(),row.payment_id,row.owner),
    db.prepare(`UPDATE payments SET status='failed' WHERE id=?1 AND status='verified'
      AND EXISTS (SELECT 1 FROM commerce_purchases
        WHERE payment_id=?1 AND owner=?2 AND status='failed')`).bind(row.payment_id,row.owner),
  ]);
}

function preparationExpired(row) {
  return ["claimed", "executing"].includes(row.status)
    && Date.parse(row.updated_at) <= Date.now() - PREPARATION_TIMEOUT_MS;
}

/** Only authenticated callers use this. A changed owner, state or timestamp
 * invalidates the stale observation, including the corresponding ledger write. */
async function closeAbandonedPreparation(db, row) {
  if (!preparationExpired(row)) return row;
  await db.batch([
    db.prepare(`UPDATE commerce_purchases SET status='failed',error_code='preparation_interrupted',updated_at=?1
      WHERE payment_id=?2 AND owner=?3 AND status=?4 AND updated_at=?5
        AND status IN ('claimed','executing')`)
      .bind(now(),row.payment_id,row.owner,row.status,row.updated_at),
    db.prepare(`UPDATE payments SET status='failed' WHERE id=?1 AND status='verified'
      AND EXISTS (SELECT 1 FROM commerce_purchases WHERE payment_id=?1 AND owner=?2
        AND status='failed' AND error_code='preparation_interrupted')`).bind(row.payment_id,row.owner),
  ]);
  return purchaseRow(db,row.payment_id);
}

function failedPurchase(row) {
  return new CommerceError("purchase_failed",409,
    {paymentId:row.payment_id,charged:false,
      ...(row.error_code === "preparation_interrupted"
        ? {execution_outcome:"unknown",hint:"Preparation was interrupted before settlement. This attempt will not execute or settle again. Check any external work before starting another purchase."}
        : {hint:"This attempt failed before confirmed settlement. Check the failure and any external execution effects before starting another purchase."})});
}

function preparedRetry(row, recoveryToken) {
  return new CommerceError("purchase_prepared_retry",503,
    {paymentId:row.payment_id,recoveryToken,charged:false,retry_after:2,
      hint:"The prepared result is saved. Retry this original purchase with the same payment signature and recovery token; do not re-sign."});
}

function pendingSettlement(row, recoveryToken, status = 409) {
  return new CommerceError("settlement_pending_recovery",status,
    {paymentId:row.payment_id,...(recoveryToken ? {recoveryToken} : {}),
      reconciliation:`/api/purchases/${row.payment_id}/reconcile`,
      hint:"The settlement claim or outcome needs recovery. Do not re-sign or submit another payment for this purchase."});
}

function receiptFor(row, quote, settled) {
  return {
    payment_id: row.payment_id, sku: quote.sku, version: quote.version,
    ...(JSON.parse(quote.snapshot_json).scope ? {scope:JSON.parse(quote.snapshot_json).scope} : {}),
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
      facilitator_ref=?5 WHERE id=?4 AND status='verified'`)
      .bind(receipt.tx_hash,row.payer,receipt.settled_at,row.payment_id,receipt.confirmation_source || "cdp"),
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
      || !saved.receipt?.tx_hash || (saved.receipt?.facilitator_response || saved.receipt?.payment_response)?.success !== true
      || saved.receipt.sku !== quote.sku || saved.receipt.network !== quote.network
      || !sameAddress(saved.receipt.pay_to,quote.pay_to)) {
    throw new CommerceError("settlement_record_mismatch", 503);
  }
  await persistSettlement(env,row,quote,saved.receipt);
  return purchaseRow(database(env),row.payment_id);
}

/** Authenticated, read-only chain reconciliation; never enters payment middleware. */
export async function reconcilePurchase(env, paymentId, recoveryToken, {transaction} = {}) {
  const db = database(env);
  let row = await authenticatedRow(env,paymentId,recoveryToken);
  const quote = await readQuote(env,row.quote_id,{allowExpired:true});
  // A failed R2 reader must not prevent independent on-chain confirmation.
  try { row = await reconcileStoredReceipt(env,row,quote); }
  catch (error) { if (error instanceof CommerceError) throw error; }
  if (row.status === "settled") {
    const grant = await recoverGrant(env,paymentId,recoveryToken);
    return {paymentId,status:"settled",receipt:grant.receipt,recovery:`/api/purchases/${paymentId}/delivery`};
  }
  if (!["settling","uncertain"].includes(row.status) || !row.prepared_json) {
    throw new CommerceError("purchase_not_reconcilable",409,{paymentId});
  }
  const payment = await db.prepare("SELECT tx_hash FROM payments WHERE id=?1").bind(paymentId).first();
  const evidence = await confirmPurchaseTransfer(env,row,quote,transaction || payment?.tx_hash);
  // Recheck credentials/state after the bounded network read. A concurrently
  // completed reconciliation is recovered; no settlement owner is replaced.
  row = await authenticatedRow(env,paymentId,recoveryToken);
  if (row.status === "settled") {
    const grant = await recoverGrant(env,paymentId,recoveryToken);
    return {paymentId,status:"settled",receipt:grant.receipt,recovery:`/api/purchases/${paymentId}/delivery`};
  }
  if (!["settling","uncertain"].includes(row.status) || !row.prepared_json) {
    throw new CommerceError("purchase_not_reconcilable",409,{paymentId});
  }
  const response = {success:true,transaction:evidence.transaction,network:evidence.network,payer:evidence.payer};
  const receipt = receiptFor(row,quote,response);
  delete receipt.facilitator_response;
  delete receipt.facilitator;
  receipt.payment_response = response;
  receipt.confirmation_source = "base-finalized-receipt";
  receipt.settled_at = evidence.settled_at;
  receipt.block_hash = evidence.block_hash;
  receipt.block_number = evidence.block_number;
  receipt.content_hash = JSON.parse(row.prepared_json).content_hash;
  try { await durableReceipt(env,row,quote,receipt); }
  catch { throw new CommerceError("settlement_pending_recovery",503,
    {paymentId,charged:true,payment_settled:true,receipt,
      reconciliation:`/api/purchases/${paymentId}/reconcile`,
      hint:"The original transfer is confirmed. Retry reconciliation; do not pay again."}); }
  const grant = await recoverGrant(env,paymentId,recoveryToken);
  return {paymentId,status:"settled",receipt:grant.receipt,recovery:`/api/purchases/${paymentId}/delivery`};
}

/** Resolve application identity and authenticated recovery before payment processing. */
export async function openPurchase(env, input) {
  const db = database(env);
  const quote = await readQuote(env,input.quoteId,{allowExpired:true});
  const request = quote.kind === "execution" ? executionInput(input.requestData) : (input.requestData || {});
  if (await sha256(canonicalJson(request)) !== quote.request_hash) {
    throw new CommerceError("purchase_request_mismatch",409);
  }
  const state = {env,input,quote,request,recoveryToken:input.recoveryToken};
  const existing = await db.prepare("SELECT * FROM commerce_purchases WHERE quote_id=?1").bind(quote.id).first();
  if (existing) {
    if (input.paymentPayload && (await paymentIdentity(input.paymentPayload,quote)).proofHash !== existing.proof_hash) {
      throw new CommerceError("payment_reuse_mismatch",409);
    }
    if (["claimed","executing"].includes(existing.status) && !preparationExpired(existing)) {
      throw new CommerceError("payment_in_progress",409,{paymentId:existing.payment_id,retry_after:2});
    }
    try { await authenticatedRow(env,existing.payment_id,input.recoveryToken); }
    catch (error) {
      if (error.status !== 401) throw error;
      throw new CommerceError(error.code,401,{...error.details,paymentId:existing.payment_id,
        recovery_challenge:`/api/purchases/${existing.payment_id}/recovery-challenge`});
    }
    let row = await closeAbandonedPreparation(db,existing);
    if (row.status === "prepared") { state.row = row; return state; }
    if (["claimed","executing"].includes(row.status)) {
      throw new CommerceError("payment_in_progress",409,{paymentId:row.payment_id,retry_after:2});
    }
    row = await reconcileStoredReceipt(env,row,quote);
    if (row.status === "failed") throw failedPurchase(row);
    if (row.status !== "settled") throw pendingSettlement(row,input.recoveryToken);
    const grant = await recoverGrant(env,row.payment_id,input.recoveryToken);
    if(input.journey) await enqueueObservation(env,'recovery.purchase_replayed',
      {journey:input.journey,payload:{quote_id:quote.id,payment_id:row.payment_id,sku:quote.sku}});
    state.response = {body:{...await deliverGrant(env,grant,{journey:input.journey}),
      recoveryToken:input.recoveryToken,redelivery:true},paymentResponse:grant.paymentResponse};
    return state;
  }
  if (quote.expires_at < Date.now()) throw new CommerceError("acceptance_expired",409);
  const config = paymentConfig(env);
  if (!sameAddress(config.payTo,quote.pay_to)) throw new CommerceError("acceptance_recipient_changed",409);
  state.recoveryToken ||= randomToken();
  if (!validToken(state.recoveryToken)) throw new CommerceError("invalid_recovery_token",400);
  return state;
}

/** Called only by the official SDK's positively verified lifecycle hook. */
export async function claimVerifiedPurchase(state, {paymentPayload,result}) {
  const {env,quote,recoveryToken} = state;
  const db = database(env);
  if (result?.isValid !== true) throw new CommerceError("payment_verification_failed",402);
  const identity = await paymentIdentity(paymentPayload,quote);
  if (result.payer && !sameAddress(result.payer,identity.payer)) {
    throw new CommerceError("payment_payer_mismatch",402);
  }
  if (state.row) {
    if (state.row.payment_key !== identity.key || state.row.proof_hash !== identity.proofHash) {
      throw new CommerceError("payment_reuse_mismatch",409);
    }
    return;
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
        hint:"This accepted purchase or payment is already claimed. Retry the original purchase; do not re-sign."});
    }
    throw new CommerceError("purchase_record_unavailable",503);
  }
  state.row = row;
}

/** Only the still-live, fenced owner can allow SDK settlement. */
export async function claimPurchaseSettlement(state) {
  const {env,quote,recoveryToken} = state;
  const row = state.row;
  if (!row || row.status !== "prepared") throw new CommerceError("purchase_not_prepared",409);
  const config = paymentConfig(env);
  if (!sameAddress(config.payTo,quote.pay_to)) throw new CommerceError("acceptance_recipient_changed",409);
  const db = database(env);
  const owner = crypto.randomUUID();
  let claimed = false;
  try {
    const transition = await db.prepare(`UPDATE commerce_purchases SET status='settling',owner=?1,updated_at=?2
      WHERE payment_id=?3 AND owner=?4 AND status='prepared'`)
      .bind(owner,now(),row.payment_id,row.owner).run();
    // D1 includes trigger writes in meta.changes. The PK/owner/state predicate
    // can update at most one purchase, but its outbox trigger also writes.
    claimed = transition.meta.changes > 0;
  } catch {
    // A D1 response may be lost after its write commits. Only this still-live
    // invocation knows it has not called the rail under its unique owner yet.
    // If readback is unavailable, leave the durable state for normal recovery.
    let current;
    try { current = await purchaseRow(db,row.payment_id); }
    catch { throw pendingSettlement(row,recoveryToken,503); }
    if (current?.status === "prepared") throw preparedRetry(current,recoveryToken);
    claimed = current?.status === "settling" && current.owner === owner;
    if (!claimed) {
      if (current?.status === "failed") throw failedPurchase(current);
      throw pendingSettlement(row,recoveryToken);
    }
  }
  if (!claimed) {
    const current = await purchaseRow(db,row.payment_id);
    if (current?.status === "failed") throw failedPurchase(current);
    throw pendingSettlement(row,recoveryToken);
  }
  state.row = {...row,owner,status:"settling"};
}

export async function recordUncertainSettlement(state, outcome) {
  const {env,row,quote,recoveryToken} = state;
  state.error = pendingSettlement(row,recoveryToken);
  const db = database(env);
  const statements = [db.prepare("UPDATE commerce_purchases SET status='uncertain',updated_at=?1 WHERE payment_id=?2 AND owner=?3 AND status='settling'")
    .bind(now(),row.payment_id,row.owner)];
  if (outcome?.network === quote.network && /^0x[\da-f]{64}$/i.test(outcome.transaction || "")) {
    // A broadcast hash is reconciliation evidence, never a settled entitlement.
    state.error.details.transaction = outcome.transaction;
    statements.push(db.prepare(`UPDATE payments SET tx_hash=?1 WHERE id=?2 AND status='verified'
      AND EXISTS (SELECT 1 FROM commerce_purchases WHERE payment_id=?2 AND owner=?3 AND status='uncertain')`)
      .bind(outcome.transaction,row.payment_id,row.owner));
  }
  await db.batch(statements);
}

/** A transfer and the application stores are not an atomic transaction. */
export async function recordPurchaseSettlement(state, settlement) {
  const {env,row,quote,recoveryToken} = state;
  state.settlement = settlement;
  if (!/^0x[\da-f]{64}$/i.test(settlement.transaction || "")
      || settlement.network !== quote.network
      || (settlement.payer && !sameAddress(settlement.payer,row.payer))) {
    await recordUncertainSettlement(state);
    return;
  }
  const receipt = receiptFor(row,quote,settlement);
  receipt.content_hash = JSON.parse(row.prepared_json).content_hash;
  try { await durableReceipt(env,row,quote,receipt); }
  catch {
    state.error = new CommerceError("settlement_pending_recovery",503,
      {paymentId:row.payment_id,recoveryToken,charged:true,payment_settled:true,receipt,
        hint:"Payment settled; receipt persistence needs recovery. Do not pay again."});
    return;
  }
  state.receipt = receipt;
}

export async function finishPurchase(state) {
  if (state.error) throw state.error;
  const {env,row,input,recoveryToken,receipt,settlement} = state;
  if (!receipt) throw pendingSettlement(row,recoveryToken,503);
  try {
    const grant = await recoverGrant(env,row.payment_id,recoveryToken);
    return {body:{...await deliverGrant(env,grant,{journey:input.journey}),recoveryToken,redelivery:false},
      paymentResponse:settlement};
  } catch {
    throw new CommerceError("delivery_pending",503,{paymentId:row.payment_id,recoveryToken,
      charged:true,payment_settled:true,receipt,recovery:`/api/purchases/${row.payment_id}/delivery`,
      hint:"Payment settled. Retry delivery with your recovery token; do not pay again."});
  }
}

/** Persist the original result before the payment middleware may settle. */
export async function preparePurchase(state, dependencies = {}) {
  const {env,row,quote,input,request,recoveryToken} = state;
  const db = database(env);
  if (row.status === "prepared") return row;
  const snapshot = JSON.parse(quote.snapshot_json);
  let prepared;
  try {
    if (quote.kind === "execution" || snapshot.invoke_kind === "bedrock") {
      const entered = await db.prepare("UPDATE commerce_purchases SET status='executing',updated_at=?1 WHERE payment_id=?2 AND owner=?3 AND status='claimed'")
        .bind(now(),row.payment_id,row.owner).run();
      if (entered.meta.changes !== 1) throw new CommerceError("preparation_interrupted",409);
      let run;
      if (dependencies.execute) run = await dependencies.execute(request,{paymentId:row.payment_id,sku:quote.sku});
      else if (quote.kind === "execution") {
        const {executeCode} = await import("./execution.js");
        run = await executeCode(env,request.code,request.language,null,null,{journey:input.journey});
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
    const saved = await db.prepare(`UPDATE commerce_purchases SET status='prepared',prepared_json=?1,updated_at=?2
      WHERE payment_id=?3 AND owner=?4 AND status IN ('claimed','executing')`)
      .bind(canonicalJson(prepared),now(),row.payment_id,row.owner).run();
    if (saved.meta.changes !== 1) throw new CommerceError("preparation_interrupted",409);
  } catch (error) {
    // Never erase a result whose write committed but lost its acknowledgement,
    // or mark a competing settlement owner failed while cleaning up this call.
    let current;
    try {
      current = await purchaseRow(db,row.payment_id);
      if (current?.status === "prepared") throw preparedRetry(current,recoveryToken);
      if (["settling","uncertain","settled"].includes(current?.status)) {
        throw pendingSettlement(current,recoveryToken);
      }
      await setFailed(db,row,error.code || "execution_failed");
    } catch (cleanupError) {
      if (cleanupError instanceof CommerceError) throw cleanupError;
      throw new CommerceError("purchase_preparation_pending",503,
        {paymentId:row.payment_id,recoveryToken,retry_after:2,
          hint:"Preparation could not be confirmed. Retry only the original purchase; abandoned preparation will close without re-executing or settling."});
    }
    if (current?.status === "failed" || error.code === "preparation_interrupted") {
      throw failedPurchase(current || row);
    }
    throw new CommerceError(error.code || "execution_failed",error.status || 422,
      {paymentId:row.payment_id,recoveryToken,charged:false,
        hint:"Preparation failed before settlement. Check any external execution effects before starting another purchase."});
  }
  return {...row,status:"prepared",prepared_json:canonicalJson(prepared)};
}

export async function recoverGrant(env,paymentId,recoveryToken) {
  let row = await authenticatedRow(env,paymentId,recoveryToken);
  const quote = await readQuote(env,row.quote_id,{allowExpired:true});
  row = await closeAbandonedPreparation(database(env),row);
  if (row.status === "failed") throw failedPurchase(row);
  if (row.status === "prepared") throw new CommerceError("purchase_prepared_retry",409,
    {paymentId,charged:false,hint:"The prepared result is saved. Retry the original purchase with its payment signature and recovery token; do not re-sign."});
  row = await reconcileStoredReceipt(env,row,quote);
  const pay = await database(env).prepare("SELECT * FROM payments WHERE id=?1").bind(paymentId).first();
  if (row.status !== "settled" || pay?.status !== "settled" || !/^0x[\da-f]{64}$/i.test(pay.tx_hash || "")) {
    throw new CommerceError("not_settled",409,{paymentId,reconciliation:`/api/purchases/${paymentId}/reconcile`,hint:"Do not submit a new payment."});
  }
  const receipt = JSON.parse(row.receipt_json);
  const snapshot = JSON.parse(quote.snapshot_json);
  return {
    paymentId,sku:quote.sku,payer:pay.payer,txHash:pay.tx_hash,network:pay.network,
    settledAt:pay.settled_at,receipt,paymentResponse:receipt.facilitator_response || receipt.payment_response,payload:snapshot.payload,
    ...(snapshot.scope ? {scope:snapshot.scope} : {}),
    allowedActions:quote.kind === "execution" ? ["execute","deliver"] : ["deliver"],
    recoveryToken,
  };
}

async function prepareGrantDelivery(env,grant) {
  const current = await recoverGrant(env,grant.paymentId,grant.recoveryToken);
  const row = await purchaseRow(database(env),current.paymentId);
  const quote = await readQuote(env,row.quote_id,{allowExpired:true});
  const snapshot = JSON.parse(quote.snapshot_json);
  const prepared = JSON.parse(row.prepared_json);
  let artifact,files;
  if (snapshot.payload?.via === "r2") {
    const bytes = await readPayload(env,snapshot.payload);
    artifact = {encoding:"base64",data:Buffer.from(bytes).toString("base64"),
      mime_type:snapshot.payload.mime_type,size_bytes:bytes.length,
      content_hash:snapshot.payload.content_hash};
    if (snapshot.payload.hash_scope==='selected-files-canonical-json') {
      files=JSON.parse(new TextDecoder().decode(bytes));
      await verifySelectedFiles(files,snapshot.scope);
    }
  }
  const body = {...prepared,paymentId:current.paymentId,receipt:current.receipt,
    ...(artifact ? {artifact} : {}),...(files ? {files} : {}),redelivery:true};
  const deliveryId=`del_${crypto.randomUUID()}`;
  await database(env).prepare("INSERT INTO deliveries (id,payment_id,sku,content_hash) VALUES (?1,?2,?3,?4)")
    .bind(deliveryId,current.paymentId,current.sku,body.content_hash).run();
  return {body,deliveryId,quoteId:quote.id};
}

export async function deliverGrant(env,grant,{journey}={}) {
  try {
    const {body,deliveryId,quoteId}=await prepareGrantDelivery(env,grant);
    if(journey) await enqueueObservation(env,'delivery.prepared',{journey,
      observationId:deliveryId,payload:{quote_id:quoteId,payment_id:grant.paymentId,
        sku:grant.sku,delivery_id:deliveryId}});
    return body;
  } catch(error) {
    if(journey) await enqueueObservation(env,'delivery.failed',{journey,
      payload:{payment_id:grant.paymentId,sku:grant.sku}});
    throw error;
  }
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
export async function createRecoveryChallenge(env,paymentId,{journey}={}) {
  const db = database(env);
  const row = await purchaseRow(db,paymentId);
  if (!row) throw new CommerceError("unknown_purchase",404);
  const stamp = Date.now();
  const present = await db.prepare(`SELECT * FROM commerce_recovery_challenges
    WHERE payment_id=?1 AND expires_at>?2 AND consumed_at IS NULL
    ORDER BY expires_at DESC,id LIMIT 1`).bind(paymentId,stamp).first();
  const describe = challenge => ({challengeId:challenge.id,message:challenge.message,payer:row.payer,
    expires_at:new Date(challenge.expires_at).toISOString(),signature_type:"personal_sign",scope:"replace_purchase_recovery_token"});
  if (present) return describe(present);
  // Concurrent requests within the window converge on one public challenge.
  // Only the payer can consume it. New requests cannot exhaust a buyer's slots.
  const digest = await sha256(canonicalJson({paymentId,
    generation:row.recovery_token_hash,window:Math.floor(stamp/(5*60_000))}));
  const challengeId = `rc_${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
  const expiresAt = stamp+5*60_000;
  const message = `Second Wind purchase recovery\nOrigin: ${ORIGIN}\nPurchase: ${paymentId}\n`+
    `Wallet: ${row.payer}\nNetwork: ${NETWORK}\nChallenge: ${challengeId}\n`+
    `Expires: ${new Date(expiresAt).toISOString()}\n`+
    `Sign only to replace this purchase's recovery credential. This message authorizes no transfer or new charge.`;
  const created = await db.prepare(`INSERT INTO commerce_recovery_challenges (id,payment_id,message,expires_at)
    VALUES (?1,?2,?3,?4) ON CONFLICT(id) DO NOTHING`).bind(challengeId,paymentId,message,expiresAt).run();
  const saved = await db.prepare("SELECT * FROM commerce_recovery_challenges WHERE id=?1").bind(challengeId).first();
  if (!saved || saved.consumed_at || saved.expires_at<=Date.now()) {
    throw new CommerceError("recovery_challenge_changed",409,{hint:"Request the current wallet recovery challenge."});
  }
  if(journey && created.meta.changes>0) await enqueueObservation(env,'recovery.challenge_created',
    {journey,payload:{payment_id:paymentId,challenge_id:challengeId}});
  return describe(saved);
}

export async function recoverWithWallet(env,paymentId,{challengeId,signature} = {},{journey}={}) {
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
  const tokenHash = await sha256(token);
  const changes = await db.batch([
    db.prepare(`UPDATE commerce_purchases SET recovery_token_hash=?1,updated_at=?2
      WHERE payment_id=?3 AND EXISTS (SELECT 1 FROM commerce_recovery_challenges
        WHERE id=?4 AND payment_id=?3 AND consumed_at IS NULL AND expires_at>=?5)`)
      .bind(tokenHash,stamp,paymentId,challengeId,expiresCheck),
    db.prepare(`UPDATE commerce_recovery_challenges SET consumed_at=?1
      WHERE id=?2 AND payment_id=?3 AND consumed_at IS NULL AND expires_at>=?4`)
      .bind(stamp,challengeId,paymentId,expiresCheck),
    db.prepare(`UPDATE commerce_recovery_challenges SET consumed_at=?1
      WHERE payment_id=?2 AND consumed_at IS NULL AND EXISTS
        (SELECT 1 FROM commerce_purchases WHERE payment_id=?2 AND recovery_token_hash=?3)`)
      .bind(stamp,paymentId,tokenHash),
  ]);
  if (changes[0].meta.changes !== 1) throw new CommerceError("invalid_recovery_proof",401);
  if(journey) await enqueueObservation(env,'recovery.credential_rotated',
    {journey,payload:{payment_id:paymentId,challenge_id:challengeId}});
  return {paymentId,recoveryToken:token,recovery:`/api/purchases/${paymentId}/delivery`};
}

/** Internal final acceptance record. The buyer selected these exact files after trial.
 * Existing x402 machinery signs/settles this amount; it cannot substitute full price.
 */
export async function createScopeQuote(env, {product,scope,files,configuration,acceptanceKey,journey}) {
  await verifySelectedFiles(files,scope);
  const content = canonicalJson(files);
  const content_hash = await sha256(content);
  const rail = paymentConfig(env);
  if (scope.network !== rail.network || !sameAddress(scope.asset,rail.asset)) {
    throw new CommerceError('scope_payment_rail_mismatch',409);
  }
  if (!env.PAYLOADS) throw new CommerceError('payload_store_not_configured',503);
  const r2_key=`selections/${scope.release_hash}/${scope.scope_hash}/${content_hash}.json`;
  let object=await env.PAYLOADS.get(r2_key);
  if (!object) {
    await env.PAYLOADS.put(r2_key,content,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    object=await env.PAYLOADS.get(r2_key);
  }
  if (!object || await sha256(new Uint8Array(await object.arrayBuffer()))!==content_hash) {
    throw new CommerceError('selection_payload_not_persisted',503);
  }
  const resolved = {ok:true,sku:product.sku,version:product.version,scope,
    content_hash,content_hash_scope:'selected-files-canonical-json'};
  const payload = {via:'r2',r2_bucket:'secondwind-payloads',r2_key,content_hash,
    size_bytes:new TextEncoder().encode(content).byteLength,
    mime_type:'application/json',hash_scope:'selected-files-canonical-json'};
  return insertQuote(env,{sku:product.sku,version:product.version,kind:'product',
    amount:scope.amount_atomic,config:configuration,acceptanceKey,journey,
    snapshot:{sku:product.sku,slug:product.slug,version:product.version,
      invoke_kind:'resolve',payload,resolved,scope,manifest_hash:scope.release_hash}});
}

async function verifySelectedFiles(files,scope) {
  if (!Array.isArray(files) || !Array.isArray(scope?.files) || files.length!==scope.files.length) {
    throw new CommerceError('selection_payload_mismatch',409);
  }
  const expected=new Map(scope.files.map(file=>[file.path,file]));
  const seen=new Set();
  for (const file of files) {
    const spec=expected.get(file?.path);
    if (!spec || seen.has(file.path) || typeof file.content!=='string'
      || new TextEncoder().encode(file.content).byteLength!==spec.size_bytes
      || await sha256(file.content)!==spec.sha256) throw new CommerceError('selection_payload_mismatch',409);
    seen.add(file.path);
  }
}
