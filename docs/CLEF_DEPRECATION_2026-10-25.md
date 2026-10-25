# Clef retirement

The owner authorized removing Clef or marking it deprecated, and removing
unnecessary tables and sinks, on October 25, 2026.

## Source disposition

Clef routing, inventory classification and journey interpretation are deprecated.
Existing model reader/evaluation code is retained for historical compatibility;
it is not current operating guidance. The gateway has no AI binding or Clef
enablement flag. Do not add either for this retired path.

Cap'n Web discovery, clarification, configuration, previews, component selection,
delivery and recovery remain the buyer flow. Deterministic product compatibility,
official x402, D1 commerce, immutable releases and R2 payloads are unchanged.

Historical source and evidence are not rewritten or relabeled as live proof.
No new workflow, dependency, application schema or model call is introduced.

## Telemetry retirement scope

Keep the raw `all_events` destination and the current `journey_events_v1`,
`payment_events_v1` and `scope_events_v1` destinations. The current producer's
event contract is the authority for active projections.

Retire the fifteen older specialized sink destinations: `identity_events`,
`decision_runs`, `decision_answers`, `decision_options`, `decision_reductions`,
`catalog_events`, `scope_events`, `commerce_events`, `meter_events`, `guard_events`,
`execution_events`, `payment_events`, `receipt_events`, `delivery_events` and
`recovery_events` (sink names add `_sink`). Their old event filters/field layouts
do not implement the current gateway event contract. The old `receipt.issued`
filter shares a current event name but projects obsolete price/settlement fields.

The older pipeline also owns raw landing. Its specialized outputs must be
detached only while preserving a running raw path. Cloudflare pipeline SQL is
immutable, so this requires replacing the older SQL definition, not adding a
GitHub workflow or modifying the application stream/dispatcher.

The retired decision-reference tables are `decision_questions` and
`decision_profiles`. Product/version/capability/scope/taxonomy/failure reference
tables are outside this retirement: they have separate product semantics.

Table retirement must use a catalog DROP without PURGE, keeping historical files
recoverable. Never manually delete catalog metadata, Parquet or Avro objects.
Existing schemas and before-state configuration were captured during this audit.
Sink deletion is not proof a catalog table was dropped; record the two results
separately. Final Cloudflare action results belong in the completion record.

## Verified Cloudflare outcome

The raw-only replacement `secondwind_raw_history` is running with pipeline ID
`52253a4cdd424729b91380595090698a`. It uses the same business stream and existing
`all_events_sink`. The prior `secondwind_telemetry` pipeline was removed only
after the replacement reported running and its SQL matched the validated input.
All fifteen obsolete specialized sink DELETE operations returned HTTP 200.
Readback confirms exactly four sinks and two running pipelines. The three
current contract-v1 sinks and their pipeline were not changed.

Catalog table removal is a separate remaining operation. The available
Cloudflare management connector exposes table listing/details but no table DROP;
the execution environment has no catalog engine credential, and the catalog
reports credential_status=absent. No table or underlying data file was deleted;
readback still returns all 29 tables. The exact seventeen non-purging table drops
are prepared in `workers/gateway/telemetry/retire-legacy-tables.sql` for a
catalog-capable client. Do not report table retirement as complete until catalog
readback confirms it.

Before-state pipeline SQL, sink identities, all live schemas and each targeted
table's exact metadata location were saved as a separate retirement archive.
Existing gateway tests: 233 passed, zero failures/skips. Root utilities, 21 Pages
ingress checks, 34 release-acceptance checks and both builds passed. These are
source/integration checks, not funded settlement or exhaustive event reconciliation.
