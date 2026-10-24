-- Durable link from a trial attempt to its separately settled sandbox pass.
CREATE TABLE IF NOT EXISTS component_trial_payments (
 trial_id TEXT PRIMARY KEY REFERENCES component_trials(id),
 payment_id TEXT NOT NULL UNIQUE REFERENCES commerce_purchases(payment_id)
);
