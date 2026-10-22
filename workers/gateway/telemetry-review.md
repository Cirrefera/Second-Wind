# Telemetry contract review

This review covers local producer source, the existing business outbox and local
fixtures. No production resources, SQL, streams, pipelines, sink schemas,
credentials, funds or live inference were accessed or changed by this work.
The SQL below is review-only. The current pipeline definition and destination
schemas are not present in the repository, and provider compilation and sink
verification remain external dependencies.

## Observations and their authority

The JSON envelope and contract version `1` remain compatible with the existing
stream. Additive payload fields include `journey_stage`, `observed_outcome` and
optional correlation. Earlier events lack these fields; no history is backfilled.

| Stage | Event | What the producer actually observed |
| --- | --- | --- |
| Discovery | `discovery.searched` | Public catalog or structured search was invoked; raw search text is excluded. |
| Discovery | `discovery.resolved` | Structured routing returned its recorded status and public candidates; a candidate is not a buyer selection. |
| Discovery | `discovery.described` | Public product metadata or a discovery document/component menu was constructed. |
| Clarification | `clarification.requested` | The shared operation produced bounded missing-field questions or invoked the clarification callback. |
| Clarification | `clarification.responded` | The callback returned, failed, timed out, or returned an invalid response, according to `response_status`; answers are excluded. |
| Clarification | `configuration.checked` | Validation returned `complete` or `incomplete`, with counts; configuration, field values and diagnostics are excluded. |
| Testing | `trial.started` | A durable trial record exists. |
| Testing | `trial.completed`, `trial.failed` | The sandbox result was persisted as the named terminal status. This does not verify an external deployment. |
| Testing | `trial.expired_while_running` | An authenticated recovery encountered a persisted `running` trial whose recorded expiry passed; no terminal outcome is inferred. |
| Selection | `selection.product_selected` | A buyer explicitly selected a public product capability. |
| Selection | `scope.selected`, `scope.accepted` | An authenticated completed trial selected pinned component IDs, or their explicit acceptance created a pinned quote. Acceptance does not charge. |
| Selection | `quote.created` | A quote exists; ordinary product/execution quotes need not have component scope. |
| Payment | `payment.settlement_started`, `payment.settlement_pending` | Durable purchase state entered `settling` or `uncertain`; pending does not establish success or failure. |
| Payment | `payment.settled`, `payment.failed` | The purchase persisted its confirmed receipt or entered `failed`. The failed event alone does not identify its cause. |
| Payment | `receipt.issued`, `entitlement.activated` | Settlement persisted a receipt and purchase authority. These do not represent another charge or an observed delivery. |
| Delivery | `delivery.prepared` | The gateway constructed a delivery response and recorded its local delivery audit. Its outcome is `response_prepared`, not client receipt. |
| Delivery | `delivery.failed` | Local response preparation failed. No provider exception or presumed client outcome is exported. |
| Recovery | `recovery.grant_recovered` | Authentication and settled-state checks produced a purchase grant. |
| Recovery | `recovery.challenge_created`, `recovery.credential_rotated` | A challenge was persisted, or its verified one-use proof replaced the credential. No message, proof, wallet or token is exported. |
| Recovery | `recovery.result_recovered`, `recovery.purchase_replayed`, `recovery.trial_recovered` | The corresponding stored result, authenticated purchase replay, or trial recovery returned locally. No result contents are exported. |
| Correlation | `journey.linked` | A quote or trial has an exact, durable link to an opaque journey. This is not an extra funnel transition. |

Shared document constructors, routing, product-service configuration, trial and
commerce functions are the producer boundaries used by HTTP and Cap'n Web.
Internal catalog reads used for validation are not separate buyer discoveries.
Transport wrappers carry context and do not infer a second business transition.
Source and fixture tests check the actual shared call sites. No later event, including a
missing terminal trial event, establishes abandonment, rejection, an unwanted
feature, client receipt or successful external deployment.

