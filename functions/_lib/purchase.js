/**
 * Purchase State Machine — Atomic Claims & Settlement Recovery
 * ==============================================================
 * Implements handoff §6: "Atomically claim the purchase before the external
 * settlement call. Only its claim owner initiates settlement."
 *
 * HOW IT WORKS:
 * - `claimPurchase()` does an atomic INSERT. The UNIQUE(quote_id, config_hash)
 *   constraint ensures only one purchase per buyer intent. The successful
 *   inserter becomes the claim owner (claimed_by).
 * - Only the claim owner can transition claimed→settling (guarded UPDATE
 *   with WHERE claimed_by=? AND status='claimed').
 * - Settlement outcomes move through settling→settled/failed/uncertain.
 * - Uncertain purchases are reconciled (not re-charged) by checking the
 *   facilitator/chain for the actual payment status.
 *
 * WHY THIS DESIGN:
 * - D1, the facilitator, and R2/Artifact writes don't share a transaction.
 *   The purchases table is the source of truth for "what did the buyer intend
 *   and what happened." Each external call is recorded as a state transition.
 * - A UNIQUE insert AFTER settlement is insufficient because two concurrent
 *   requests could both pass verification and both call /settle before either
 *   inserts. The claim must happen BEFORE the external call.
 */

import { nanoid } from './util.js';

/**
 * Atomically claim a purchase. Returns the purchase row.
 * If a purchase already exists for this quote+config, returns it (409 semantics).
 */
export async function claimPurchase(db, {
  quoteId, sku, releaseVersion, config, language, runtime,
  amountUsd, amountAtomic, asset, network, recipient,
  buyerId, protocol, paymentMethod, claimedBy, idempotencyKey,
}) {
  const id = 'pur_' + nanoid(12);
  const configHash = await sha256Hex(JSON.stringify(sortKeys(config || {})));

  try {
    await db.prepare(`
      INSERT INTO purchases (
        id, quote_id, sku, release_version, config_hash,
        language, runtime, amount_usd, amount_atomic,
        asset, network, recipient, buyer_id,
        protocol, payment_method, status, claimed_by, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?)
    `).bind(
      id, quoteId, sku, releaseVersion, configHash,
      language || null, runtime || null, amountUsd, amountAtomic,
      asset || 'USDC', network || 'eip155:8453', recipient, buyerId || null,
      protocol, paymentMethod || null, claimedBy, idempotencyKey,
    ).run();

    return { id, status: 'claimed', isNew: true, configHash };
  } catch (e) {
    // UNIQUE violation → purchase already claimed for this intent
    if (e.message && e.message.includes('UNIQUE')) {
      const existing = await db.prepare(`
        SELECT id, status, claimed_by, payment_id
        FROM purchases
        WHERE quote_id = ? AND config_hash = ?
      `).bind(quoteId, configHash).first();
      return { ...existing, isNew: false, configHash };
    }
    throw e;
  }
}

/**
 * Transition claimed → settling. Only the claim owner can do this.
 * Returns true if the transition succeeded, false if already transitioned.
 */
export async function transitionToSettling(db, purchaseId, claimedBy) {
  const result = await db.prepare(`
    UPDATE purchases
    SET status = 'settling'
    WHERE id = ? AND claimed_by = ? AND status = 'claimed'
  `).bind(purchaseId, claimedBy).run();
  return result.meta.changes > 0;
}

/**
 * Record successful settlement. Links to the payments row.
 */
export async function markPurchaseSettled(db, purchaseId, paymentId) {
  await db.prepare(`
    UPDATE purchases
    SET status = 'settled', payment_id = ?, settled_at = datetime('now')
    WHERE id = ? AND status = 'settling'
  `).bind(paymentId, purchaseId).run();
}

/**
 * Record confirmed settlement failure.
 */
export async function markPurchaseFailed(db, purchaseId, reason) {
  await db.prepare(`
    UPDATE purchases
    SET status = 'failed'
    WHERE id = ? AND status IN ('claimed', 'settling', 'uncertain')
  `).bind(purchaseId).run();
}

/**
 * Mark settlement outcome as uncertain (timeout, crash, ambiguous response).
 * Requires reconciliation — never auto-retries settlement.
 */
export async function markPurchaseUncertain(db, purchaseId) {
  await db.prepare(`
    UPDATE purchases
    SET status = 'uncertain'
    WHERE id = ? AND status = 'settling'
  `).bind(purchaseId).run();
}

/**
 * Get purchase by ID with full details.
 */
export async function getPurchase(db, purchaseId) {
  return db.prepare(`SELECT * FROM purchases WHERE id = ?`).bind(purchaseId).first();
}

/**
 * Get purchase by idempotency key (for replay detection).
 */
export async function getPurchaseByIdempotency(db, idempotencyKey) {
  return db.prepare(
    `SELECT * FROM purchases WHERE idempotency_key = ?`
  ).bind(idempotencyKey).first();
}

// --- helpers ---

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.keys(obj).sort().map(k => [k, sortKeys(obj[k])])
    );
  }
  return obj;
}
