/**
 * Second Wind — Shared product-service functions.
 * ============================================================================
 * STATUS: Single source of truth for product operations. Called by the HTTP
 * handlers (index.js) AND the Cap'n Web ProductService RpcTarget below. One
 * product contract, one purchase state, every interface.
 *
 * HOW THE PRIMITIVES INTERACT
 * ---------------------------
 * D1 (`second-wind-catalog`) is the durable authority: `items` for the live
 * catalog, `payments` for purchase records. The `idempotency_key` UNIQUE index
 * on payments is the structural no-double-charge guard — the database itself
 * refuses a second charge for the same signed payment. Cap'n Web's RpcTarget
 * classes below are thin wrappers: they validate the grant, then delegate to
 * these same functions. No interface reimplements commerce logic.
 *
 * WHY SHARED FUNCTIONS (backed by hard constraints)
 * --------------------------------------------------
 * Mike: "Make both interfaces and Code Mode call the same product-service
 * functions." Two interfaces with separate commerce logic drift — the exact
 * failure mode the handoff's "one purchase state" rule exists to prevent.
 * (Constraint: founder architecture rule.)
 *
 * GRANT MODEL
 * -----------
 * A grant is a settled payment row. `checkEntitlement` verifies
 * status='settled' and returns the grant. `getGrant`/`recoverSession` wrap it
 * in a GrantCapability RpcTarget — the object-capability model: possessing the
 * capability IS the authorization. After a disconnect, the buyer re-presents
 * their paymentId; we re-read D1 and reissue. The facilitator is never
 * touched, so reissue can never charge again.
 */

import { RpcTarget } from "capnweb";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** Public product metadata. NEVER includes `guidance` (paid content). */
export async function describeProduct(db, sku) {
  const row = await db
    .prepare(
      `SELECT sku, slug, name, kind, service, summary, price_usd,
              input_schema, input_example, mime_type, license_spdx,
              provenance, content_hash, version
       FROM items WHERE (sku = ?1 OR slug = ?1) AND status = 'live'`
    )
    .bind(sku)
    .first();
  if (!row) throw new Error(`unknown_product: ${sku}`);
  return row;
}

/** Free-text catalog search over live products. Discovery only. */
export async function searchCatalog(db, query, limit = 10) {
  const q = `%${String(query || "").slice(0, 100)}%`;
  const rows = await db
    .prepare(
      `SELECT sku, slug, name, kind, service, summary, price_usd, version
       FROM items
       WHERE status = 'live'
         AND (name LIKE ?1 OR summary LIKE ?1 OR service LIKE ?1 OR sku LIKE ?1)
       ORDER BY kind, service, sku LIMIT ?2`
    )
    .bind(q, Math.min(Math.max(limit | 0, 1), 50))
    .all();
  return rows.results || [];
}

/**
 * Validate a buyer-supplied configuration against the product contract.
 * Returns {ok:true} or {ok:false, missing:[...], errors:[...]} — never throws
 * for a validation failure (only for unknown product). Deterministic: no
 * model calls, no inference.
 */
export async function checkConfiguration(db, sku, config) {
  const product = await describeProduct(db, sku); // throws unknown_product
  const cfg = config && typeof config === "object" ? config : {};
  const missing = [];
  const errors = [];

  // Language is required for executable kinds; guides are language-agnostic.
  const executableKinds = ["tool", "workflow", "artifact", "agent"];
  if (executableKinds.includes(product.kind) && !cfg.language) {
    missing.push({
      field: "language",
      question: "What programming language do you want the product delivered in?",
    });
  }

  // Validate against input_schema when the product declares one.
  if (product.input_schema) {
    try {
      const schema = JSON.parse(product.input_schema);
      const required = schema.required || [];
      for (const field of required) {
        if (cfg[field] === undefined) {
          missing.push({ field, question: `Missing required field: ${field}` });
        }
      }
    } catch {
      // Malformed schema is a catalog defect, not a buyer error.
      errors.push("product input_schema is not valid JSON (catalog defect)");
    }
  }

  return {
    ok: missing.length === 0 && errors.length === 0,
    sku: product.sku,
    version: product.version,
    missing,
    errors,
  };
}

/**
 * Build an immutable quote. The quote binds sku + version + price + config so
 * the purchase cannot drift between quote and settlement.
 */