| Source boundary | Observations and shared callers |
| --- | --- |
| `discovery.js` | `toolsDocument` observes its public catalog projection; resources, OpenAPI and llms document constructors reuse it. HTTP aliases pass the request context. |
| `routing.js` | `resolveIntent` observes search invocation and its actual result, using reviewed manifest vocabulary. HTTP resolve and RPC structured search share it. |
| `product-service.js` | Catalog search/describe, explicit select, configuration checks and clarification callbacks, grant/result recovery. RPC capabilities preserve the journey and use fresh operation IDs. |
| `trials.js` and migration 0003 | Trial record transitions, exact component selections and accepted scopes; authenticated trial recovery and expired-running observation; best-effort linkage after the trial record commits. |
| `commerce.js` and migration 0002 | Existing transactional quote/payment transitions, best-effort quote linkage after the authoritative write, local delivery preparation/failure, wallet recovery and authenticated replay. |
| `index.js` | Validated HTTP context/header continuity; shared route calls and the component-menu observation. |
| `execution.js` | Code Mode default discovery/configuration/quote providers delegate to ProductService with `sandbox` transport and the originating journey; delivery delegates to commerce. |

## Safe producer API and bounded correlation

`createJourneyContext({journey_id?, observation_id?, transport?})` returns an
opaque `jrn_<UUID>` journey ID and `obs_<UUID>` operation ID, with a controlled
transport (`http`, `rpc`, `sandbox`, `internal`). Invalid input IDs are replaced.
These IDs convey correlation only and confer no authentication authority. Start
a fresh operation ID when recording a distinct operation. Retain it when retrying
the same observation. HTTP may carry a validated `X-Journey-Id`; RPC capabilities
retain their root context. Separate roots require explicit ID continuity.

`publicIntentDimensions(intent, validatedPublicManifests)` retains typed values
only when present in the supplied reviewed public routing vocabulary: service,
product kind, operation, environment, desired outcome, input kind, failure
signature, target language/runtime, problem family and taxonomy. It excludes
goals, aliases, free text, evidence answers, configuration and unknown values.
The vocabulary must come from reviewed public manifests, not buyer input. Public
candidate/selected SKU arrays are limited to 50 unique identifiers; explicit
selection IDs must come from the product actually selected.
Discovery-document arrays contain at most the first 50 public IDs alongside the
actual `result_count`; they are not exhaustive when that count is larger.

`observationStatement(db, type, {journey, observationId?, payload?, occurredTs?})`
validates and prepares an existing-outbox INSERT. The low-level helper supports
explicit batches and is fixture-tested that way. Production quote/trial producers
instead enqueue optional linkage best effort after the authoritative write.
Existing mandatory D1-trigger outbox events remain transactional with their core
state changes. A rejected optional link cannot roll back a quote, trial or scope
acceptance. An interruption or failure before the optional insert can leave
correlation unavailable; no link is inferred to fill that gap.
A `journey.linked` payload contains exactly one
of `quote_id` or `trial_id`; its primary key is
`journey.linked:quote:<quote_id>` or `journey.linked:trial:<trial_id>`. The first
recorded link wins, including on replay. No new table or schema is needed.

`enqueueObservation(env, type, options)` executes that statement best effort and
returns `queued`, `duplicate`, `not_configured`, `invalid_observation` or
`unavailable`. Its stable key is `<event_type>:<observation_id>` (or the exact
record key for a journey link). Invalid fields and database failures return
without propagating private exceptions. Optional observations cannot change a
payment, delivery or recovery result. The helpers reject core transition types;
existing transactional triggers retain authority for those events.

`observeExpiredTrial(env, trialId, journey?, {now?})` performs a single primary-key
read requiring `status='running'` and `expires_at<=now`, and enqueues the stable
expiry observation. It leaves the trial status unchanged. Call it only after
trial authentication at the existing expired-trial branch. A still-running row
may reflect interruption before terminal persistence; expiry alone cannot say
whether execution completed, failed or never finished. No scheduled full-table
scan or synthetic execution failure is introduced.

Dispatch first correlates exact component scope, then uses at most two exact
outbox-primary-key link reads (quote, then trial). It never searches by timestamp,
buyer, text or payer. A valid direct context or link gives
`journey_correlation: "available"`; missing optional linkage gives `"unavailable"`
for quote/trial-keyed events. Optional read failures preserve the base event.

## Exact component scope and amount

`scope.selected` reads its exact `(trial_id, scope_hash)` selection. Quote,
payment, receipt, entitlement and delivery observations with quote IDs read scope
from that quote's immutable snapshot. The component menu belongs to the matching
SKU, version and release hash, never the current catalog or a later release.

Validated scope enrichment includes `scope_correlation: "available"`,
`scope_hash`, `release_hash`, `product_version_ref`, `selected_share_bps`, sorted
`selected_component_ids` and `omitted_component_ids`, and optional `trial_id` from
the recorded acceptance link. Omitted IDs mean omitted from this scope, with no
claim about buyer motives. Count choices using deduplicated `scope.selected` (or
`scope.accepted` for accepted scope), not every enriched payment-side event.

