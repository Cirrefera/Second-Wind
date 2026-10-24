# Second Wind consolidation inventory

The implemented system is the starting point. This inventory preserves its current authorities and records what must be resolved before consolidation or retirement. It implements the structural inventory portion of Ticket 1 in the owner's system consolidation plan, under the existing FIX-07/08/13/14/19/20/26 work. It does not create a competing fix tracker.

**Status: structural inventory captured; full Ticket 1 acceptance remains open for external consumer closure and protected object/record inventories.** No application behavior, production resource, product publication, inference setting, payment, or stored record changes in this change.

## Owner-confirmed payment meaning

The product model is **maximum payment → sandbox use → chosen purchase or measured usage → final charge within the maximum**. The maximum is a ceiling, not the amount automatically charged. There is no buyer-facing quote stage. This clarification supersedes earlier plan/tracker wording that described the journey as an exact-price quote workflow.

Existing identifiers such as `commerce_quotes`, `quote_id`, `/api/quotes` and `createScopeQuote` are recorded as implementation names only; their presence does not redefine the product model. Renaming persisted IDs or public routes is not part of this inventory.

The component path already distinguishes `scope.max_amount_atomic` from `scope.amount_atomic`: `prepareComponentSelection` sums only chosen component allocations, `acceptTrialSelection` requires a completed trial and matching selected scope, and `createScopeQuote` persists the selected amount for settlement. The maximum, selected scope, usage evidence where applicable, and actual charge must remain separate concepts in consolidation. Selection preparation itself does not call the payment facilitator.

The maximum in this path is the release’s price ceiling. The buyer signs the final selected amount after acceptance; the trial code requires no pre-trial payment authorization. This establishes selection-based pricing. It does not establish time/token/resource metering: the ordinary product path still uses listed price and `SW-EXEC` uses a fixed 2,000 atomic-unit amount. Production component releases are empty. Reconcile these paths and their discovery/API language under FIX-10/11/17/19 without inventing usage measurements.

Existing scope tests cover a $10 maximum with a 30% selection costing $3; missing dependencies are disclosed rather than silently charged; selection tampering is rejected; allocations sum exactly to the maximum. All five passed. `trials.test.mjs` additionally covers trial/selection without payment configuration, acceptance after trial, settlement of only the selected fraction, and delivery of only selected files. Those integration tests were inspected and are covered by the accepted release’s successful gateway test step; only the five dependency-free scope tests were rerun in this review.

## Code Mode and Cap'n Web: verified preservation contract

Follow-up source review uses the same `c0fb9cc` runtime. Code Mode executes the trial through `DynamicWorkerExecutor`; Cap'n Web exposes product, trial, selection and purchased-grant capabilities. Neither transport determines the charge: `scope.js` computes the selection, and `commerce.js` owns payment and recovery.

| Step | Existing implementation | Meaning to preserve |
| --- | --- | --- |
| Inspect maximum | `ProductCapability.components()` → `describeComponents()` → `componentMenu()` | Release-owned `max_amount_atomic`, atomic component allocations and dependencies; no payment. |
| Try configured product | `select(sku).configure(config).trial(input)` → `trialProduct()` → `executeCode()` | Completed or failed buyer sandbox evidence. Explicit trial providers are `components`, `configuration` and `readFile`; no outbound network or gateway bindings. |
| Choose purchase | `TrialCapability.selectComponents(ids)` → `prepareComponentSelection()` | Requires completed trial; stores selected IDs, file identities, maximum and selected amount in a hashed scope. No automatic purchase of dependencies. |
| Accept selection | `SelectionCapability.accept(scope_hash)` → `acceptTrialSelection()` → `createScopeQuote()` | Recomputes and checks the selected scope, persists selected bytes, then creates final payment requirements. Acceptance alone does not settle. Repeated acceptance uses the same trial/scope identity. |
| Settle selected purchase | HTTP purchase URL from acceptance → `purchase()` | x402 signs/verifies the final selected amount. `createQuote()` rejects component products with `component_selection_required`, preventing the ordinary full-product route from bypassing selection. |
| Recover purchase | `getGrant()` / `recoverSession()` → `recoverGrant()` → `deliverGrant()` | Authenticated delivery of the purchased bytes/version, without another settlement. |

The HTTP trial endpoints and Cap'n Web capabilities call the same trial/selection/acceptance functions. The existing HTTP-batch test pipelines **recovery of an already completed trial → selection → scope inspection** in one request; it does not prove that the full trial-to-settlement journey takes one request. Trial creation in those service tests uses an injected executor, while separate CI tests exercise the actual Dynamic Worker runtime. Keep these evidence boundaries explicit.

