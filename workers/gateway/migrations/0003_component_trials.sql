-- Reviewed releases only; no inventory is promoted by this migration.
CREATE TABLE IF NOT EXISTS component_releases (
 sku TEXT NOT NULL, version INTEGER NOT NULL,
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 manifest_hash TEXT NOT NULL,
 PRIMARY KEY(sku,version)
);
CREATE TRIGGER IF NOT EXISTS component_release_immutable_update BEFORE UPDATE ON component_releases
BEGIN SELECT RAISE(ABORT,'component_release_immutable'); END;
CREATE TRIGGER IF NOT EXISTS component_release_immutable_delete BEFORE DELETE ON component_releases
BEGIN SELECT RAISE(ABORT,'component_release_immutable'); END;
CREATE TABLE IF NOT EXISTS component_trials (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL,
 sku TEXT NOT NULL,
 version INTEGER NOT NULL,
 release_hash TEXT NOT NULL,
 config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 created_at TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS component_selections (
 trial_id TEXT NOT NULL REFERENCES component_trials(id),
 scope_hash TEXT NOT NULL,
 scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(trial_id,scope_hash)
);
CREATE TRIGGER IF NOT EXISTS component_trial_started AFTER INSERT ON component_trials
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 VALUES('trial.started:'||NEW.id,'trial.started',NEW.created_at,
 json_object('trial_id',NEW.id,'sku',NEW.sku,'product_version_ref',NEW.version,'release_hash',NEW.release_hash));
END;
CREATE TRIGGER IF NOT EXISTS component_trial_finished AFTER UPDATE OF status ON component_trials
WHEN OLD.status='running' AND NEW.status IN ('completed','failed')
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 VALUES('trial.'||NEW.status||':'||NEW.id,'trial.'||NEW.status,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 json_object('trial_id',NEW.id,'sku',NEW.sku,'product_version_ref',NEW.version,'release_hash',NEW.release_hash));
END;
CREATE TRIGGER IF NOT EXISTS component_scope_selected AFTER INSERT ON component_selections
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 VALUES('scope.selected:'||NEW.trial_id||':'||NEW.scope_hash,'scope.selected',NEW.created_at,
 json_object('trial_id',NEW.trial_id,'scope_hash',NEW.scope_hash,
 'sku',json_extract(NEW.scope_json,'$.sku'),
 'selected_share_bps',json_extract(NEW.scope_json,'$.selected_share_bps'),
 'exact_amount_atomic',json_extract(NEW.scope_json,'$.amount_atomic')));
END;
CREATE TRIGGER IF NOT EXISTS component_scope_accepted AFTER INSERT ON commerce_quotes
WHEN json_extract(NEW.snapshot_json,'$.scope.scope_hash') IS NOT NULL
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 VALUES('scope.accepted:'||NEW.id,'scope.accepted',NEW.created_at,
 json_object('quote_id',NEW.id,'sku',NEW.sku,
 'scope_hash',json_extract(NEW.snapshot_json,'$.scope.scope_hash'),
 'selected_share_bps',json_extract(NEW.snapshot_json,'$.scope.selected_share_bps'),
 'exact_amount_atomic',NEW.amount_usdc_micros));
END;

CREATE TABLE IF NOT EXISTS component_acceptances (
 acceptance_key TEXT PRIMARY KEY,
 quote_id TEXT NOT NULL UNIQUE REFERENCES commerce_quotes(id)
);