There are at most three scope reads per event. The component menu projection
reads at most 101 IDs and rejects releases above the supported 100-component
limit. Missing or malformed optional evidence gives `scope_correlation:
"unavailable"`; a quote without component scope gives `"not_applicable"`. No
choice is guessed. Optional correlation cannot modify settled commerce state.

`exact_amount_atomic` remains its canonical decimal string. The helper does not
reprice a quote or recompute component scope. An execution quote has no artifact
hash before execution; the existing trigger's empty `artifact_hash` is omitted
on export as unknown. It is never turned into a fabricated digest or a verified
result hash. Result bytes and private execution inputs remain excluded.

All payloads are strictly allowlisted. Raw buyer content, free text, configuration
hashes, code, outputs, callbacks, credentials, payer addresses, signatures, tokens
and provider diagnostics are excluded. Batches remain limited to 20 events.
At-least-once dispatch retains logical event IDs across concurrent sends, crashes
or retries. Consumers must deduplicate by `event_id`; ingestion acknowledgement
does not prove sink delivery. Optional enrichment may arrive after an earlier
attempt, so event identity must not depend on enrichment contents.

## Basin projection corrections — review only

The README identifies obsolete legacy event/price projections and an existing
raw landing sink. The proposed SELECTs below use current event names, preserve
the existing JSON payload and keep exact atomic prices. They create or modify
nothing. They must be compared with a reviewed snapshot of the actual pipeline
SQL and destination schemas before any separate rollout decision.

The payment projection retains each transition. A receipt or entitlement row is
not another payment; revenue counts use unique settled payment IDs after event-ID
deduplication. Missing strings become NULL rather than inferred zero amounts.

```sql
-- payment_projection
SELECT
  event_id, schema_version, event_contract_version, event_type, occurred_ts,
  NULLIF(json_get_str(payload, 'payment_id'), '') AS payment_id,
  NULLIF(json_get_str(payload, 'quote_id'), '') AS quote_id,
  NULLIF(json_get_str(payload, 'trial_id'), '') AS trial_id,
  NULLIF(json_get_str(payload, 'journey_id'), '') AS journey_id,
  NULLIF(json_get_str(payload, 'sku'), '') AS sku,
  json_as_text(payload, 'product_version_ref') AS product_version_ref,
  NULLIF(json_get_str(payload, 'exact_amount_atomic'), '') AS exact_amount_atomic,
  NULLIF(json_get_str(payload, 'payment_network'), '') AS payment_network,
  NULLIF(json_get_str(payload, 'artifact_hash'), '') AS artifact_hash,
  NULLIF(json_get_str(payload, 'release_hash'), '') AS release_hash,
  NULLIF(json_get_str(payload, 'scope_hash'), '') AS scope_hash,
  json_get_str(payload, 'journey_stage') AS journey_stage,
  json_get_str(payload, 'observed_outcome') AS observed_outcome,
  NULLIF(json_get_str(payload, 'scope_correlation'), '') AS scope_correlation
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND event_type IN (
    'payment.settlement_started', 'payment.settlement_pending',
    'payment.settled', 'payment.failed', 'receipt.issued',
    'entitlement.activated'
  );
```

The scope projection preserves arrays as JSON; exploding them would duplicate
one logical scope observation into several rows.

```sql
-- scope_projection
SELECT
  event_id, event_contract_version, event_type, occurred_ts,
  NULLIF(json_get_str(payload, 'journey_id'), '') AS journey_id,
  NULLIF(json_get_str(payload, 'trial_id'), '') AS trial_id,
  NULLIF(json_get_str(payload, 'quote_id'), '') AS quote_id,
  json_get_str(payload, 'sku') AS sku,
  json_as_text(payload, 'product_version_ref') AS product_version_ref,
  json_get_str(payload, 'release_hash') AS release_hash,
  json_get_str(payload, 'scope_hash') AS scope_hash,
  NULLIF(json_get_str(payload, 'exact_amount_atomic'), '') AS exact_amount_atomic,
  json_get_json(payload, 'selected_component_ids') AS selected_component_ids,
  json_get_json(payload, 'omitted_component_ids') AS omitted_component_ids
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND json_get_str(payload, 'scope_correlation') = 'available'
  AND event_type IN ('scope.selected', 'scope.accepted');
```

