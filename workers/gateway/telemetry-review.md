# Telemetry contract review

This review covers local producer code, migrations 0002/0003 and fixture tests.
No production resources, SQL, streams, pipelines, schemas or credentials were
accessed or changed. The Basin SQL below is a proposal for review, not applied or
provider-validated SQL. The existing pipeline definition and sink schemas were
not available in this repository.

## Observed event coverage

The existing JSON payload/envelope and event families remain. The exporter adds
`journey_stage` and `observed_outcome` to contract version `1`; readers must allow
optional additive JSON properties. Events sent before this change will not have
these properties. No history is backfilled.

| Journey stage | Existing event | Recorded outcome | Limit of this observation |
| --- | --- | --- | --- |
| Discovery | None | Unobserved | `search`, `searchIntent`, `describe` and HTTP discovery do not write journey events. |
| Clarification | None | Unobserved | Configuration checks and clarification callbacks do not write journey events. |
| Testing | `trial.started` | `started` | A durable local trial record was created. |
| Testing | `trial.completed` | `completed` | The buyer sandbox execution returned `ok`; this is no evidence of a separate deployment. |
| Testing | `trial.failed` | `failed` | The sandbox returned a failed result; no cause is inferred from the event. |
| Selection | `scope.selected` | `selected` | An authenticated completed trial selected these release component IDs. |
| Selection | `scope.accepted` | `accepted` | Explicit scope acceptance created a pinned quote; no charge occurred at acceptance. |
| Selection | `quote.created` | `quote_created` | A quote exists; it can also be an ordinary product/execution quote without component scope. |
| Payment | `payment.settlement_started` | `settlement_started` | Durable settlement state entered `settling`. |
| Payment | `payment.settlement_pending` | `settlement_pending` | Durable settlement state entered `uncertain`; neither success nor failure is established. |
| Payment | `payment.settled` | `settled` | A confirmed receipt was persisted in the purchase transition. |
| Payment | `payment.failed` | `failed` | The purchase entered `failed`; this may occur before settlement, so the event alone does not identify its cause. |
| Payment | `receipt.issued` | `receipt_issued` | Settlement persisted its receipt; this is not another payment. |
| Payment | `entitlement.activated` | `entitlement_activated` | Payment created purchase authority; delivery has not been observed by this event. |
| Delivery | None | Unobserved | `deliverGrant` writes the operational `deliveries` audit table, but emits no business outbox event. A delivery failure also emits none. |
| Recovery | None | Unobserved | Trial/session recovery, purchase replay, lost-token recovery and recovery execution emit no business outbox observation. |

Producer gaps remain outside this pass. There is no session/journey identifier
covering discovery and clarification, and no durable public requirement summary.
The event stream therefore cannot answer what an agent initially wanted. A
missing later event cannot establish abandonment, rejection or an unwanted
feature. It may represent an uninstrumented operation or incomplete evidence.
The current trial runner also awaits sandbox completion before recording its
terminal state; an interruption between those operations can leave only
`trial.started`. No timeout/failure is synthesized by telemetry.

## Exact selection correlation

Dispatch reads optional correlation from the existing D1 records, without
changing the outbox or commerce state. A `scope.selected` event reads its exact
`(trial_id, scope_hash)` selection. Quote/payment/receipt/entitlement events read
scope from their exact quote snapshot. The menu is read only for the matching
SKU, product version and release hash. The current catalog and later releases
are never used to reconstruct an older selection.

When the recorded evidence is well formed, the payload includes:

- `scope_correlation: "available"`, `scope_hash`, `release_hash` and
  `product_version_ref`.
- `selected_component_ids`: the persisted selected IDs, sorted.
- `omitted_component_ids`: that pinned release menu minus the selected IDs,
  sorted. This records omission from this particular scope; it says nothing
  about the buyer's motives or whether a component is unwanted.
- `selected_share_bps`, retaining the existing exact atomic amount.
- `trial_id` on a quote or payment when its durable acceptance link is present.
  The original `quote_id` and `payment_id` remain the purchase correlation keys.

Count a component selection using deduplicated `scope.selected` events (or
deduplicated `scope.accepted` events when asking about accepted scope), not every
enriched payment-side event. Correlation repeats choice metadata for joins; it
does not record another selection.

Missing or malformed optional evidence, including an optional D1 read failure,
produces `scope_correlation: "unavailable"` and leaves the valid base event
sendable. A quote with no component scope receives `"not_applicable"`. No choices
are guessed. Scope correlation availability does not guarantee a trial link;
the `trial_id` is optional. A missing link must remain missing in reporting.

