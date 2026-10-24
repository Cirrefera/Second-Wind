-- Optional caller-known retry identity for trials. Existing rows remain
-- recoverable but cannot be replayed because they have no request binding.
CREATE TABLE IF NOT EXISTS component_trial_requests (
 trial_id TEXT PRIMARY KEY REFERENCES component_trials(id),
 request_hash TEXT NOT NULL,
 execution_owner TEXT NOT NULL
);