The journey projection keeps the safe public dimensions as JSON and observed
statuses as strings. Correlation-link rows remain in the raw history and are
excluded from funnel-stage counts.

```sql
-- journey_projection
SELECT
  event_id, event_contract_version, event_type, occurred_ts,
  NULLIF(json_get_str(payload, 'journey_id'), '') AS journey_id,
  NULLIF(json_get_str(payload, 'observation_id'), '') AS observation_id,
  NULLIF(json_get_str(payload, 'quote_id'), '') AS quote_id,
  NULLIF(json_get_str(payload, 'payment_id'), '') AS payment_id,
  NULLIF(json_get_str(payload, 'trial_id'), '') AS trial_id,
  json_get_str(payload, 'journey_stage') AS journey_stage,
  json_get_str(payload, 'observed_outcome') AS observed_outcome,
  json_get_json(payload, 'public_intent') AS public_intent,
  json_get_json(payload, 'candidate_product_ids') AS candidate_product_ids,
  json_get_json(payload, 'selected_product_ids') AS selected_product_ids,
  NULLIF(json_get_str(payload, 'resolution_status'), '') AS resolution_status,
  NULLIF(json_get_str(payload, 'configuration_status'), '') AS configuration_status,
  NULLIF(json_get_str(payload, 'response_status'), '') AS response_status
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND event_type IN (
    'discovery.searched', 'discovery.resolved', 'discovery.described',
    'clarification.requested', 'clarification.responded', 'configuration.checked',
    'trial.started', 'trial.completed', 'trial.failed', 'trial.expired_while_running',
    'selection.product_selected', 'scope.selected', 'scope.accepted', 'quote.created',
    'payment.settlement_started', 'payment.settlement_pending', 'payment.settled',
    'payment.failed', 'receipt.issued', 'entitlement.activated',
    'delivery.prepared', 'delivery.failed', 'recovery.grant_recovered',
    'recovery.challenge_created', 'recovery.credential_rotated',
    'recovery.result_recovered', 'recovery.trial_recovered', 'recovery.purchase_replayed'
  );
```

These SELECTs do not deduplicate. Consumers deduplicate `event_id` before counting
outcomes; replayed ingestion must not create another selection or payment. A
floating USD conversion must not replace the exact amount. Do not use a missing
later stage as evidence of buyer intent or abandonment.

Cloudflare's official [Basin Pipelines JSON functions](https://developers.cloudflare.com/basin-pipelines/sql-reference/scalar-functions/json/),
[conditional functions](https://developers.cloudflare.com/basin-pipelines/sql-reference/scalar-functions/conditional/)
and [SELECT reference](https://developers.cloudflare.com/basin-pipelines/sql-reference/select-statements/)
were checked on 2026-10-19. The documented typed string function produces an
empty string for missing/non-string values; the proposed NULL conversion avoids
treating such values as real identifiers or prices. Local fixtures emulate only
these JSON accessors and execute the proposed SELECTs in SQLite. This verifies
mapping, filtering, decimal-string/array preservation and duplicate semantics,
not Cloudflare's compiler, destination types, permissions or actual ingestion.

External verification still requires a reviewed current pipeline SQL snapshot,
actual sink schemas/permissions, provider validation of the proposed projection,
and the same event ID observed in D1 outbox, ingestion acknowledgement and the raw
landing table. Those dependencies do not authorize production access or a new
stream, pipeline, schema, rollout or deletion in this pass.

## Local verification

Run `node --test --test-isolation=none tests/telemetry.test.mjs` in
`workers/gateway`. Tests cover transactional rollback, strict privacy, every
registered stage, stable IDs, prepared-statement fixture transactions, rejected
optional links preserving actual quote/trial/scope/payment authority, bounded exact-key reads,
expired running trials without invented outcomes, execution quotes without
pre-result artifact hashes, pinned component correlation, exact amounts, stable
retries, optional read failure, provider failure preserving settlement, and
poison-event fairness. The runtime journey test invokes an actual producer for
every registry entry and verifies that repeated RPC operations remain distinct.
Additional tests exercise HTTP discovery documents/menus and Code Mode default
providers, including sandbox correlation and dynamic import initialization.
Projection tests execute the exact review-only SELECTs
against generated fixture events and duplicated raw rows. Shared producer source
coverage prevents a registry-only implementation from counting as instrumented.