### Other existing payment paths

`SW-EXEC` is an explicit one-invocation purchase at 2,000 atomic USDC units. `purchase()` verifies payment authorization, executes the requested code, persists a successful result, then attempts settlement. Failed Code Mode work is not settled. `executeGrantedInvocation()` recovers the identical result and rejects a changed request; it does not launch another paid execution. This is payment for one successful invocation, not elapsed-time/token metering and not a buyer's post-result selection step.

Products without component releases retain the listed-price purchase path. Products with component releases are gated into the trial/selection path. These are verified differences in current behavior, not authority to invent a meter or silently change existing prices. Production component-release availability remains the separate unresolved publication item recorded above.

### Monetary meaning in the event history

| Value or event | Existing source | Consolidation interpretation |
| --- | --- | --- |
| Maximum payment | Release `pricing.max_amount_atomic`; selection `scope_json.max_amount_atomic`; accepted `snapshot_json.scope.max_amount_atomic` | Preserve the exact release ceiling independently of the chosen charge. |
| Selected charge | Scope `amount_atomic`; acceptance `amount_usdc_micros` | Exact integer atomic units. `selected_share_bps` is an allocation weight, not a measured resource quantity. |
| `scope.selected`, `scope.accepted`, `quote.created` | D1 triggers in migrations 0002/0003 | Selection/preparation events, not evidence of money moving. Component acceptance emits both acceptance and the compatibility-named creation event; they describe one prepared purchase. |
| `payment.settlement_started`, `payment.settlement_pending`, `payment.failed` | Purchase-state transitions | Attempts, uncertainty or failure. Their `exact_amount_atomic` is not proof of a settled charge. |
| `payment.settled`, `receipt.issued`, `entitlement.activated` | Same settled purchase transition, correlated by payment ID | One settled purchase with multiple lifecycle observations; never sum all three as separate revenue. |
| Delivery and recovery observations | Existing delivery/recovery functions | Repeated access to an existing entitlement, not another purchase or billable use. |

**Specific Ticket 2 gap:** the current event allowlist, scope enrichment and proposed v1 projections carry `exact_amount_atomic` and `selected_share_bps`, but omit the separate maximum. Operational D1 JSON retains it. Preserve that source and map the ceiling separately in the canonical schema before claiming complete monetary coverage. Do not reconstruct the maximum by dividing the selected amount by its share: per-component atomic rounding makes that inference unreliable. Missing historical evidence stays unknown.

**Specific FIX-17/19 language gap:** discovery already documents the trial/selection chain, but `toolsDocument()` still calls acceptance a quote, OpenAPI advertises quote-based purchase, and the generic Cap'n Web guidance still presents `configure().quote()`. Reconcile those descriptions with the owner's maximum-payment model while retaining existing route/field identifiers for compatibility. This is not a missing sandbox implementation.

### Follow-up validation