There are at most three correlation reads per event. Component ID projection
reads at most 101 IDs, so a release over the supported 100-component limit is
rejected. A dispatch batch remains limited to 20 events. Only allowlisted base
fields and selected public release identifiers are exported. Buyer config,
configuration hashes, code, outputs, callbacks, payer addresses, signatures,
recovery tokens and provider diagnostics are excluded.

Outbox triggers continue to make core transitions and their logical event IDs
transactional. At-least-once retries retain those IDs. Optional enrichment is
read at dispatch, so consumers must tolerate missing metadata and deduplicate
by `event_id`, independent of that metadata. Ingestion acknowledgement is not
proof of sink delivery.

## Basin projection proposal — review only

The gateway README records that legacy projections use obsolete event names and
price fields. The local producers instead emit `payment.settled`,
`receipt.issued`, and string `payload.exact_amount_atomic`. A replacement
projection should preserve IDs, timestamps, contract version and exact amounts.
Do not reinterpret receipt issuance as a second charge or entitlement activation
as delivery. Do not convert missing JSON values into zero-priced purchases.

The following SELECT describes the proposed payment/receipt projection using
the existing stream name documented in the repository. Its fields and functions
must be validated against a reviewed snapshot of the actual immutable pipeline
SQL and destination schema before any separate rollout decision. It creates or
changes nothing and includes no deployment command or sink DDL.

```sql
SELECT
  event_id,
  schema_version,
  event_contract_version,
  event_type,
  occurred_ts,
  json_get_str(payload, 'payment_id') AS payment_id,
  json_get_str(payload, 'quote_id') AS quote_id,
  json_get_str(payload, 'trial_id') AS trial_id,
  json_get_str(payload, 'sku') AS sku,
  json_as_text(payload, 'product_version_ref') AS product_version_ref,
  json_get_str(payload, 'exact_amount_atomic') AS exact_amount_atomic,
  json_get_str(payload, 'payment_network') AS payment_network,
  json_get_str(payload, 'artifact_hash') AS artifact_hash,
  json_get_str(payload, 'release_hash') AS release_hash,
  json_get_str(payload, 'scope_hash') AS scope_hash,
  json_get_str(payload, 'journey_stage') AS journey_stage,
  json_get_str(payload, 'observed_outcome') AS observed_outcome,
  json_get_str(payload, 'scope_correlation') AS scope_correlation
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND event_type IN (
    'payment.settlement_started', 'payment.settlement_pending',
    'payment.settled', 'payment.failed', 'receipt.issued',
    'entitlement.activated'
  );
```

Retain `exact_amount_atomic` as its decimal string (or use a separately reviewed
exact numeric type); a floating USD projection loses the canonical amount. The
stream's JSON payload remains JSON. JSON functions return empty strings for
missing string values, so consumers must treat these as missing, not inferred
outcomes. This SELECT does not deduplicate; business counts must deduplicate
`event_id` downstream before grouping by event type.

A component-scope projection can preserve choice arrays as JSON, rather than
exploding them into duplicate business events:

```sql
SELECT
  event_id,
  event_contract_version,
  event_type,
  occurred_ts,
  json_get_str(payload, 'trial_id') AS trial_id,
  json_get_str(payload, 'quote_id') AS quote_id,
  json_get_str(payload, 'sku') AS sku,
  json_as_text(payload, 'product_version_ref') AS product_version_ref,
  json_get_str(payload, 'release_hash') AS release_hash,
  json_get_str(payload, 'scope_hash') AS scope_hash,
  json_get_str(payload, 'exact_amount_atomic') AS exact_amount_atomic,
  json_get_json(payload, 'selected_component_ids') AS selected_component_ids,
  json_get_json(payload, 'omitted_component_ids') AS omitted_component_ids
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND json_get_str(payload, 'scope_correlation') = 'available'
  AND event_type IN ('scope.selected', 'scope.accepted');
```

Cloudflare's public [Basin JSON function reference](https://developers.cloudflare.com/basin-pipelines/sql-reference/scalar-functions/json/)
was read for the function syntax. No provider compilation or sink verification
was performed. Missing external evidence: a reviewed current pipeline SQL
snapshot, sink schemas/permissions and same-ID raw-table ingestion verification.
Those dependencies do not authorize a production query or mutation in this pass.

## Local verification

`node --test --test-isolation=none tests/telemetry.test.mjs` in
`workers/gateway` passes 8 tests. Coverage includes transaction rollback,
settlement surviving provider failure, no duplicate settlement on replay,
poison-event fairness/batch limits, observed stages, version-bound component
correlation, exact amounts, stable retry IDs, privacy rejection and optional
correlation failure preserving settled commerce state.
