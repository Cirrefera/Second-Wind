-- Exact chosen product verification before acceptance. Does not promote inventory.
CREATE TABLE IF NOT EXISTS selection_validations (
 trial_id TEXT NOT NULL,
 scope_hash TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 package_hash TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 passed INTEGER NOT NULL CHECK(passed IN (0,1)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(trial_id,scope_hash,code_hash),
 FOREIGN KEY(trial_id,scope_hash) REFERENCES component_selections(trial_id,scope_hash)
);
CREATE TRIGGER IF NOT EXISTS selection_validation_recorded AFTER INSERT ON selection_validations
BEGIN
 INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 VALUES('scope.tested:'||NEW.trial_id||':'||NEW.scope_hash||':'||NEW.code_hash,'scope.tested',NEW.created_at,
 json_object('trial_id',NEW.trial_id,'scope_hash',NEW.scope_hash,'artifact_hash',NEW.package_hash,
 'test_code_hash',NEW.code_hash,'sandbox_passed',NEW.passed));
END;
