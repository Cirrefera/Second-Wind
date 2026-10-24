# Production schema — 2026-10-23

## Current-state addendum

The complete retained schema/field inventory is in [CONSOLIDATION_INVENTORY.md](CONSOLIDATION_INVENTORY.md) and [baseline.json](evidence/consolidation/baseline.json). All three v1 sinks now exist but are unconnected and their tables are absent. The serving release is c0fb9cc. The owner’s later consolidation plan determines the final destinations; the original additive three-sink design below is historical candidate work.

Payment meaning is maximum payment, sandbox use, then final charge for selected purchase or usage. Existing `commerce_quotes`/`quote_id` names remain implementation identifiers. The component path records its maximum separately from the accepted selected amount; preserve both without charging the ceiling by default.

The earlier snapshot and credential/sink checkpoint below remain historical evidence, not current setup instructions.

This document records the production schema observed directly from Cloudflare before FIX-13 changes. It distinguishes durable application state, the application event contract, the Basin transport schema, raw Iceberg history, and the stale October 18 specialized projections.

## Authority order

1. D1 is authoritative for durable catalog, commerce, delivery, and the business-event outbox.
2. `src/telemetry.js` is authoritative for `event_contract_version = "1"`.
3. Basin stream `second_wind_events` transports that contract.
4. `secondwind.all_events` is the existing raw landing history.
5. The October 18 `secondwind_telemetry` specialized SQL is legacy projection logic and must not redefine the application contract.

## D1 production schema

The production database contains these application tables:

`business_event_outbox`, `catalog_items`, `categories`, `commerce_purchases`, `commerce_quotes`,
`commerce_recovery_challenges`, `component_acceptances`, `component_releases`,
`component_selections`, `component_trials`, `deliveries`, `delivery_grants`, `edges`,
`items`, `payload_objects`, `payments`, `product_routing_manifests`, `promotions`,
`purchases`, `request_log`, and `services` (plus Cloudflare's internal `_cf_KV`).

The live `items` row is `SW-PT-0006` version 1 at $0.10. At observation time,
`product_routing_manifests` had zero rows and `component_releases` had zero rows.
That is why live structured routing cannot truthfully borrow the reviewed draft-v2 contract.

### business_event_outbox

| column | type | requirement |
| --- | --- | --- |
| event_id | TEXT | primary key |
| event_type | TEXT | required |
| occurred_ts | TEXT | required |
| payload | TEXT JSON | required |
| attempts | INTEGER | required, default 0 |
| sent_at | TEXT | optional |
| last_error | TEXT | optional |

Observed outbox event counts during this review: `discovery.described=237`,
`discovery.resolved=1`, `discovery.searched=1`, `quote.created=1`.
Recent discovery rows had `sent_at` populated and `last_error = NULL`, establishing active dispatch.

## Current application event contract

`EVENT_CONTRACT_VERSION = "1"`. The complete event list and payload field vocabulary are
machine-readable in `telemetry/event-contract-v1.json`.

The payment contract uses `payment.settlement_started`, `payment.settlement_pending`,
`payment.settled`, and `payment.failed`; exact amounts use the decimal string
`exact_amount_atomic`, and the network field is `payment_network`.

## Basin stream

Production stream: `second_wind_events` (`d135ad1c9f9246ae945be1d1b8277ddc`).

Required fields:
`event_id`, `schema_version`, `event_contract_version`, `event_type`,
`occurred_ts`, `payload`.

Optional legacy envelope fields remain:
`actor_id`, `visitor_id`, `session_id`, `journey_id`, `request_id`, `buyer_id`.

HTTP ingestion is disabled; Worker binding ingestion is enabled. The deployed gateway binding
`BUSINESS_EVENTS` points at this stream.

## Raw Basin Catalog table

`secondwind.all_events` is active and continuing to receive snapshots. Its Iceberg schema is:

`__ingest_ts timestamp required`,
`event_id string required`,
`schema_version string required`,
`event_contract_version string required`,
`event_type string required`,
`occurred_ts timestamp required`,
optional `actor_id`, `visitor_id`, `session_id`, `journey_id`, `request_id`, `buyer_id`,
and `payload string required`.

The raw table is retained. FIX-13 does not rewrite or delete historical rows.

## Why the existing specialized projections are stale

The running pipeline `secondwind_telemetry` (`c36bc1cd21814d3091f84329257b3c09`) still filters
for old events such as `catalog.selected`, `scope.activated`, `commerce.checkout_initiated`,
`payment.settle`, `delivery.completed`, and `recovery.attempted`.

Its existing Iceberg tables also encode the old field meanings. For example:

- `payment_events`: `amount_bps`, `asset`, `network`, `settlement_reference`, `outcome`.
- `receipt_events`: `price_bps`, `max_price_bps`, `price_digest`, `settlement_reference`.
- `scope_events`: `product_version_id`, `unit_key`, `price_digest`, `final_price_bps`.
- `delivery_events`: `artifact_id`, `receipt_id`.
- `recovery_events`: `recovery_kind`, `receipt_id`, `outcome`.

Those schemas are historical. They are not renamed or repurposed for event-contract v1.

## FIX-13 rollout shape

The checked-in `telemetry/basin-pipeline-v1.sql` defines an additive pipeline named
`secondwind_contract_v1` over the existing `second_wind_events` stream.

It targets three new versioned Basin Catalog tables:

- `secondwind.journey_events_v1`
- `secondwind.payment_events_v1`
- `secondwind.scope_events_v1`

Exact sink schemas are in `telemetry/basin-resources-v1.json`. The old raw landing table and
old specialized tables remain intact.

Cloudflare Basin Pipelines SQL and sink configuration are immutable after creation, so this
is intentionally a new versioned pipeline rather than an edit to `secondwind_telemetry`.
Creating the new Basin Catalog sinks requires a catalog token value with the required R2/Basin
permissions. No credential value is checked into the repository.

## Historical FIX-13 checkpoint — before sink provisioning

**Source verified; Cloudflare rollout BLOCKED on catalog-token authority. FIX-13 is not complete.**

- PR: [Pin telemetry contract v1 and replace stale Basin projections](https://github.com/Cirrefera/Second-Wind/pull/11), branch `fix/telemetry-contract-v1-20261023`.
- RED commit: `88cfd25f0380bba6842e1eb11fbe4e91b7a729d5`; original failed run `39984303113` is preserved.
- GREEN implementation: `bbe6060d0f857cb3f7414e8a20c5724047e06cfb`, tree `4c1717edc795c08618666a139c5fdbda203c2765`.
- [Verification run 39984653470](https://github.com/Cirrefera/Second-Wind/actions/runs/39984653470), job `120520573239`: completed/success. Gateway, release acceptance, Pages, actual Dynamic Worker tests, gateway build and Pages build all passed.
- Source inspection found ordered SQL outputs matching all proposed sink fields: journey 29, payment 19, scope 18. Exact event filters contain 29, 6 and 2 events respectively; all require contract version 1 and producer secondwind-gateway. Atomic amounts remain strings. This is structural source verification, not live planner or sink-delivery proof.
- Cloudflare account `9ae12807d5b18bf3d1bcbe38b9050e05`: the account-token permission-group endpoint returned `is_selectable=false` for Workers R2 Data Catalog Write (`d229766a2f7f4d299f20eaa8c9b1fde9`), Catalog Read and R2 SQL Read. Bucket Item Write is selectable, but storage permission alone is insufficient. No token was created or exposed.
- Catalog `secondwind-catalog` credential status remains `absent`. Inventory contains none of the three proposed v1 sinks and no `secondwind_contract_v1` pipeline. No Cloudflare resources were changed.
- Existing stream: `d135ad1c9f9246ae945be1d1b8277ddc`. Legacy pipeline `c36bc1cd21814d3091f84329257b3c09` remains running and untouched. Raw sink: `224b3c7020a24e3897ff06b80970433e`.
- Raw `secondwind.all_events` metadata read succeeded: its 13 fields still match the checked-in raw schema; 91 snapshots were reported. Metadata is not proof of any particular event's arrival.
- Existing safe discovery observation in D1: `discovery.described:obs_b2ea171f-367b-4ae4-b50d-266e354c7120`, occurred `2026-10-23T16:07:58.713Z`, sent `2026-10-23T16:08:41.160Z`, last_error NULL. This proves outbox acknowledgement only. No same-event raw/projection trace is claimed; use a fresh observation after the new pipeline is running.
- D1 read-only checks confirm zero routing manifests and zero component releases. Both prepared v2 products still have empty review_objects and publication_approval_pending. FIX-07 and FIX-08 remain open; no product was activated and production inference stays disabled.

### Exact unblock and remaining acceptance

An authorized account session must be able to create a token containing Catalog Write plus Bucket Item Write, scoped to `com.cloudflare.edge.r2.bucket.9ae12807d5b18bf3d1bcbe38b9050e05_default_secondwind-catalog` where supported. The [Cloudflare catalog authentication guide](https://developers.cloudflare.com/basin-catalog/manage-catalogs/#create-api-token-via-api) documents this bucket-scoped policy. The token belongs only in the sink configuration's secret `config.token`; never put it in source, documentation or chat.

For each checked-in sink, the create request uses its exact name/type/schema and config with account_id, bucket secondwind-catalog, namespace secondwind, table_name (unqualified table name), and the token held in memory. Do not create partial storage-only credentials. Do not assume a catalog token can be revoked after creation; continued sink writes require authentication, and no safe post-bootstrap revocation was established.

1. Provision the minimum authorized catalog credential and create/read back all three sinks using `telemetry/basin-resources-v1.json`.
2. Validate the exact checked-in SQL, create `secondwind_contract_v1`, then read back running status, SQL, sink schemas and actual Iceberg schemas. Do not repeat the known missing-sink planner failure before this prerequisite changes.
3. Produce an ordinary public discovery observation and trace its exact event_id from D1 into both raw history and journey_events_v1. Payment/scope remain structurally verified only until genuine events arrive; do not fund a purchase for telemetry testing.

The repository source can be merged independently of the external resource rollout. Its telemetry files do not change serving Worker behavior. A successful GitHub deployment must not be reported as completion of the missing Basin resources or event trace.
