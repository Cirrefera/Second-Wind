-- Additive repair for the existing live items/payments/deliveries schema.
-- This file never replaces catalog tables, rewrites history, or promotes SKUs.
-- Re-running it is safe; it is independent of the historical root migrations.

CREATE TABLE IF NOT EXISTS payload_objects (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL REFERENCES items(sku),
  r2_bucket TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(sku, version)
);

CREATE TABLE IF NOT EXISTS delivery_grants (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  payload_id TEXT NOT NULL REFERENCES payload_objects(id),
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(payment_id, payload_id)
);

CREATE TABLE IF NOT EXISTS commerce_quotes (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('product','execution')),
  amount_usdc_micros TEXT NOT NULL,
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  pay_to TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  request_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commerce_quotes_expiry ON commerce_quotes(expires_at);

-- Exactly one successful INSERT owns the external work for a payment nonce
-- and for a quote. Both this row and payments are inserted in one D1 batch.
CREATE TABLE IF NOT EXISTS commerce_purchases (
  payment_id TEXT PRIMARY KEY REFERENCES payments(id),
  quote_id TEXT NOT NULL UNIQUE REFERENCES commerce_quotes(id),
  payment_key TEXT NOT NULL UNIQUE,
  proof_hash TEXT NOT NULL,
  recovery_token_hash TEXT NOT NULL,
  payer TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN
    ('claimed','executing','prepared','settling','settled','failed','uncertain')),
  prepared_json TEXT CHECK(prepared_json IS NULL OR json_valid(prepared_json)),
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commerce_purchases_pending
  ON commerce_purchases(status, updated_at) WHERE status IN ('settling','uncertain');

-- Used only when a buyer has lost their private recovery token. A payment ID
-- and an on-chain authorization signature are never recovery credentials.
CREATE TABLE IF NOT EXISTS commerce_recovery_challenges (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_commerce_recovery_expiry ON commerce_recovery_challenges(expires_at);
