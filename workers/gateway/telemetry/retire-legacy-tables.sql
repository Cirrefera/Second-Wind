-- Owner-authorized retirement, 2026-10-25.
-- Execute only through a read/write Iceberg catalog client configured for
-- secondwind-catalog. Basin/R2 SQL query service is not a DDL executor.
-- Do not add PURGE: retain historical files and captured metadata for recovery.
-- These are analytics tables, not the D1 commerce or payment ledgers.
DROP TABLE IF EXISTS secondwind.guard_events;
DROP TABLE IF EXISTS secondwind.receipt_events;
DROP TABLE IF EXISTS secondwind.delivery_events;
DROP TABLE IF EXISTS secondwind.decision_reductions;
DROP TABLE IF EXISTS secondwind.scope_events;
DROP TABLE IF EXISTS secondwind.meter_events;
DROP TABLE IF EXISTS secondwind.execution_events;
DROP TABLE IF EXISTS secondwind.recovery_events;
DROP TABLE IF EXISTS secondwind.identity_events;
DROP TABLE IF EXISTS secondwind.decision_runs;
DROP TABLE IF EXISTS secondwind.decision_answers;
DROP TABLE IF EXISTS secondwind.decision_options;
DROP TABLE IF EXISTS secondwind.catalog_events;
DROP TABLE IF EXISTS secondwind.commerce_events;
DROP TABLE IF EXISTS secondwind.payment_events;
DROP TABLE IF EXISTS secondwind.decision_questions;
DROP TABLE IF EXISTS secondwind.decision_profiles;