[PR verification run 40056053605](https://github.com/Cirrefera/Second-Wind/actions/runs/40056053605), for documentation head `5c0635881750af0d4351e6d153c9a82a8967aae7`, passed. Its logs confirm 222 gateway tests, 21 legacy/Pages tests and 32 release-acceptance tests, all passing, plus actual Dynamic Worker checks and both builds. The gateway log explicitly includes selected-fraction settlement, one-batch trial recovery/selection, trial without payment configuration, failed Code Mode work without settlement, and execution replay protections. These existing results are reused; no duplicate suite or funded transaction was run in this follow-up. Later documentation edits do not change that tested runtime.

## Evidence boundary

- Source: `c0fb9cc2c6927a036e2d0193c3d505630c4c227a`; 64 retrieved source/configuration/document files verified against their Git blob hashes before editing.
- Gateway: `3302125b-6658-4523-94ac-06edb36a191d`, serving 100% of traffic, tagged with that commit.
- Pages: `639230c2-516c-4b90-b5cf-a75a9bea13d9`, clean `main` deployment of the same commit, bound to `secondwind-gateway`.
- [Production run 39986362848](https://github.com/Cirrefera/Second-Wind/actions/runs/39986362848) succeeded, including all test/build steps, migrations, deployment and release acceptance. Existing full-suite evidence is reused. At the owner’s explicit request to verify payment meaning, the five existing scope tests were rerun on Node 24.19.0: all passed. No funded settlement or new inference call was performed.
- Live schema/configuration observations were made during the October 23, 2026 America/New_York orientation and follow-up. These are separate reads, not a consistent backup or a migration boundary. Aggregate row counts are point observations, not continuing assertions.
- No secret values, payer records, recovery credentials, payment payloads or customer configuration values are included.

The machine-readable [baseline](evidence/consolidation/baseline.json) records observed schemas, constraints, indexes, triggers, pipeline SQL, resource identities and source references. The [field ledger](evidence/consolidation/field-ledger.csv) accounts for **569 entries**: 191 D1 columns, 218 Iceberg columns, 66 unconnected sink fields, 59 stream fields and 35 event-payload vocabulary fields. JSON-valued columns are preserved whole; this does not claim that every historical nested payload key has been inspected.

The ledger's initial target is the retained source field or retained definition. That is an explicit preservation disposition, not a completed canonical transformation. Unit conversions, conflict resolution, final destination schema and backfill belong to Tickets 2–3. Unknown values/units remain unknown.

## Authority and dependency graph

| Responsibility | Existing owner and code path | Preservation rule |
| --- | --- | --- |
| Public ingress | `src/worker.js` → private `GATEWAY` binding → `workers/gateway/src/index.js` | Keep forwarding responses unchanged, including Cap'n Web upgrades. `functions/` is not the advanced-mode Pages entry point. |
| Discovery and product configuration | Gateway `catalog.js`, `discovery.js`, `routing.js`, `product-service.js` | Keep live version checks, structured constraints, explicit language clarification and compatibility behavior. |
| Maximum payment and final charge | Gateway `scope.js` / `commerce.js` → D1 acceptance/purchase/payment records → CDP x402 | Preserve the ceiling separately from the selected or usage-derived charge. Retain exact atomic amounts, settlement ownership and unknown outcomes. |
| Trial and selected scope | `trials.js`, `scope.js`, `execution.js` → D1 component tables and `LOADER` | Trial/selection/acceptance have different identities. Keep dependency and file-hash checks. |
| Execution | Gateway Dynamic Worker loader; `src/lib/bedrock.js` for the existing Bedrock adapter | Keep current runtime boundaries and no-outbound sandbox settings. Adapter presence does not prove a live executable SKU. |
| Delivery and recovery | `commerce.js`, `GrantCapability` → D1 state and R2 | Retain purchased version, private recovery ownership and exact-byte references. A delivery observation is not a new purchase. |
| Release preparation | `release-preparation.js`, `publication.js`, preparation scripts and product release inputs | Preparation/validation is implemented. Registration writes are separate from public runtime reachability and require genuine review evidence. |
| Routing judgments | `clef.js` question/reduction logic; `jev.js` native adapter used by evaluation scripts | Keep versioned questions, probability readings and provider evidence. Production lacks the enablement flag/AI binding; the Jev adapter is not imported by the serving entry point. |
| Transaction events | D1 triggers plus `telemetry.js` observations → `business_event_outbox` → `BUSINESS_EVENTS` | Preserve durable event identity and raw evidence. `sent_at` is dispatch acknowledgement, not table-arrival proof. |
| Analytics | `second_wind_events` → running `secondwind_telemetry` → raw and specialized sinks | Retain historical semantics. Basin does not authorize settlement, entitlement or delivery. |

The serving gateway module graph still includes **`src/lib/curation.js` and `src/lib/bedrock.js`**. Removing the older `src/lib` directory would remove active dependencies. The graph describes module reachability, not proof that every exported function executes.

Current transport surfaces in `index.js` include discovery aliases, `/api/resolve`, product components, trial creation/recovery/selection/acceptance, `/api/configure`, `/api/quotes`, HTTP x402 product/artifact routes, `/rpc`, `/capnp`, and authenticated purchase delivery/recovery. `ProductService` and its capabilities share service functions with HTTP. Capability availability does not mean every dormant product has production data.

## Operational tables: identity and ownership

All 21 application tables retain their columns, original definitions, indexes and triggers in the baseline. SQLite's declared `notnull` and primary-key position are recorded separately; do not infer stronger null semantics than the actual schema.

| Tables | Record identity / role | Observed producer and consumer paths |
| --- | --- | --- |
| `items` | SKU; current catalog version | Catalog/commerce/discovery/curation readers; release registration writer. 157 rows: 155 draft, 1 live, 1 retired. |
| `catalog_items` | SKU; historical catalog contract | Historical root migration and administrative/import paths need closure; no gateway SQL reader found. Preserve its unique tool, language, reference and estimate fields. |
| `services`, `categories` | Slug; historical taxonomy | Referenced by `catalog_items` foreign keys. Preserve relationships even without a current gateway query. |
| `edges` | From SKU + to SKU + relation | Active `src/lib/curation.js` neighborhood reader. External curation writer unresolved. |
| `promotions` | Promotion ID; publication history | External/admin writer and consumers unresolved. Preserve actor/action/note history. |
| `product_routing_manifests` | SKU + version | Release registration writes; routing reads; immutable update/delete triggers. Zero rows observed. |
| `component_releases` | SKU + version | Release registration writes; trial/catalog/commerce/telemetry reads; immutable triggers. Zero rows observed. |
| `commerce_quotes` | Existing `id`; internal frozen acceptance/payment record | Commerce creates and reads; telemetry triggers/enrichment read. In the component path, amount is the selected purchase charge; scope retains its maximum separately. Preserve JSON, hashes, expiry, asset/network/payee and exact amount. |
| `commerce_purchases` | Payment ID; unique quote ID and payment key | Commerce claim/preparation/settlement/recovery state; transition triggers. Preserve separately from `payments`. |
| `payments` | Payment ID; unique idempotency index | Commerce writes/reads; grants/delivery/recovery references. Three rows observed; no new funded transaction tested. |
| `purchases` | Legacy purchase ID; unique idempotency and quote/config pair | `functions/_lib/purchase.js` has SQL writers/readers outside serving module closure. Gateway URL strings containing “purchases” are not SQL references to this table. External/legacy consumers unresolved. |
| `component_trials` | Trial ID | Trial lifecycle and private token/config/result; trials writes/reads, telemetry reads/triggers. |
| `component_selections` | Trial ID + scope hash | Trial selection writes; acceptance reads; scope trigger/enrichment. Keep repeated legitimate distinct scopes. |
| `component_acceptances` | Acceptance key; unique quote ID | Commerce idempotent acceptance linkage and telemetry enrichment. |
| `payload_objects` | Payload ID; unique SKU/version | Release registration writes; catalog/commerce reads. Zero rows observed; this does not retire the R2 delivery capability. |
| `delivery_grants` | Grant ID; unique payment/payload relation | Settlement creates authorization; preserve referenced payment and payload identities. |
| `deliveries` | Delivery ID | Commerce delivery occurrence writer; each legitimate redelivery remains a distinct occurrence. |
| `commerce_recovery_challenges` | Challenge ID | Commerce creation, verification, expiry and consumption. Keep existing access restrictions; never migrate proof material into analytics. |
| `business_event_outbox` | Event ID | Transaction triggers and observation writer; scheduled dispatcher/enrichment. 378 rows and zero pending at the orientation observation. |
| `request_log` | Integer observation ID | Older `functions/_lib/store.js` and `src/lib/ledger.js` writers are outside serving module closure. Do not infer current production writes from those files alone. External writer/retention review remains open. |

The metadata-only R2 list returned no objects in `secondwind-payloads` or `secondwind-deliveries`. The catalog bucket contains Iceberg storage and has **not** received a complete protected object-manifest audit in this ticket. No object bytes or hashes were verified by an empty listing.

## Analytics coverage and unresolved meaning

The catalog lists 26 tables. Their complete current top-level schemas are retained, including field IDs/types/required flags:

| Family | Tables | Disposition |
| --- | --- | --- |
| Raw history | `all_events` | Retain original history and payloads; completeness against outbox remains unproven. |
| General event projections | `identity_events`, `catalog_events`, `commerce_events`, `execution_events`, `delivery_events`, `recovery_events`, `guard_events` | Retain historical names, dimensions and lifecycle meaning. |
| Financial/scope/usage projections | `payment_events`, `receipt_events`, `scope_events`, `meter_events` | Retain original units and values; no inferred conversion between bps, USD or atomic amounts. |
| Decision evidence | `decision_runs`, `decision_answers`, `decision_options`, `decision_reductions` | Retain parent/child identities and separate evaluations. Native Jev evaluation reports are not automatically equivalent to these historical tables. |
| Reference definitions | `products`, `product_versions`, `capabilities`, `scope_units`, `taxonomy_nodes`, `failure_signatures`, `decision_questions`, `decision_profiles` | Retain definitions and versions; final operational authority/analytical-copy mapping remains open. |
| Test history | `debug_all`, `flat_test` | Retain separately from real buyer evidence. No current pipeline references these destinations. |

Four streams exist: `second_wind_events`, `secondwind_catalog_load`, `prefreeze_test`, `flat_test`. Only `second_wind_events` appears in the running pipeline SQL. Its HTTP ingestion is disabled and Worker ingestion enabled. The other three expose HTTP ingestion without authentication according to their configuration; this inventory records that state under FIX-25/26 and does not change it or assert that anyone used it.

The running pipeline has 16 distinct destinations: the raw sink and 15 specialized sinks. Its 19 distinct specialized event filters overlap the current 29-event registry only at `receipt.issued`. Even that shared name has different projected payload fields; it does not establish semantic compatibility. The unfiltered raw projection is a separate path and must be preserved.

Three additional sinks exist and have the exact field order/types/required flags declared in `telemetry/basin-resources-v1.json`:

| Sink | ID | Fields | Current connection |
| --- | --- | --- | --- |
| `journey_events_v1_sink` | `49b0de3f073345f69df9925cb49b1ec2` | 29 | Unconnected; table absent from catalog listing |
| `payment_events_v1_sink` | `740a8c3175d448dfb79f276552bbf7a5` | 19 | Unconnected; table absent from catalog listing |
| `scope_events_v1_sink` | `4e31f23bad044202bdde1085f89926e6` | 18 | Unconnected; table absent from catalog listing |

`secondwind_contract_v1` is absent. The old instruction to create all three sinks is superseded by their observed existence. Their existence does not prove credential usability, pipeline validation, materialized tables or delivery. The owner’s later consolidation plan governs target selection: these three definitions are candidates, not an instruction to preserve three domain sinks or deploy the older additive design unchanged.

## Duplicate candidates and intentional differences

| Candidate | Classification and evidence | Action in this change |
| --- | --- | --- |
| `src/lib/brand.js` ↔ `functions/_lib/brand.js` | Exact bytes / matching Git blob; neither in serving module closure | Record exact copy; retain pending all tooling/legacy consumers. |
| `src/lib/cdp-auth.js` ↔ `functions/_lib/cdp-auth.js` | Exact bytes / matching Git blob; neither in serving module closure | Record exact copy; retain pending all tooling/legacy consumers. |
| Legacy and gateway commerce/discovery | Overlapping responsibilities with different contracts and entry points | No broad extraction/deletion. Compare callers, side effects and compatibility before consolidation. |
| `items` ↔ `catalog_items` ↔ analytical `products` | Different schemas and potentially different lifecycle/provenance | Preserve all distinct fields; establish explicit aliases/mappings before any merge. |
| `purchases` ↔ `commerce_purchases` ↔ `payments` | Different identity/state/settlement roles | Preserve each source; never merge on amount, payer or similar timestamps. Keep maximum authorization and actual charge distinct. |
| Raw events ↔ specialized projections | Intentional analytical copies, with stale projection semantics | Preserve raw and historical data. Choose replacement projections only after complete field/event mappings. |
| Repeated event ingestion | Potential duplicate occurrences; no row-level proof collected | Deduplicate interpretation only after scoped identity/payload comparison; retain conflicts. |
| R2 payload/release copies | No objects listed in the two application buckets | No deduplication claim. Product/release ownership and exact-byte references remain required. |
| Jev questions/results and historical decision tables | Separate versioned definitions and evaluations | Preserve provider/question/request evidence; do not rerun inference as migration. |

## Consumer discovery and remaining gates

All 19 other account Workers' current settings were checked for direct bindings to this D1 database, the three Second Wind buckets, the business stream, or the gateway service. No matches were returned. The Pages service-binding scan returned the production `second-wind` → `secondwind-gateway` binding. The zone Worker-route listing was empty; Pages custom domains remain the observed ingress. The existing gateway cron is `* * * * *`, used by `dispatchOutbox`; it is not a new autonomous agent monitor.

This does not enumerate remote API-token users, dashboard SQL queries, external scripts, other repositories, HTTP clients, historical deployments or dynamically constructed dependencies. The source graph is a bounded import/text inspection, with lexical references labeled explicitly. It is not safe-retirement clearance.

Remaining work stays in the current tracker and the plan's three tickets:

1. **Ticket 1 / FIX-07/08/13/14/19/26:** close external/admin/import/query consumers; collect protected R2/catalog manifests and source record inventories; identify source JSON keys and ownership where schema alone cannot. Preserve unresolved objects.
2. **Ticket 2 / FIX-13/14:** resolve historical units, event lifecycle mappings, source-qualified IDs and decision cardinality. Select canonical schema and justified sink count using coverage and actual consumers. The 569 identity-retention entries are the starting ledger, not final transformations.
3. **Ticket 3 / FIX-14/20/26:** rehearse restoration, resumable backfill/deduplication, concurrent-write boundary, same-event raw/analytical trace, reconciliation and rollback. No settlement, entitlement or execution replay.

No resource or record is approved for retirement by this inventory. No unexplained unknown is converted into zero, absent functionality, completed verification or permission to delete.
