-- Apply after 0001. No backfill: historical transitions are not new events.
CREATE TABLE IF NOT EXISTS business_event_outbox (
 event_id TEXT PRIMARY KEY,
 event_type TEXT NOT NULL,
 occurred_ts TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at TEXT,
 last_error TEXT
);
CREATE INDEX IF NOT EXISTS business_event_outbox_pending
 ON business_event_outbox(occurred_ts) WHERE sent_at IS NULL;
CREATE TRIGGER IF NOT EXISTS business_quote_created AFTER INSERT ON commerce_quotes
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 VALUES ('quote.created:' || NEW.id,'quote.created',NEW.created_at,
 json_object('quote_id',NEW.id,'sku',NEW.sku,'product_version_ref',NEW.version,
 'artifact_hash',NEW.content_hash,'exact_amount_atomic',NEW.amount_usdc_micros,'payment_network',NEW.network));
END;
CREATE TRIGGER IF NOT EXISTS business_purchase_settling AFTER UPDATE OF status ON commerce_purchases
WHEN NEW.status='settling' AND OLD.status != NEW.status
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 SELECT 'payment.settlement_started:' || NEW.payment_id,'payment.settlement_started',NEW.updated_at,
 json_object('payment_id',NEW.payment_id,'quote_id',NEW.quote_id,'sku',q.sku,
 'product_version_ref',q.version,'artifact_hash',q.content_hash,
 'exact_amount_atomic',q.amount_usdc_micros,'payment_network',q.network)
 FROM commerce_quotes q WHERE q.id=NEW.quote_id
 ON CONFLICT(event_id) DO NOTHING;
END;
CREATE TRIGGER IF NOT EXISTS business_purchase_uncertain AFTER UPDATE OF status ON commerce_purchases
WHEN NEW.status='uncertain' AND OLD.status != NEW.status
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 SELECT 'payment.settlement_pending:' || NEW.payment_id,'payment.settlement_pending',NEW.updated_at,
 json_object('payment_id',NEW.payment_id,'quote_id',NEW.quote_id,'sku',q.sku,
 'product_version_ref',q.version,'artifact_hash',q.content_hash,
 'exact_amount_atomic',q.amount_usdc_micros,'payment_network',q.network)
 FROM commerce_quotes q WHERE q.id=NEW.quote_id
 ON CONFLICT(event_id) DO NOTHING;
END;
CREATE TRIGGER IF NOT EXISTS business_purchase_settled AFTER UPDATE OF status ON commerce_purchases
WHEN NEW.status='settled' AND OLD.status != NEW.status
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 SELECT 'payment.settled:' || NEW.payment_id,'payment.settled',NEW.updated_at,
 json_object('payment_id',NEW.payment_id,'quote_id',NEW.quote_id,'sku',q.sku,
 'product_version_ref',q.version,'artifact_hash',q.content_hash,
 'exact_amount_atomic',q.amount_usdc_micros,'payment_network',q.network)
 FROM commerce_quotes q WHERE q.id=NEW.quote_id
 ON CONFLICT(event_id) DO NOTHING;
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 SELECT 'receipt.issued:' || NEW.payment_id,'receipt.issued',NEW.updated_at,
 json_object('payment_id',NEW.payment_id,'quote_id',NEW.quote_id,'sku',q.sku,
 'product_version_ref',q.version,'artifact_hash',q.content_hash,
 'exact_amount_atomic',q.amount_usdc_micros,'payment_network',q.network)
 FROM commerce_quotes q WHERE q.id=NEW.quote_id
 ON CONFLICT(event_id) DO NOTHING;
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 SELECT 'entitlement.activated:' || NEW.payment_id,'entitlement.activated',NEW.updated_at,
 json_object('payment_id',NEW.payment_id,'quote_id',NEW.quote_id,'sku',q.sku,
 'product_version_ref',q.version,'artifact_hash',q.content_hash,
 'exact_amount_atomic',q.amount_usdc_micros,'payment_network',q.network)
 FROM commerce_quotes q WHERE q.id=NEW.quote_id
 ON CONFLICT(event_id) DO NOTHING;
END;
CREATE TRIGGER IF NOT EXISTS business_purchase_failed AFTER UPDATE OF status ON commerce_purchases
WHEN NEW.status='failed' AND OLD.status != NEW.status
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 SELECT 'payment.failed:' || NEW.payment_id,'payment.failed',NEW.updated_at,
 json_object('payment_id',NEW.payment_id,'quote_id',NEW.quote_id,'sku',q.sku,
 'product_version_ref',q.version,'artifact_hash',q.content_hash,
 'exact_amount_atomic',q.amount_usdc_micros,'payment_network',q.network)
 FROM commerce_quotes q WHERE q.id=NEW.quote_id
 ON CONFLICT(event_id) DO NOTHING;
END;