export async function quoteProduct(db, sku, config) {
  const check = await checkConfiguration(db, sku, config);
  if (!check.ok) {
    const err = new Error("incomplete_configuration");
    err.missing = check.missing;
    err.errors = check.errors;
    throw err;
  }
  const product = await describeProduct(db, sku);
  const quoteId =
    "q_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return {
    quoteId,
    sku: product.sku,
    slug: product.slug,
    version: product.version,
    price_usd: product.price_usd,
    content_hash: product.content_hash,
    config: config || {},
    issued_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Entitlement (durable purchase records)
// ---------------------------------------------------------------------------

/**
 * Verify a settled payment and return the grant. Throws on unknown purchase
 * or unsettled status. This is the single entitlement check — HTTP handlers
 * and Cap'n Web methods both call it.
 */
export async function checkEntitlement(db, paymentId) {
  const pay = await db
    .prepare(`SELECT * FROM payments WHERE id = ?1`)
    .bind(paymentId)
    .first();
  if (!pay) throw new Error(`unknown_purchase: ${paymentId}`);
  if (pay.status !== "settled") {
    throw new Error(`not_settled: ${paymentId} status=${pay.status}`);
  }
  return {
    paymentId: pay.id,
    sku: pay.sku,
    payer: pay.payer,
    txHash: pay.tx_hash,
    network: pay.network,
    settledAt: pay.settled_at,
  };
}

/**
 * Reissue a capability from the durable record. Reads D1 only — never calls
 * the facilitator, so this can never initiate a charge.
 */
export async function recoverPurchase(db, paymentId) {
  return checkEntitlement(db, paymentId);
}

/**
 * Record an /rpc metered-execution payment. Idempotent: the UNIQUE
 * idempotency_key means a retried request inserts zero new rows.
 */
export async function recordRpcPayment(db, { payer, amountMicros, idempotencyKey, txHash }) {
  const id =
    "pay_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try {
    await db
      .prepare(
        `INSERT INTO payments
           (id, sku, price_usd, amount_usdc_micros, payer, tx_hash,
            network, scheme, idempotency_key, status, settled_at)
         VALUES (?1, 'SW-EXEC', 0.002, ?2, ?3, ?4,
                 'eip155:8453', 'ExactEvmScheme', ?5, 'settled', datetime('now'))`
      )
      .bind(id, String(amountMicros), payer || "", txHash || "", idempotencyKey)
      .run();
    return { id, duplicate: false };
  } catch (e) {
    // UNIQUE violation on idempotency_key → already recorded. Return existing.
    if (String(e && e.message).includes("UNIQUE")) {
      const existing = await db
        .prepare(`SELECT id FROM payments WHERE idempotency_key = ?1`)
        .bind(idempotencyKey)
        .first();
      return { id: existing ? existing.id : null, duplicate: true };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Execution (isolated Code Mode)
// ---------------------------------------------------------------------------

/** Capability surface: the ONLY functions buyer code can call. */
function buildProviders(env, grant) {
  return {
    // Search the product baseline (metadata only — never source, never guidance).
    async search(query) {
      const rows = await searchCatalog(env.SW_DB, query, 10);
      return { results: rows };
    },
    // Describe a product (public metadata).
    async describe(sku) {
      return describeProduct(env.SW_DB, sku);
    },
    // Grant-scoped: which SKU this execution is entitled to.
    async entitlement() {
      return grant ? { sku: grant.sku, paymentId: grant.paymentId } : null;
    },
  };
}

/**
 * Execute buyer code in a fresh isolate via the worker_loaders binding.
 * Zero Durable Objects — the stateless DynamicWorkerExecutor path. Each call
 * spawns an isolated Worker; buyer code never shares state across journeys.
 */
export async function executeCode(env, code, language, grant, onProgress) {
  if (typeof code !== "string" || code.length === 0) {
    throw new Error("missing_code");
  }
  if (code.length > 65536) {
    throw new Error("code_too_large");
  }
  if (onProgress) {
    // Bidirectional callback: server → client over the WebSocket session.
    // onProgress is a client-provided RpcTarget; we invoke its report method.
    await onProgress.report("start", { language: language || "javascript" });
  }
  const executor = new DynamicWorkerExecutor({ loader: env.LOADER });
  try {
    const result = await executor.execute(
      code,
      buildProviders(env, grant),
      {}
    );
    if (onProgress) await onProgress.report("complete", { ok: true });
    return { ok: true, result };
  } catch (err) {
    if (onProgress) await onProgress.report("complete", { ok: false });
    return {
      ok: false,
      error: String((err && err.message) || err).slice(0, 500),
    };
  }
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Deliver the purchased product for a settled grant. Resolves the payload via
 * delivery_grants → payload_objects (R2), falling back to the items.guidance
 * column when no R2 payload is published yet. Returns the exact bytes/hash the
 * buyer is entitled to — never another SKU's payload.
 */
export async function deliverProduct(db, grant) {
  // 1. Prefer an explicit grant → payload binding.
  const link = await db
    .prepare(
      `SELECT po.r2_bucket, po.r2_key, po.content_hash, po.size_bytes, po.mime_type, po.version
       FROM delivery_grants dg
       JOIN payload_objects po ON po.id = dg.payload_id
       JOIN payments p ON p.id = dg.payment_id
       WHERE dg.payment_id = ?1 AND po.sku = p.sku
       LIMIT 1`
    )
    .bind(grant.paymentId)
    .first();
  if (link) {
    return {
      via: "r2",
      r2_bucket: link.r2_bucket,
      r2_key: link.r2_key,
      content_hash: link.content_hash,
      size_bytes: link.size_bytes,
      mime_type: link.mime_type,
      version: link.version,
      sku: grant.sku,
    };
  }

  // 2. Fallback: inline guidance for products without a published R2 payload.
  const item = await db
    .prepare(
      `SELECT sku, version, content_hash, mime_type, guidance
       FROM items WHERE sku = ?1 AND status = 'live'`
    )
    .bind(grant.sku)
    .first();
  if (!item) throw new Error(`product_unavailable: ${grant.sku}`);
  return {
    via: "inline",
    sku: item.sku,
    version: item.version,
    content_hash: item.content_hash,
    mime_type: item.mime_type || "text/markdown",
    guidance: item.guidance,
  };
}

// ---------------------------------------------------------------------------
// Cap'n Web interface
// ---------------------------------------------------------------------------

/**
 * GrantCapability: the object-capability a buyer holds after payment.
 * Possessing this object IS the authorization — methods are already scoped to
 * the grant's SKU and payment. Returned by getGrant/recoverSession.
 */
export class GrantCapability extends RpcTarget {
  constructor(env, grant) {
    super();
    this.env = env;
    this.grant = grant;
  }

  /** Execute code in the isolated sandbox, scoped to this grant. */
  async execute(code, language, onProgress) {
    return executeCode(this.env, code, language, this.grant, onProgress);
  }

  /** Deliver the purchased product bytes/metadata. */
  async deliver() {
    return deliverProduct(this.env.SW_DB, this.grant);
  }

  /** Which purchase this capability is bound to. */
  async info() {
    return {
      paymentId: this.grant.paymentId,
      sku: this.grant.sku,
      settledAt: this.grant.settledAt,
      txHash: this.grant.txHash,
    };
  }
}

/**
 * ProductService: the Cap'n Web root. Free methods (describe, search,
 * checkConfiguration, quoteProduct) need no grant. Paid methods go through
 * getGrant/recoverSession, which verify the durable D1 purchase record.
 *
 * Served via newWorkersRpcResponse: WebSocket upgrade → bidirectional
 * session (server can call client-provided callbacks); plain POST → HTTP
 * batch (promise pipelining still applies — no awaits, one round trip).
 */
export class ProductService extends RpcTarget {
  constructor(env) {
    super();
    this.env = env;
  }

  // -- free: discovery & configuration ------------------------------------
  async describeProduct(sku) {
    return describeProduct(this.env.SW_DB, sku);
  }

  async searchCatalog(query, limit) {
    return searchCatalog(this.env.SW_DB, query, limit);
  }

  async checkConfiguration(sku, config) {
    return checkConfiguration(this.env.SW_DB, sku, config);
  }

  async quoteProduct(sku, config) {
    return quoteProduct(this.env.SW_DB, sku, config);
  }

  // -- paid: entitlement-gated ---------------------------------------------
  /**
   * Exchange a settled paymentId for a GrantCapability. Verifies the D1
   * purchase record; never touches the facilitator.
   */
  async getGrant(paymentId) {
    const grant = await checkEntitlement(this.env.SW_DB, paymentId);
    return new GrantCapability(this.env, grant);
  }

  /**
   * Reissue after disconnect: re-reads the durable record and returns a fresh
   * GrantCapability. No payment, no facilitator, no re-charge — by construction.
   */
  async recoverSession(paymentId) {
    const grant = await recoverPurchase(this.env.SW_DB, paymentId);
    return new GrantCapability(this.env, grant);
  }
}
