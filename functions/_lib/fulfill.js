/**
 * Second Wind payload fulfillment — R2-backed delivery.
 *
 * Flow: payment settled -> resolve payload_objects for SKU (latest version)
 * -> create delivery_grants row (idempotent) -> fetch bytes from R2
 * -> return content. The existing `deliveries` table remains the audit log;
 * `delivery_grants` is the fulfillment join (payment -> payload object).
 *
 * R2 buckets (deployed 2026-10-18):
 *   secondwind-payloads   — canonical, immutable payload content.
 *                           Key shape: payloads/{sku}/v{version}/{filename}
 *   secondwind-deliveries — per-purchase packaged artifacts (receipts, zips).
 *                           Key shape: deliveries/{payment_id}/{filename}
 *
 * Bindings required on the Pages project:
 *   PAYLOADS   -> R2 bucket secondwind-payloads
 *   DELIVERIES -> R2 bucket secondwind-deliveries
 *
 * Content addressing: payload_objects.content_hash is sha256 hex of the
 * exact bytes in R2. The fulfillment path verifies the hash before
 * delivery; a mismatch is a 500, never a silent wrong-payload.
 */

/**
 * Resolve the latest payload object for a SKU.
 * Returns null when the SKU has no R2 payload (falls back to D1 guidance).
 */
export async function payloadForSku(env, sku) {
  return await env.SW_DB.prepare(
    `SELECT id, sku, r2_bucket, r2_key, content_hash, size_bytes, mime_type, version
     FROM payload_objects WHERE sku = ?1 ORDER BY version DESC LIMIT 1`
  )
    .bind(sku)
    .first();
}

/**
 * Record a delivery grant (idempotent). Returns { granted: true } on first
 * grant, { granted: false, existing: true } when the payment already has
 * access to this payload (re-delivery path).
 */
export async function grantDelivery(env, paymentId, payloadId) {
  const id = `dg_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  try {
    await env.SW_DB.prepare(
      `INSERT INTO delivery_grants (id, payment_id, payload_id) VALUES (?1, ?2, ?3)`
    )
      .bind(id, paymentId, payloadId)
      .run();
    return { granted: true, id };
  } catch (err) {
    if (String(err?.message || err).includes("UNIQUE")) {
      return { granted: false, existing: true };
    }
    throw err;
  }
}

/**
 * Fetch payload bytes from R2 and verify the content hash.
 * Throws on missing object or hash mismatch.
 */
export async function fetchPayload(env, payload) {
  const bucket = payload.r2_bucket === "secondwind-deliveries" ? env.DELIVERIES : env.PAYLOADS;
  if (!bucket) {
    throw new Error(`R2 binding missing for bucket ${payload.r2_bucket}`);
  }
  const obj = await bucket.get(payload.r2_key);
  if (!obj) {
    throw new Error(`payload object not found: ${payload.r2_bucket}/${payload.r2_key}`);
  }
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hash !== payload.content_hash) {
    throw new Error(
      `payload hash mismatch for ${payload.sku} v${payload.version}: expected ${payload.content_hash.slice(0, 12)}…, got ${hash.slice(0, 12)}…`
    );
  }
  return { bytes, mimeType: payload.mime_type || "application/octet-stream" };
}

/**
 * Full fulfillment: grant + fetch. Returns { bytes, mimeType, payload }.
 * Call after payment settlement. Safe to retry: the grant is idempotent
 * and the bytes are content-addressed.
 */
export async function fulfill(env, paymentId, sku) {
  const payload = await payloadForSku(env, sku);
  if (!payload) {
    return { r2: false }; // caller falls back to D1 guidance
  }
  await grantDelivery(env, paymentId, payload.id);
  const { bytes, mimeType } = await fetchPayload(env, payload);
  return { r2: true, bytes, mimeType, payload };
}

/**
 * Register a new payload object (used at publish time, not per purchase).
 * Uploads bytes to R2, computes the hash, inserts the payload_objects row,
 * and flips the item to invoke_kind='r2'.
 */
export async function publishPayload(env, sku, filename, bytes, mimeType) {
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const contentHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const row = await env.SW_DB.prepare(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM payload_objects WHERE sku = ?1`
  )
    .bind(sku)
    .first();
  const version = row?.v ?? 1;
  const r2Key = `payloads/${sku}/v${version}/${filename}`;

  await env.PAYLOADS.put(r2Key, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { sku, version: String(version), sha256: contentHash },
  });

  const id = `po_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  await env.SW_DB.prepare(
    `INSERT INTO payload_objects (id, sku, r2_bucket, r2_key, content_hash, size_bytes, mime_type, version)
     VALUES (?1, ?2, 'secondwind-payloads', ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(id, sku, r2Key, contentHash, bytes.byteLength, mimeType, version)
    .run();

  await env.SW_DB.prepare(
    `UPDATE items SET invoke_kind = 'r2', invoke_key = ?1, content_hash = ?2, version = ?3 WHERE sku = ?4`
  )
    .bind(r2Key, contentHash, version, sku)
    .run();

  return { id, sku, version, r2Key, contentHash, sizeBytes: bytes.byteLength };
}
