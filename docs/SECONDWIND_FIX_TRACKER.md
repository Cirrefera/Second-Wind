# Second Wind — canonical fix tracker

**October 25 retirement:** the owner retired Clef-assisted routing, inventory
classification and journey interpretation. That source is explicitly deprecated;
older inference-enablement instructions below are historical. Fifteen obsolete
sink destinations were removed after preserving a running raw landing path;
four sinks remain. Seventeen catalog table drops remain blocked on catalog-capable
access; all 29 tables remain intact. See
[the retirement record](CLEF_DEPRECATION_2026-10-25.md) for the exact scope and
verification. This instruction does not authorize new workflows or unrelated fixes.

Last updated: 2026-10-24 (America/New_York).

Repository: https://github.com/Cirrefera/Second-Wind

Canonical tracker: `docs/SECONDWIND_FIX_TRACKER.md`.

## Paid protected sandbox — implementation checkpoint, 2026-10-24

User-approved policy: only the explicit 72 SKUs in `workers/gateway/src/sandbox-policy.js` are eligible. The other 85 inventory items, including result services and bundles, cannot start trials. Eligibility does not imply runtime availability. New trial admission costs $0.01 through the existing official Hono/x402 handler; settlement grants preview admission only. Exact trial retries/recovery remain free and never silently rerun. Product price ceilings and component allocations are unchanged.

The new AWS-0568 v4 preview privately executes its selected JavaScript implementation. Buyer code receives only bounded diagnostics plus public component/configuration data. Python delivery remains selectable, explicitly previewed through JavaScript. Paid product delivery alone exposes selected files. Existing purchases and historical release objects remain intact. Migration 0006 links each trial to exactly one paid admission.

Gateway and public discovery changes are implemented and existing required checks pass. Deployment and v4 activation are pending at this checkpoint; see the v4 preview review for evidence and limits.

## Buyer-flow release evidence — 2026-10-24

PR #19 deployed configured POST purchases, required pre-execution trial credentials and single-owner recovery. PR #20 activated language-specific AWS-0568 v3 through the existing publisher. Live observations confirm the official configured guide challenge, recovery of a disconnected trial without another execution, both language-specific R2 packages, and preservation of an accepted v2 URL after activation. The final follow-up fixes bodyless accepted POST parsing. [Detailed evidence and limitations](BUYER_FLOW_IMPLEMENTATION_2026-10-24.md#production-evidence--2026-10-24). Standard Hono/x402, prices, old payloads and purchase snapshots are preserved.


## Buyer-flow repair implementation — October 24, 2026

Source baseline: `3e81553d9ada199fadc8065e6774af29350d24a6`. This checkpoint is an implementation candidate, not a deployed completion claim.

- FIX-17: configured whole-product purchase entry now uses POST with explicit configuration; discovery/OpenAPI agree. New acceptances pin the method; historical accepted GET URLs retain their original behavior. Official x402 verification/settlement code is unchanged.
- Trial response-loss recovery: required caller-known ID/token pairs, D1 request identity and execution owner, immutable input binding and no automatic rerun. Additive migration 0005 must precede deployment. HTTP/Cap’n Web preserve bounded in-flight work; stored trial results remain recoverable after catalog changes until expiry.
- FIX-19 / product delivery: explicit language file manifests are supported for new releases. AWS-0568 v3 is a separate draft candidate; v2 files, publication references and historical purchases are preserved. V3 is not registered or activated by this change.
- Verification: source review, syntax/diff checks and gateway compilation. No new tests were added. Existing fixtures were aligned with the required trial credentials and migration; assertions are unchanged. A compile is not runtime/payment evidence. Required CI and deployment checks remain intact and must pass before release.
- Details and release order: [buyer-flow implementation record](BUYER_FLOW_IMPLEMENTATION_2026-10-24.md).

## Product publication and telemetry checkpoint — October 24, 2026

PRs #12, #16 and #17 are merged. Production run [40120724077](https://github.com/Cirrefera/Second-Wind/actions/runs/40120724077) accepted main commit `af0188fe02137277b8a4f7c90c07fb5f0eaa5b5e`, gateway `b6a21b13-d032-41ed-a518-801e3bf3a051` and Pages deployment `2c5a3ecd-209e-4a00-a44b-e86e80a339a9`. The draft/not-deployed statements in the historical October 24 sections below are superseded by this checkpoint. No funded purchase was verified.

The existing `secondwind_contract_v1` pipeline is running. All three versioned tables exist. The journey table has ten snapshots with 33 record appends, matching the 33 discovery events in D1 since pipeline creation; the outbox has zero pending rows. Payment and scope tables have no snapshots and no matching new producer events were observed. This is table/snapshot arrival evidence, not row-by-row reconciliation, payment proof or completion of all telemetry consolidation. See `docs/evidence/telemetry/contract-v1-2026-10-24.json`.

Actual source and evidence reviews for AWS-0568 v2 and SW-PT-0006 v2 are recorded in [the release review](PRODUCT_RELEASE_REVIEW_2026-10-24.md), with an explicit AI reviewer identity and exact manifest hashes. Existing validation evidence is reused. Product code and payment code are unchanged; delivered documentation now reflects approved pricing, actual sandbox language support and release wording. Exact candidate bytes were regenerated. The publication record resolves the prior editorial pending markers; the original source inputs retain those markers and all runtime gates remain enforced.

The operator workflow invokes the existing `publishRelease` function through official Wrangler remote bindings. A merge changing `products/publication.json` explicitly requests its recorded mode; manual dispatch pins a main commit and mode. The workflow registers immutable payloads, review records and routing manifests, then activates only through the existing guarded operation. Publication results and production readback must be recorded before FIX-10/11 are marked complete. No product is claimed live by this source checkpoint.

## Owner-approved catalog pricing — October 24, 2026

The approved maximum-payment schedule is applied to D1: 3 products at $10, 8 at $5, 92 at $1, 21 at $0.50 and 32 at $0.25. The retired proof product is excluded. Readback confirms 155 drafts, one live product and one retired product; no product was activated. See [the exact assignments and application evidence](CATALOG_PRICING.md) and `products/pricing.json`.

AWS-0568 now has its commercial allocation ($2 table, $1 status index, $0.50 expiry, $1 recovery, $0.50 change stream); its release input remains draft pending the existing genuine review and publication prerequisites. SW-PT-0006 has a $1 maximum and its replacement input is aligned. Historical payloads, purchase amounts and recovery credentials remain intact. FIX-10's missing allocation is resolved; FIX-08/10/11 are not thereby complete. Payment rails, sandbox code and Cap'n Web are unchanged.

## Purchase recovery follow-up — October 24, 2026

Draft PR #16 now addresses the owner's three selected failures: reaccepting the same expired, unclaimed component selection renews its existing acceptance; wallet recovery reuses a public challenge instead of exhausting five slots; and authenticated HTTP/Cap'n Web reconciliation can restore a missing receipt from the original finalized Base transfer. No purchase is re-settled. Chain evidence must match the existing authorization key, payer, recipient, native USDC asset and exact selected amount.

Code Mode, Cap'n Web, sandbox trials and selected scope, official Hono/x402 payment ownership, immutable purchase snapshots and D1/R2 recovery remain the architecture. No dependency upgrade or schema migration is introduced. Reconciliation requires the original transaction hash if it was not stored, plus the private recovery token (recoverable through the existing payer-wallet proof). The Base reader is read-only; RPC outages leave recovery pending.

Source review and Worker compilation are the verification scope for this follow-up. No additional test work is included at the owner's direction. This remains a draft implementation, not a deployment or live-payment verification. FIX-15 and FIX-16 below describe this implementation and its remaining release boundary.

## Removal of conflicting commerce behavior — October 24, 2026

The restoration draft now removes `POST /api/quotes`, the Cap'n Web `quote`/`quoteProduct` methods, and Code Mode quote providers. No replacement quote endpoint or whole-product acceptance RPC is introduced. Whole-product buyers request the paid HTTP endpoint directly; official Hono/x402 returns the challenge. The existing component sandbox → selection → acceptance flow remains.

Catalog prices are explicitly maximums. Discovery no longer constructs exact payment requirements from a catalog maximum. Only the official middleware emits those requirements for the selected purchase. Component acceptance exposes the selected amount and ceiling as application metadata, with no parallel x402 requirements builder. The release validator is updated to reject premature exact-payment discovery.

New purchase responses use `acceptanceId`/`acceptance_id`. Historical signed `quote_id` URLs, immutable database rows, receipts, and versioned telemetry keys remain compatible; conflicting identifiers are rejected. These internal records do not create a buyer-facing step. Current README, API instructions, and specification now state that boundary.

The owner stopped further test work during this follow-up. Earlier verification below applies to the earlier restoration tree, not this amended candidate. This amendment has not been merged or deployed; no production data, payment, dependency version, or schema was changed.

## Standard x402 restoration — October 24, 2026

Draft implementation restores official `@x402/hono` middleware for paid HTTP routes using the existing locked 2.28.0 SDK. The payment replacement introduced in PR #3 is removed from the serving path: commerce no longer calls verification or settlement. Existing application claims, preparation, receipts and authenticated recovery integrate through supported lifecycle hooks. Sandbox trials, Cap'n Web selection, final selected amounts within the maximum, immutable files and historical purchase records remain intact. The [owner decision and recovery mapping](https://github.com/Cirrefera/Second-Wind/blob/f6fa26c970cb8f3ffa6b6980837e745a22539fab/docs/X402_RECOVERY_MAPPING.md) remain the scope reference; this implementation does not merge the separate consolidation documentation draft.

Two concrete failures are addressed: unresolved SDK settlement results no longer become terminal uncharged failures, and D1's trigger-inclusive change count no longer makes a successful settlement claim look unsuccessful. The latter was reproduced in the actual local Workers runtime: the purchase reached `settling`, the old exactly-one-row check rejected it, and settlement was blocked. The corrected fenced claim passes with the real D1/R2 bindings. The test fixture's `run()` now uses total changes like D1.

Local verification: 230 gateway tests pass, including official middleware with controlled facilitator outcomes and the bundled Worker in workerd; 21 Pages tests plus root utility self-tests pass; 32 release-acceptance tests pass; actual Dynamic Worker isolation and all 16 selected AWS-0568 planner combinations pass; both bundles build. Existing fault cases now exercise the official SDK rather than a mocked resource-server orchestrator. No dependency versions, schemas, catalog data, secret values or production resources changed. No funded transaction was performed.

This is implementation evidence, not deployment or a live payment claim. FIX-17/19 restoration is staged for review; their broader product/discovery reconciliation and the separate consolidation backlog remain open. Preserve FIX-02 recovery guarantees: prepared retries re-verify without re-executing; settled replay is free; pending/unknown transfers cannot be retried as new payments; receipt loss across both stores requires authoritative reconciliation. All existing FIX IDs and historical evidence below remain.


## Owner-directed payment boundary — October 24, 2026

The [standard x402 ownership decision](adr/0001-standard-x402-payment-ownership.md) governs further payment work: official Hono/x402 integration owns challenges, verification and settlement; Second Wind retains product discovery, sandbox trials, explicit component selection, selected-scope amounts, entitlements and authenticated recovery. [CONTEXT.md](../CONTEXT.md) defines maximum payment, trial, selected scope and final charge. No buyer-facing quote stage is introduced.

The bounded Wayfinder map is [Restore standard x402 ownership while preserving sandbox-selected purchases](https://github.com/Cirrefera/Second-Wind/issues/13). It records payment-restoration decisions under this tracker; it does not replace the build backlog.

[Pinned SDK research](X402_STANDARD_RAILS_RESEARCH.md) verifies official dynamic pricing and lifecycle hooks in `@x402/hono/core` 2.28.0. The completed [durable recovery mapping](X402_RECOVERY_MAPPING.md) specifies the narrow restoration: request-local Hono context, positive verification checks, explicit abort on failed claims, existing D1 ownership gates, SDK settlement, receipt persistence and an outer response finalizer. It also records prepared-replay expiry behavior and unresolved settlement/persistence limits. The next build work is implementation under FIX-17/19 using this mapping, with FIX-02 recovery guarantees preserved. This is a source-grounded handoff, not a tested or deployed restoration. No runtime change or test execution occurred in this planning follow-up.

Git history confirms that `409afcb` mounted official `@x402/hono` middleware, while `cc0a70b` replaced it with custom orchestration under a routing/recovery repair. The current implementation's test results remain historical evidence, not approval to retain that architectural replacement. FIX-17/19 must reconcile the standard payment integration with the original product experience; FIX-02's no-duplicate-charge and recovery guarantees must survive the correction. This decision does not reopen unrelated completed fixes or authorize deleting purchase history, blindly reverting later work, publishing products, or deploying changes.

## Verified consolidation checkpoint — October 23, 2026

**Source and production match `c0fb9cc2c6927a036e2d0193c3d505630c4c227a`. FIX-13 remains incomplete; its earlier missing-sink statement is superseded.** PR #11 is merged. [Production run 39986362848](https://github.com/Cirrefera/Second-Wind/actions/runs/39986362848) passed tests, builds, migrations and release acceptance. Gateway `3302125b-6658-4523-94ac-06edb36a191d` serves 100%; Pages deployment `639230c2-516c-4b90-b5cf-a75a9bea13d9` matches the same clean commit.

The owner clarified: **maximum payment → sandbox → chosen purchase or usage → final charge within the maximum; no buyer-facing quote stage.** The component implementation already separates `max_amount_atomic` from selected `amount_atomic`, requires a completed trial and explicit acceptance, and settles the selected amount. Existing `quote*` identifiers do not mean charge the maximum. Five existing scope tests passed. Other fixed-price paths and public quote terminology remain FIX-17/19 reconciliation work; general usage metering is not claimed.

Follow-up verification traces the existing Code Mode/Cap'n Web chain and confirms that ordinary product purchase cannot bypass component selection. `SW-EXEC` settles only after successful execution and replays its stored result without another charge. [PR verification run 40056053605](https://github.com/Cirrefera/Second-Wind/actions/runs/40056053605) passed 222 gateway, 21 legacy/Pages and 32 release-acceptance tests, actual Dynamic Worker checks and both builds. The [preservation contract](CONSOLIDATION_INVENTORY.md#code-mode-and-capn-web-verified-preservation-contract) records a specific FIX-13/14 mapping gap: events/projections omit the separately stored maximum. Do not infer it from a rounded selected amount, count acceptance as payment, or count settlement/receipt/entitlement events as three charges. Existing discovery describes trials but still mixes quote terminology; FIX-17/19 remains open.

[CONSOLIDATION_INVENTORY.md](CONSOLIDATION_INVENTORY.md), its [baseline](evidence/consolidation/baseline.json) and [569-entry field ledger](evidence/consolidation/field-ledger.csv) record the structural portion of plan Ticket 1: 21 D1 tables, 26 Iceberg schemas, four streams, 19 sinks, the running pipeline, source dependencies and duplicate candidates. Full Ticket 1 remains open for external consumers and protected record/object inventories. Every original field/definition is retained; no retirement or migration is authorized by this inventory.

- All three v1 sinks exist with 29/19/18 fields matching source. They are unconnected, their tables are absent from the listing, and `secondwind_contract_v1` is absent. Do not recreate them or infer credential usability/delivery from existence.
- The owner’s later consolidation plan governs the final schema and sink count. The prior additive three-sink design is a candidate, not a mandatory rollout.
- Outbox observation: 378 rows, zero pending. This establishes dispatch/backlog state only; FIX-14 same-event raw/analytical arrival remains open.
- Routing manifests, component releases and payload-object rows remain zero. Their implementations already exist.
- Completed FIX-01/02/03/05/06/28 remain completed. All 28 IDs and historical evidence remain. No product publication, inference enablement or production changes occurred.

Earlier checkpoints below are historical where resource state or payment wording differs. Use this checkpoint and the owner’s clarified payment meaning for subsequent work.

## Historical FIX-13 verification checkpoint — before sink provisioning

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

## Jev question-design correction — October 22, 2026

The owner asked us to assess the questions behind unsuccessful probability readings and repeated the instruction to use the TypeSafe skill. That audit now passes **60/60 fixed regression outcomes**, comprising **38/38 model-called cases** and **22/22 application-only cases**, in a complete saved run of **76 real API requests to `jev-1.14.0`**. See [JEV_QUESTION_AUDIT.md](JEV_QUESTION_AUDIT.md) for exact source/corpus hashes, typed answers, native receipts, rejected experiments, the intermediate 58/60 result, and the report-persistence repeat.

- A first Choice identifies one task/combined outcome, multiple independent tasks, topic discovery, or unknown. The next request asks an independent support Noul for each candidate using that meaning. Candidate Choice orders supported results.
- Ambiguity between known structures asks each applicable question and requires branch agreement. Topic readings preserve lexical browsing; uncertain task readings do not create new matches. The original excluded-deployment failure now returns `no_match`, and legitimate multi-product results survive.
- Existing probability boundaries and original labels are unchanged. The 60 examples are regressions, not independent holdout accuracy or production calibration. All **219 gateway tests** and both builds pass locally.
- **PRs #9 and #10 are merged and deployed as accepted application `d8541816a4242cdab1aaceea9dd2640edc19b676`.** The original production gate caught a late-response timeout defect before deployment; the follow-up closes timed-out chains permanently and reproduces the defect deterministically. [Production run 39880042324](https://github.com/Cirrefera/Second-Wind/actions/runs/39880042324), job `120174945506`, passed all checks and acceptance at **2026-10-23 00:46:36 UTC / October 22, 8:46:36 p.m. EDT**. Final reviewed/tested/released tree: `e21bb4ac165254b0892a3f62f4fbd855b4754e56`. Gateway: `876f2e07-c36a-4263-809e-b94d25daac49`; Pages: `00fbc388-cd26-4fcf-a54a-e1b41a825bce`.
- **FIX-07 and FIX-12 remain open** for truthful version-matched production coverage and remaining production semantic acceptance. Acceptance reports one live product and no funded-purchase verification. No inference flag, production Jev credential, or product activation was added. All in-scope application PRs are merged; only unrelated PR #1 remains open.

## Earlier Jev routing follow-up — October 22, 2026 (historical)

The owner requested the TypeSafe skill and real Jev API use, especially for structured routing. That evaluation is now performed: **49 successful requests to `jev-1.14.0`**, with native responses, provider request IDs, usage, source hashes, and fixed case labels preserved in [JEV_ROUTING_EVALUATION.md](JEV_ROUTING_EVALUATION.md) and its linked evidence.

- The unchanged 34-case corpus improved from **31/34 to 33/34** expected outcomes, with model calls reduced from **24 to 12**. All **12/12** fresh paraphrase cases passed. These are engineering regression results, not independently adjudicated production accuracy or threshold calibration.
- Exact lookups and supplied structured constraints stay in code. The resolver preserves other pending candidates after a relative preference, and explicitly requested live versions with absent/stale routing metadata report `routing_not_configured` even when another product has a valid record.
- A native Jev adapter and explicit `--jev-live` evaluation mode preserve actual model identity and typed Choice/Noul readings. All **198 gateway tests** and both application builds pass locally and in both GitHub runs.
- One original excluded-deployment case still returns a lexical match after an uncertain reading. The evidence retains that failure. **FIX-07 and FIX-12 remain open** for reviewed production manifest coverage and the remaining semantic fallback/calibration work. No runtime enablement or production Jev credential was added.

**[PR #8](https://github.com/Cirrefera/Second-Wind/pull/8) is merged and deployed.** Source commit `448daac64eb58ba70b46a884868e9bf98892d931` passed [verification run 39867861178](https://github.com/Cirrefera/Second-Wind/actions/runs/39867861178). Application release `dadca82c5cf43ef6be0ebb62b3553e41b46198b8` passed [production run 39868083324](https://github.com/Cirrefera/Second-Wind/actions/runs/39868083324) and acceptance at **22:53:39 UTC / 6:53:39 p.m. EDT**. Local, published, CI, and released trees all match `3f69ab4ea93f37d3270a5ccfc8ea1576925aeb01`. Gateway: `7bd4c4bf-8f77-45e9-af17-9428bf95419c`; Pages: `6c883a05-6f82-479b-8d8b-77b582791ecc`. Acceptance reports one live product and no funded-purchase verification.

This follow-up started from consolidated main `c8b8991393ba3a304adb44726dabe5f57b6551ca`. The [evaluation report](JEV_ROUTING_EVALUATION.md) preserves source, API, CI, and acceptance evidence. The earlier consolidation record below retains its original source identity.

## Earlier consolidated result — October 22, 2026

**The remaining in-scope application work is merged into one `main` and deployed.** The owner explicitly authorized consolidation and merge. That authorization supersedes the earlier draft/merge-approval notes preserved below as historical evidence.

- PR #5 and all PR #7 commits are merged. Release commit: `548bcc204d59785951da11e85943607d5e62d9fd`; integration head: `57636d4c84e0a9a96ed078d86413d4e526447106`; identical reviewed/merged tree: `6c5cd346c5f5e491973da1e68294c11d63de78ca`.
- [Combined-head PR verification](https://github.com/Cirrefera/Second-Wind/actions/runs/39858026572) and [production deployment/acceptance](https://github.com/Cirrefera/Second-Wind/actions/runs/39858195268) both succeeded. Production acceptance returned `accepted: true` at **2026-10-22 21:33:58 UTC (5:33:58 p.m. EDT)** for that exact merge.
- Gateway version: `b761dab0-61e2-4549-ae59-8d0003cef876`. Pages deployment: `b6fb9357-1f1c-4064-9617-5eb04424e26e`. `/health` and `/api/proof` return 200; readiness is `ready` with the independently verified existing recipient.
- Live inventory remains **one product**, SW-PT-0006 v1, 100,000 atomic USDC units ($0.10), hash `62a28a512af90491310989a0cef85afdd6f4e53cddddd4b43cff6b5eb975abbe`. No candidate was activated and no funded purchase was performed.
- **COMPLETE:** FIX-01, FIX-02, FIX-03, FIX-05, FIX-06, FIX-28. **BLOCKED on external administrative configuration:** FIX-04. **READY for remaining work:** FIX-07 through FIX-27, excluding the completed IDs above. All 28 stable IDs remain below.
- FIX-07 has a deployed compatibility repair: free-text lookup still finds the live product; structured intent truthfully returns `routing_not_configured` until reviewed version-matched routing records exist. Full structured-routing acceptance remains open.
- Source product trials, scope selection, R2 delivery, release preparation, routing, and journey events are now consolidated with the accepted payment/recovery controls. Their presence in the release does not activate draft products or establish live telemetry sink verification.
- Four older owner fix branches already had no unique commits outside main. The temporary audit workflow and PR #1's unrelated third-party README advertisement were excluded. The only remaining open PR at final inventory was PR #1; no owner application PR remains outstanding.

See [CONSOLIDATION_STATUS.md](CONSOLIDATION_STATUS.md) for the complete consolidation evidence and practical remaining work. The next queued three IDs are **FIX-07, FIX-08, FIX-13**. The original assembled-payload definition is settled; do not request that policy decision or the already supplied recipient again.

## Batch 02 result before consolidation (historical)

Selected IDs: **FIX-04, FIX-05, FIX-06**. Branch: `fix/batch-02-release-controls-content-review`. Review: [draft PR #7](https://github.com/Cirrefera/Second-Wind/pull/7).

- **FIX-04 — BLOCKED on external configuration and release:** the PR verification and production-job controls are implemented and locally verified in `42494048f132f11b53640ddae0d2590f56e7c844`, tree `d65328ab304039f75932118b992930fd530fe4d2`. The exact branch/environment/credential configuration is prepared in [FIX04_RELEASE_CONTROLS.md](FIX04_RELEASE_CONTROLS.md); it has not been applied.
- **FIX-05 — READY_FOR_RELEASE; owner policy clarified:** Second Wind sells original assembled payloads made by selecting, combining, structuring, and adapting publicly sourced material. The earlier A/B choice was incorrect and is superseded. README, SPEC, [FIX05_CONTENT_POLICY_REVIEW.md](FIX05_CONTENT_POLICY_REVIEW.md), and this handoff now reflect that definition. Existing contribution/product-review and provenance/license checks support it; actual trusted publication rollout remains FIX-08. No further owner policy input is required.
- **FIX-06 — COMPLETE as a verification/assessment:** exact draft head `8711cdcf2dc31b16dc599da6db7cd0afd783a537` passes all 146 gateway tests and the additional offline product checks. It has no exact-head GitHub CI evidence and has two demonstrated content conflicts against main. [FIX06_PR5_VERIFICATION.md](FIX06_PR5_VERIFICATION.md) records reproducible results. Completion does not mean PR #5 is merge-ready.
- **FIX-28 — new, READY:** the demonstrated draft/main integration conflict is a separate bounded implementation item. It was recorded, not implemented as a fourth item.
- Main was rechecked at `a853b9edbdb00be21b7ba157e7deb3ed36782643`. Production remains accepted application release `048f08853e863391cf8652cafdd464140e810616`; the read-only public check at 1:24 p.m. EDT confirmed the same gateway version. No batch-02 merge, deployment, settings change, product publication, or funded purchase has occurred.

All FIX-01 through FIX-28 entries remain visible. FIX-01–03 retain their completed release acceptance. Apart from the selected items and newly recorded integration item, the backlog remains queued; historical evidence has not been relabeled as fresh verification.

## Previous released application result (batch 01, historical)

**FIX-01, FIX-02, and FIX-03 are COMPLETE.** The owner confirmed the GitHub recipient secret and explicitly authorized merging and deploying PR #6. PR #6 merged at `2026-10-22T16:44:30Z`; GitHub deployed and accepted release `048f08853e863391cf8652cafdd464140e810616` at approximately **12:45 p.m. EDT on October 22, 2026**.

- Merged PR: https://github.com/Cirrefera/Second-Wind/pull/6
- Release commit: `048f08853e863391cf8652cafdd464140e810616`.
- Successful GitHub deployment/acceptance run: https://github.com/Cirrefera/Second-Wind/actions/runs/39816488828
- Gateway version: `0187ab0f-9daa-4eb2-b1dd-0fb2d19e1936`, receiving 100% of traffic in deployment `35d5a442-c123-421d-9e8d-7125d092fe49`.
- Pages production deployment: `71cbb351-482d-42d8-be44-1f69497dcbcd`.
- Release acceptance returned `accepted: true`, the exact release commit, matching gateway/Pages identities, and one live product. Readiness and discovery agree with the owner-designated Base USDC recipient.
- Funded-purchase verification remains `false`; no purchase or funds transfer was performed. No new product was published. FIX-16 still owns broader unknown-settlement reconciliation.
- This completion record changes only the tracker. It does not change the released application, tests, configuration, or deployment workflow.

## Batch 01 control and source identity (historical)

- Selected IDs for batch 01: **FIX-01, FIX-02, FIX-03**. No fourth implementation item is authorized in this run.
- Working branch: `fix/batch-01-payment-recovery-release`.
- Published implementation commit: `248fb4d70db4afbc2b53313096d3121eef5ab54e`; verified tree: `32584acbfde5159db13078142d0ae0fd9a3685ae`. The local staged tree exactly matched the GitHub tree before the commit was created.
- Merged PR: https://github.com/Cirrefera/Second-Wind/pull/6. Approved head `929b46464558457f5ffc8dbcc3db5149d2913d04` merged as `048f08853e863391cf8652cafdd464140e810616`. The merge tree exactly matched the approved head; only tracker metadata differs from the original locally tested implementation commit. GitHub reran the full checks on the merge commit.
- Starting main and observed production commit: `82fe671add6468176134a344d38d2cbc3686b90e`.
- Separate draft PR #5: `feat/proportional-product-scope` at `8711cdcf2dc31b16dc599da6db7cd0afd783a537`.
- All fetched branches were checked for an existing canonical tracker/handoff and repository AGENTS.md; none was present. Starting checkout was clean.
- Pre-release production observation: `/health` 200 on version `f25ead1b-a5fe-461d-88d2-b5d8cca91dcd` and baseline commit; `/api/proof` 503; discovery unconfigured with empty accepts. The accepted release above supersedes that observation.
- The owner supplied the intended Base-mainnet recipient, both recipient secrets were staged in version `8d7a1ddb-ee2c-472a-b744-cc9be36f7d7a`, and the owner then confirmed the GitHub secret and authorized merge/deployment. GitHub deployed the tested application and inherited the approved recipient configuration. No funded canary or product publication was performed; the existing idempotent migration scripts reported zero rows read/written.
- Baseline local checks on Node v24.19.0: 54/54 gateway tests, 21/21 actual Pages ingress tests, and 55 legacy utility assertions passed. Both locked dependency installs used `npm ci --ignore-scripts --no-audit --no-fund`.
- Reviewed historical reports: `secondwind-repository-review-2026-10-22.md`, `secondwind-repository-evidence-2026-10-22.json`, `secondwindai-com-audit-2026-10-22.md`, `secondwindai-com-evidence-2026-10-22.json`. Historical claims for unselected items remain pending revalidation.

## Status and priority rules

`READY`: actionable/not started. `IN_PROGRESS`: selected in this batch. `READY_FOR_RELEASE`: implemented and locally verified, with merge/deployment/production acceptance pending. `BLOCKED`: a named dependency/input/authorization prevents further progress. `COMPLETE`: stated acceptance satisfied with evidence. `NOT_APPLICABLE`: current evidence proves no change is required.

P0: current batch release/payment blockers. P1: next release, commerce integrity, and operational integrity prerequisites. P2: bounded catalog, documentation, or domain follow-up. Same-priority actionable items are ordered by ID. Owner decisions may block final enforcement while evidence gathering and concrete preparation remain actionable. Never change a status merely because a historical report says work is done.

## Complete backlog

### FIX-01 — Correct payment configuration and readiness

- Priority: **P0**
- Status: **COMPLETE**
- Evidence: The owner supplied the intended recipient independently of the old encrypted setting. The accepted production release reports ready/configured/verified and usable Base USDC discovery with the intended recipient. Both recipient bindings and the facilitator binding are present on the active version. Existing secret values were not retrieved.
- Dependencies: Owner input, matching GitHub release input, staged Worker correction, merge/deployment authorization, and production acceptance are satisfied.
- Acceptance criteria: configuration and readiness checks accurately distinguish valid, invalid, and independently verified recipients; discovery publishes usable intended payment requirements; production acceptance is recorded separately from local tests. Do not execute a funded canary without authorization.
- Implementation location: `workers/gateway/src/contracts.js`, `workers/gateway/src/index.js`, `workers/gateway/src/discovery.js`, `workers/gateway/wrangler.toml`, `workers/gateway/tests/recipient.test.mjs`, `workers/gateway/README.md`.
- Verification: New quote and payable-discovery creation require a valid non-burn recipient matching the independently supplied expectation. Diagnostics contain fixed codes only. Targeted recipient + HTTP suite: 21/21 pass. Combined gateway suite: 76/76 pass locally and again in GitHub. Paid recovery/replay stays available after verification configuration loss. The supplied address passes strict viem/EIP-55 and application checks. Before release, configuration staging preserved the old code and active deployment. The subsequent accepted release and independent public checks report configured=true, verified=true, status=verified with the intended recipient on eip155:8453; authenticated checks confirm the new source version and preserved unrelated bindings.
- Release state: Merged and deployed through GitHub in `048f08853e863391cf8652cafdd464140e810616`; postdeployment acceptance passed on gateway `0187ab0f-9daa-4eb2-b1dd-0fb2d19e1936` and Pages `71cbb351-482d-42d8-be44-1f69497dcbcd`. The approved settings were inherited from the staged version into the new code release. No funded purchase was performed.
- Remaining blocker: None for this item's stated acceptance. The exact defect in the previous unreadable encrypted value remains a historical unknown; it was replaced with the independently supplied approved value. Configuration verification is not proof of a funded transaction.

Original bounded scope:

The audit observed /api/proof returning 503 with both payment_recipient_configured and payment_recipient_verified false. Discovery reported payment_configured false and an empty accepts array.

Identify the actual validation failure without exposing secrets. Correct the application’s configuration validation and deployment requirements where necessary. Use only an independently verified merchant recipient. If that recipient or permission to change configuration is unavailable, prepare the exact correction and mark the production step blocked.

### FIX-02 — Recover interrupted pre-settlement purchases

- Priority: **P0**
- Status: **COMPLETE**
- Evidence: The pre-batch source stranded prepared purchases after a prepared-to-settling write failure. The released fix passes the real SQLite fault/race regressions, including one execution and one settlement after safe prepared-state recovery. PR #5 remains separate and was not merged.
- Dependencies: Durable ownership/state fencing; preserve existing private recovery credentials and settlement uncertainty rules.
- Acceptance criteria: fault-injection tests demonstrate recovery after the database fault disappears, with no endless retry loop, repeated side effects, or extra settlement calls.
- Implementation location: `workers/gateway/src/commerce.js`; `workers/gateway/tests/interrupted-purchase.test.mjs`.
- Verification: 11 new fault/race regressions pass within 76/76 combined gateway tests. Injected failures before/after prepared and settling writes, initial claim acknowledgement loss, concurrent original/resumed calls, private-token failures, stale cleanup racing settlement, and late execution writes. Saved prepared results resume with one execution and one settlement; repeated retries do not settle again. No schema change.
- Release state: Included in the merged, deployed, accepted release `048f08853e863391cf8652cafdd464140e810616`. The 76 gateway tests, including all 11 new fault/race regressions, passed again in GitHub Actions before deployment. No production fault injection or funded settlement was performed.
- Remaining blocker: None for this item's stated acceptance. If a settling claim commits but acknowledgement and readback are unavailable, later invocations remain settlement_pending_recovery and require trustworthy reconciliation (FIX-16), rather than guessing that no money moved.

Original bounded scope:

A transient database failure during the prepared-to-settling transition can leave a purchase permanently prepared. Retries then return payment_in_progress indefinitely.

Implement a bounded recovery or explicit terminal-outcome path using durable ownership and state checks. Preserve prepared results and prevent duplicate execution or settlement. Treat settling and uncertain states separately.

### FIX-03 — Add production release acceptance checks

- Priority: **P0**
- Status: **COMPLETE**
- Evidence: GitHub run `39816488828` ran release-input preflight before mutations, deployed the gateway and Pages, and then passed the new production acceptance step for exact commit `048f08853e863391cf8652cafdd464140e810616`.
- Dependencies: FIX-01 readiness, owner-designated expected recipient, and Cloudflare API access were exercised successfully by the release workflow.
- Acceptance criteria: incorrect deployment identity, degraded readiness, or unavailable payment configuration causes acceptance to fail. Local workflow verification must not be represented as a completed production deployment.
- Implementation location: `.github/workflows/deploy.yml`; `scripts/release-acceptance.mjs`; `scripts/release-acceptance.test.mjs`; root `package.json`.
- Verification: All 32 offline release-acceptance tests passed locally and again in GitHub Actions. They reject wrong Pages/gateway commit, failed/degraded readiness, mismatched gateway versions, missing dependencies, unavailable discovery, and wrong recipient/network/asset/amount. Both builds passed. The production checker then returned accepted=true for the exact release and both deployment identities.
- Release state: Merged, deployed, and exercised successfully in the authorized GitHub release. Preflight preceded mutations; read-only acceptance followed both deployments. No quote/purchase, funds transfer, or automatic rollback was performed.
- Remaining blocker: None for this item's stated acceptance. Broader PR checks and production branch/environment enforcement remain FIX-04.

Original bounded scope:

The deployment workflow ends after uploading Pages and does not verify the live domain.

Add checks for expected deployment identity, /health, /api/proof, and payment discovery after both deployments. Make configuration failure visible as failed release acceptance. Use existing safe discovery endpoints; do not create production purchases merely to perform a smoke check.

### FIX-04 — Enforce PR verification and production release boundaries

- Priority: **P1**
- Status: **BLOCKED**
- Evidence: PR verification and main-only production workflow controls are merged and deployed in `548bcc204d59785951da11e85943607d5e62d9fd`. Post-merge main still reports `protected: false`; rulesets are empty. The automatically created `production` environment has no protection rules or deployment branch policy. Credential scoping has not been independently confirmed.
- Dependencies: The owner authorized consolidation/merge, and exact-commit production acceptance succeeded. The remaining dependency is an administrative surface capable of applying/readback of repository protections, environment branch policy, and credential scope; the current connector has no such write operations.
- Acceptance criteria: the intended checks run before merge, required protections are documented and applied when authorized, and production deployment is constrained to the approved release path. YAML alone is not evidence of externally enforced protection.
- Implementation location: `.github/workflows/verify.yml`; `.github/workflows/deploy.yml`; `docs/FIX04_RELEASE_CONTROLS.md`.
- Verification: Combined-head CI and production release both passed 174 gateway tests, 32 release tests, 21 Pages tests, 55 utility assertions, all 16 actual Dynamic Worker packages, and both builds. Workflow lint passed. External settings remain explicitly unfulfilled.
- Release state: Source controls are merged and deployed. Exact release evidence is in docs/CONSOLIDATION_STATUS.md; no further merge authorization is needed for this completed consolidation.
- Remaining blocker: Apply/read back the prepared external main/environment protections and environment credential scope. Source workflow conditions alone do not enforce repository administration settings.

Original bounded scope:

The audit found unprotected main, no required status checks, no repository rulesets, and no PR verification trigger in the reviewed main workflow.

Add appropriate PR verification, required checks, and production branch/environment restrictions. Ensure manual workflow dispatch cannot inadvertently deploy an unintended branch to production.

### FIX-05 — Define original assembled payloads and their source provenance

- Priority: **P1**
- Status: **COMPLETE**
- Evidence: The owner clarified on October 22 that publicly sourced information is combined in an original manner to form the product's original content. The original contribution is the useful selection, synthesis, arrangement, adaptation, and integration embodied in the assembled payload. Public source inputs are compatible with this model. Prior public-byte/hash observations are retained as distribution evidence, not a finding that source provenance invalidates originality.
- Dependencies: Owner product-policy input and documentation merge are satisfied. Genuine trusted publication and per-product approvals remain FIX-08/10/11.
- Acceptance criteria: Product documentation and publication-review guidance consistently define the original assembled payload; source provenance and applicable attribution/license requirements are recorded separately; the existing release checks require a described and reviewed original contribution; existing bought versions remain intact. No secrecy choice or owner policy reconfirmation is required.
- Implementation location: `README.md`; `SPEC.md`; `docs/FIX05_CONTENT_POLICY_REVIEW.md`; tracker and continuation prompt. Runtime/schema changes are unnecessary for this clarification; existing publication.js and draft release-preparation.js contain the relevant contribution/review fields.
- Verification: Source inspection confirms nonempty `original_contribution`, manifest-bound product/contract review hashes, and separate origin/license evidence. Existing publication tests cover absent contribution, absent product review, and changed contribution without renewed review. Independent review confirms no privacy or originality-scoring mechanism is needed. Documentation consistency and diff checks pass. Main contains the validator/tests; its production activation integration is not claimed complete.
- Release state: The owner-defined original assembled-payload policy is merged through PR #5, including all PR #7 commits, in `548bcc204d59785951da11e85943607d5e62d9fd`. Existing product versions and public history remain intact.
- Remaining blocker: None for this policy/documentation item. Product publication and trusted review verification retain their existing FIX-08/10/11 scope.

Clarified bounded scope:

Second Wind combines publicly sourced material into original, useful assembled payloads. State that model in product documentation and the existing original-contribution review contract. Keep source provenance, the original composition of the finished product, and where the finished bytes have been published as separate facts. Do not redefine the product as delivery services alone or require private source material to describe its original contribution.

### FIX-06 — Verify the exact current head of draft PR #5

- Priority: **P1**
- Status: **COMPLETE**
- Evidence: Fresh connector/local refs agree on open draft head `8711cdcf2dc31b16dc599da6db7cd0afd783a537`, tree `f7aebfa09422e061fba558a817af258c9ba08c06`. Existing offline verification was reproduced in an isolated checkout. GitHub exact-head workflow-run/status/check-run queries returned no checks. A read-only merge-tree against main `a853b9edbdb00be21b7ba157e7deb3ed36782643` demonstrates commerce.js and discovery.js conflicts.
- Dependencies: Exact-head reproduction and accepted-release comparison are satisfied. Actual integration is separately queued as FIX-28; product routing/publication prerequisites remain their existing items.
- Acceptance criteria: an exact-commit verification record and a clear merge/release readiness assessment exist. Do not merge automatically.
- Implementation location: `docs/FIX06_PR5_VERIFICATION.md`; exact draft tests/scripts/review inputs were inspected and executed without editing PR #5.
- Verification: 146/146 gateway tests, 55 utility assertions, 21/21 Pages tests, both builds, all 16 actual local Dynamic Worker feature selections, 32 plans/160 AWS input shapes/64 partial output shapes, Powertools 7/7, deterministic and scripted routing 34/34 each, reproducible source preparations. The planner test command reports 11 executions with four repeated imported tests; the report avoids claiming 11 distinct cases. No live inference/AWS/deployment/payment calls.
- Release state: The original exact-head assessment remains complete as historical evidence. Its integration findings were resolved by FIX-28; PR #5 and PR #7 are now merged and the combined source is accepted in production.
- Remaining blocker: None for this assessment. Current combined-source/CI/deployment evidence is in docs/CONSOLIDATION_STATUS.md. Product, routing, and telemetry readiness remain their explicit backlog items.

Original bounded scope:

The draft contains substantial functionality that is separate from deployed main. Its reported local test results must not be treated as current-head CI evidence.

Reproduce the relevant checks on the exact current head, compare it with production, and identify integration or release blockers. Record newly discovered defects as separate backlog IDs rather than silently expanding this item.

### FIX-07 — Satisfy the structured resolver’s routing prerequisites

- Priority: **P1**
- Status: **READY**
- Evidence: Migration 0004 and the resolver are deployed. A real post-consolidation string query for lambda finds SW-PT-0006 v1. A structured SKU/language intent returns HTTP 503 routing_not_configured with version_matched_routing_manifest_missing. The Jev follow-up adds the same truthful result for an explicitly requested live version in a partially reviewed catalog. No routing record was fabricated or registered.
- Dependencies: The merged resolver and completed FIX-06/28 provide the source baseline. Full structured matching still requires reviewed manifests bound to intended live product versions.
- Acceptance criteria: representative supported queries find the intended products after the proposed rollout, and missing or incompatible configurations produce truthful responses.
- Implementation location: workers/gateway/src/routing.js; migrations/0004_routing_manifests.sql; existing live product routing registration; docs/JEV_ROUTING_EVALUATION.md
- Verification: The subsequent question-design audit passes 219 gateway tests and 60/60 fixed live-evaluation outcomes, including 38/38 model-called cases; see JEV_QUESTION_AUDIT.md. Missing/stale and partial manifest coverage, exact-lookup bypass, pending alternatives, and HTTP/capability agreement remain covered. Disposable draft-v2 projections do not establish live-v1 coverage. Actual custom-domain free lookup passed after consolidation.
- Release state: The metadata-search compatibility path and bounded resolver corrections are deployed in accepted release dadca82c5cf43ef6be0ebb62b3553e41b46198b8. Production manifest registration/coverage remains incomplete. See docs/JEV_ROUTING_EVALUATION.md for release evidence.
- Remaining blocker: Prepare/review/register truthful version-matched routing manifests and consistent release/configuration contracts, then verify representative production structured queries and release coverage. The v2 record cannot be relabeled as the different live v1 payload.

Original bounded scope:

The draft resolver depends on version-matched records in product_routing_manifests, while its migration creates an empty table.

Ensure reviewed manifests exist for intended live products before switching the resolver, or implement a deliberate, documented compatibility strategy. Add a release prerequisite that detects missing routing records.

### FIX-08 — Enforce trusted publication and immutable release registration

- Priority: **P1**
- Status: **READY**
- Evidence: Preparation, staging, activation, payload verification, and immutable registration code are now merged. Matching evidence hashes still do not independently authenticate a reviewer or publication approval.
- Dependencies: FIX-06; genuine authenticated reviews, immutable payload evidence, and authorization before production registration/activation.
- Acceptance criteria: unreviewed or inconsistent releases cannot become live; existing bought versions remain deliverable; buyer-supplied data cannot manufacture publication approval. Distinguish evidence hashes from independently authenticated human or organizational approvals.
- Implementation location: workers/gateway/src/publication.js and release-preparation.js, their tests, and the actual trusted operator publication path
- Verification: Integrated preparation/staging/immutability regressions passed and both real source preparations reproduced. Genuine production review authentication and actual controlled publication remain unverified.
- Release state: Publication implementation is part of the consolidated source. No draft product registration or activation was performed by the merge/deployment.
- Remaining blocker: Verify and enforce genuine trusted review authority and the actual operator-controlled publication path before activating products.

Original bounded scope:

Validate the actual publication path, including preparation, staging, activation, payload verification, review evidence, version identity, and atomic registration.

### FIX-09 — Establish the complete per-product readiness backlog

- Priority: **P2**
- Status: **READY**
- Evidence: Historical inventory is 157 records and not a current snapshot. No new per-SKU child IDs created without evidence in this batch.
- Dependencies: Current authorized inventory/source metadata access; preserve historical snapshots as historical.
- Acceptance criteria: every intended product has an evidence-backed status and a specific remaining work item. Do not promote drafts in bulk.
- Implementation location: workers/gateway/review/corpus-source-inspection.json in PR #5; per-SKU tracker children to create
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Reconcile the current inventory with available source, payloads, contracts, reviews, and publication state. Historical exports are evidence, not a current database snapshot.

Create explicit child backlog entries for each unfinished SKU or release. Each child must have a bounded deliverable and acceptance criteria. Do not hide the construction of an entire catalog inside one item.

### FIX-10 — Finish the AWS-0568 candidate’s release prerequisites

- Priority: **P2**
- Status: **READY**
- Evidence: The actual AWS-0568 v2 source preparation reproduced with payload hash `57ce8e7d4e78fdb24d7bd6c3327ce4ea9eb95912af8ed32f666ebb6f914e5d10`. The release is source-ready; commercial component allocation and genuine review inputs still block publication.
- Dependencies: FIX-08; owner-supplied component allocation and genuine product/source/language/publication reviews.
- Acceptance criteria: required product inputs and genuine approvals are present, exact deliverable bytes are verified, and staging/activation status is accurately recorded. Do not invent missing component prices or approve the product yourself.
- Implementation location: products/agent-state-dynamodb-manifest and workers/gateway/review evidence on consolidated main
- Verification: All 16 actual Dynamic Worker packages and independent JavaScript/Python planner selections passed. Source-preparation evidence reproduced byte-for-byte; no AWS API call was made.
- Release state: Source package and preparation path are merged; candidate remains unpublished.
- Remaining blocker: Complete the existing component allocation and genuine product/source/language/publication reviews under FIX-08 before authorized activation.

Original bounded scope:

Review the actual prepared package, supported languages, component dependencies, commercial allocation, validation evidence, and publication requirements.

### FIX-11 — Finish the SW-PT-0006 replacement candidate’s release prerequisites

- Priority: **P2**
- Status: **READY**
- Evidence: The actual SW-PT-0006 v2 source preparation reproduced with payload hash `80a57963f64ae52ab0f75ad9b58bbab737db9891b13d7a87961f0b5947239fbf`. Existing live v1 metadata/hash/price remained unchanged after deployment.
- Dependencies: FIX-08; genuine source/license/contract/validation/publication review; retain v1 buyer access.
- Acceptance criteria: the new release meets its declared contract and review requirements while historical purchases continue to resolve to the correct version. Do not equate source readiness with publication approval.
- Implementation location: products/lambda-powertools-idempotency and its historical release records on consolidated main
- Verification: Integrated tests confirm source preparation, staged v2 bytes, immutable registration, and preserved v1 delivery. Preparation evidence reproduced byte-for-byte; the live catalog still advertises v1.
- Release state: Replacement source is merged; v2 is not activated.
- Remaining blocker: Complete genuine source/license/contract/validation/publication review and controlled activation while retaining v1 purchased access.

Original bounded scope:

Review the corrected guidance, actual example, supported versions, source/license evidence, validation, and historical-version preservation.

### FIX-12 — Validate optional System One routing before enabling it

- Priority: **P2**
- Status: **READY**
- Evidence: Owner direction to use the TypeSafe skill and Jev API is satisfied. The subsequent question-design audit uses request-structure Choice, independent per-candidate Nouls, and code-owned consensus. Its final complete run passes 60/60 outcomes with 76 native HTTP 200 receipts. JEV_QUESTION_AUDIT.md preserves all experiments and the original failure's correction. Optional production assistance remains disabled.
- Dependencies: Owner direction, real API evaluation, and the observed question/composition correction are satisfied. Remaining dependencies are reviewed production routing coverage and acceptance/calibration for unseen requests, unknown structures, and provider fallback before enablement.
- Acceptance criteria: deterministic and fixture results are reproducible; actual model evidence, uncertainty, fallback behavior, and limits are documented. Keep live assistance disabled until production coverage and semantic acceptance are met.
- Implementation location: workers/gateway/src/routing.js, clef.js, jev.js; workers/gateway/scripts/evaluate-routing.mjs and evaluate-jev-question-plan.mjs; routing fixtures and docs/JEV_QUESTION_AUDIT.md.
- Verification: Original 34/34, paraphrases 12/12, question regressions 8/8, and six additional cases 6/6 pass in the final complete live run. This comprises 38 model-called cases and 22 application-only cases. All 219 gateway tests and both builds pass. Mocked tests do not measure model quality; original labels and provisional probability bands are unchanged. Previously inspected cases are reported as regressions, not new holdouts.
- Release state: PRs #9 and #10 are merged; combined application d8541816a4242cdab1aaceea9dd2640edc19b676 is accepted in production. Exact source/test/release tree e21bb4ac165254b0892a3f62f4fbd855b4754e56 passed verification run 39879914304 and production run 39880042324. The initial stopped production attempt and subsequent timeout lifecycle correction remain documented. No production enabling flag, model credential, or new binding was added.
- Remaining blocker: FIX-07's truthful production routing coverage and validation/calibration for production request combinations, unknown structure, and unavailable-provider fallback. The original excluded-deployment regression is resolved; do not carry that specific failure forward as still open or infer universal semantic readiness from this bounded corpus.

Original bounded scope:

Keep deterministic compatibility checks authoritative. Verify typed responses, fallback behavior, bounded candidate scope, and the treatment of uncertain or unavailable model output.

### FIX-13 — Align telemetry projections with the current event contract

- Priority: **P1**
- Status: **IN PROGRESS — source deployed; three sinks provisioned; canonical mapping and delivery acceptance pending**
- Evidence: Current event names/amount fields differ from legacy projections. Three v1 sinks exist with source-matching schemas; no v1 pipeline/table delivery is established.
- Dependencies: Complete the owner’s consolidation mapping, preserve historical/raw coverage, confirm consumers and usable ingestion credentials, then validate the selected design. Do not recreate existing sinks.
- Acceptance criteria: current payment/receipt events appear in intended projections with correct amounts, IDs and network; maximum and final-charge semantics remain distinct.
- Implementation location: workers/gateway/src/telemetry.js; telemetry declarations; CONSOLIDATION_INVENTORY.md and its field ledger.
- Verification: PR #11 merged in c0fb9cc; production run 39986362848 passed. Live sink fields match 29/19/18 declarations. Pipeline planning, materialization and exact-event arrival remain pending.
- Release state: Application deployed. Declarative source does not establish external rollout or downstream delivery.
- Remaining work: Ticket 1 consumer/record coverage, Ticket 2 semantics/target design, Ticket 3 rehearsal/trace. The prior credential blocker is historical, not reasserted as current without evidence.

Original bounded scope:

The audit found payment.settled versus payment.settle and exact_amount_atomic versus older price/amount fields.

Update or version the specialized projections to match the actual emitter. Preserve raw history and exact atomic amounts.

### FIX-14 — Verify outbox delivery, deduplication, capacity, and alerts

- Priority: **P1**
- Status: **READY**
- Evidence: Audit observes at-least-once dispatch and a 20-event-per-minute limit; ingestion acknowledgement is not sink verification.
- Dependencies: FIX-13 for specialized projection acceptance; authorized same-event-ID sink inspection and operational ownership.
- Acceptance criteria: delivery evidence exists, duplicate events do not inflate business metrics, and operational alerts identify stuck or failing dispatch. An ingestion acknowledgement alone does not count as sink verification.
- Implementation location: D1 business_event_outbox; telemetry dispatch; ingestion/raw/specialized sinks
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Trace the same event ID from the D1 outbox through ingestion to the raw and specialized tables. Check backlog age, retries, failed dispatches, and throughput against actual needs.

### FIX-15 — Prevent recovery-challenge slot interference

- Priority: **P1**
- Status: **IMPLEMENTED IN DRAFT PR #16; NOT DEPLOYED**
- Evidence: The five-outstanding-challenge rejection is removed. Issuance reuses an active challenge; concurrent requests use the same ID within the recovery generation and time window.
- Preserved boundaries: payer-wallet proof, expiry, one-time use and retained-token recovery. Successful rotation consumes outstanding challenges.
- Implementation location: `workers/gateway/src/commerce.js`.
- Verification: Source review; no new test execution at the owner's direction.
- Remaining boundary: Merge and deployment have not occurred; production recovery is not claimed verified.

### FIX-16 — Establish safe reconciliation for unknown settlement outcomes

- Priority: **P1**
- Status: **IMPLEMENTED IN DRAFT PR #16; NOT DEPLOYED**
- Evidence: Authenticated HTTP and Cap'n Web actions share the existing D1/R2 recovery path. When neither store has a receipt, a read-only Base client checks the finalized original transaction against the original authorization key, payer, recipient, native USDC and amount before repairing entitlement records.
- Preserved boundaries: no transfer submission, no repeat settlement, no unproven delivery, no changed purchase scope. Stored receipt repair remains available.
- Implementation location: `workers/gateway/src/reconciliation.js`, `commerce.js`, `index.js`, `product-service.js`; gateway README recovery instructions.
- Verification: Source review and Worker compilation; no new test execution or funded payment at the owner's direction.
- Remaining boundaries: Buyer must supply the original transaction hash if absent from storage. Trusted Base RPC availability and finality are required. An unresolved outcome remains pending. Merge and deployment have not occurred; production recovery is not claimed verified.

### FIX-17 — Complete the machine-readable API contract

- Priority: **P2**
- Status: **READY**
- Evidence: Audit identifies missing operations/schemas and unsupported completeness claim. This batch changes only payment readiness/discovery gating.
- Dependencies: Actual deployed/draft route contract and intended release scope.
- Acceptance criteria: intended public operations and their meaningful schemas are represented and checked against implementation. Remove any unsupported claim that the document is complete.
- Implementation location: workers/gateway/src/discovery.js OpenAPI generator; HTTP/Cap’n Web contract
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Reconcile OpenAPI with actual routes, methods, inputs, outputs, authentication, errors, recovery behavior, and artifact delivery.

### FIX-18 — Resolve x402 extension and discovery claims

- Priority: **P2**
- Status: **READY**
- Evidence: Audit challenge lacks Bazaar/payment-identifier extensions claimed in README. External indexing is a separate verification question.
- Dependencies: Current primary x402 extension specifications and an explicit choice to implement extensions or correct claims.
- Acceptance criteria: emitted behavior and documentation agree. Keep core x402 transport, optional extensions, and external Bazaar indexing as separate verification questions.
- Implementation location: README.md; actual gateway challenge generation; x402 discovery
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

The active gateway challenge did not advertise the Bazaar or payment-identifier extensions claimed in the root README.

Either implement the intended extensions in the active path and validate them against current primary specifications, or correct the claims. Preserve existing application-level idempotency.

### FIX-19 — Reconcile architecture, pricing, and product documentation

- Priority: **P2**
- Status: **READY**
- Evidence: Audit reports architecture/recovery/redistribution drift and $1 documented ceiling versus $10 validators. Historical transactions remain immutable.
- Dependencies: Owner-defined original assembled-payload policy recorded in FIX-05 and current implementation contract; other commercial terms are outside this clarification.
- Acceptance criteria: one authoritative contract matches the application and the chosen commercial policy. Do not change historical quotes, receipts, or purchased prices to resolve a documentation mismatch.
- Implementation location: README.md; SPEC.md; gateway documentation and validators
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Update stale descriptions of Pages Functions, the old payment gatekeeper, recovery behavior, source redistribution, and price limits. Reconcile the documented $1 ceiling with validators that permitted up to $10.

### FIX-20 — Synchronize the manual deployment and rollback runbook

- Priority: **P2**
- Status: **READY**
- Evidence: Audit manual instructions omit migration 0002 and commit tag. This batch documents only the selected fixes and their release blockers.
- Dependencies: Approved workflow including FIX-03 and eventual FIX-04; migration/release rollback constraints.
- Acceptance criteria: the runbook is reproducible and does not omit required schema changes. Document rollback limitations for migrations and immutable releases.
- Implementation location: workers/gateway/README.md; .github/workflows/deploy.yml; rollback runbook
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Make manual instructions match the approved workflow’s migration order, build commands, commit tagging, configuration prerequisites, and acceptance checks.

### FIX-21 — Secure Cloudflare administrative access

- Priority: **P1**
- Status: **READY**
- Evidence: Audit reports an administrator without 2FA and enforcement disabled. Current state not revalidated in this batch.
- Dependencies: Current account authentication/recovery inspection and account-owner interaction/enrollment authorization.
- Acceptance criteria: the appropriate strong authentication and recovery arrangements are confirmed. Account-owner interaction must be recorded as a specific blocker when required.
- Implementation location: Cloudflare administrative account authentication settings
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

The audit observed an administrator without two-factor authentication and account-wide enforcement disabled.

Recheck the current state. Prepare or perform the authorized enrollment/enforcement steps while preserving recovery access.

### FIX-22 — Enable and verify DNSSEC when authorized

- Priority: **P2**
- Status: **READY**
- Evidence: Audit baseline only; no DNS changes made or signing/DS verification claimed.
- Dependencies: Registrar/zone state and explicit DNSSEC authorization; registrar DS publication.
- Acceptance criteria: authoritative signing and registrar DS publication validate correctly. Do not mark the item complete merely because a dashboard toggle is enabled.
- Implementation location: Cloudflare DNSSEC and registrar DS settings
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Recheck the registrar and zone state, then prepare or perform the supported DNSSEC configuration.

### FIX-23 — Modernize TLS and transport policy

- Priority: **P2**
- Status: **READY**
- Evidence: Audit baseline only; HSTS/preload not enabled in this batch.
- Dependencies: Current custom-domain TLS/client requirements; authorization before policy changes.
- Acceptance criteria: the chosen TLS and HTTPS policy is verified on the custom domain without breaking supported agent clients. Introduce HSTS only after confirming the required HTTPS behavior. Do not enable preload automatically.
- Implementation location: Cloudflare TLS/HTTPS/HSTS settings; actual Pages/Worker transport
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Review minimum TLS, origin validation mode, HTTPS behavior, and HSTS against the actual Pages/Worker architecture and client requirements.

### FIX-24 — Establish an explicit domain email policy

- Priority: **P2**
- Status: **READY**
- Evidence: Mail use is unknown. No provider or deny-all policy inferred.
- Dependencies: Owner intent and complete legitimate sender/receiver/provider inventory before DNS policy changes.
- Acceptance criteria: DNS records match actual mail use. Do not invent a provider or deploy deny-all sending policies before accounting for legitimate senders.
- Implementation location: Domain MX/SPF/DKIM/DMARC and provider settings
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Determine whether the domain sends or receives email and identify legitimate providers and senders.

Configure the appropriate provider records and authentication policy, or an explicit no-mail policy if that is the owner’s intent.

### FIX-25 — Review alternate ingress and API abuse controls

- Priority: **P2**
- Status: **READY**
- Evidence: Current workers.dev exposure is intentional until assessed. Wildcard CORS or disabled Bot Fight Mode is not itself a defect.
- Dependencies: Intended public agent ingress/client behavior and authorization before edge restrictions.
- Acceptance criteria: required ingress remains usable, unnecessary exposure is addressed when authorized, and abuse controls do not break legitimate machine clients. Do not treat wildcard CORS or disabled Bot Fight Mode as an automatic vulnerability.
- Implementation location: Cloudflare Worker/Pages routes, previews, workers.dev, edge rate/abuse controls
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Review workers.dev, preview URLs, custom-domain routing, rate controls, and relevant edge settings against the intended public API.

### FIX-26 — Resolve obsolete debug pipelines and unused ingestion configuration

- Priority: **P2**
- Status: **READY**
- Evidence: Audit reports a failed debug pipeline and apparently unattached unauthenticated stream; current purpose/state not revalidated.
- Dependencies: Resource ownership/use/retention evidence and authorization before live retirement or configuration change.
- Acceptance criteria: intentional resources are documented and operational; obsolete resources are corrected or retired with authorization. Preserve required raw history.
- Implementation location: Cloudflare debug pipeline and ingestion resources
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Recheck the failed debug pipeline and the unauthenticated ingestion stream that appeared unattached in the audit. Determine their ownership, use, and retention requirements.

### FIX-27 — Establish useful runtime monitoring

- Priority: **P2**
- Status: **READY**
- Evidence: Audit baseline only. No monitoring system, recurring agent task, or alert recipient invented.
- Dependencies: Existing monitoring inventory/ownership; FIX-01/02/13/14/16 signals where appropriate; honor no recurring autonomous monitors unless separately authorized.
- Acceptance criteria: actionable monitoring and ownership exist, with sensitive data excluded. Do not duplicate an existing monitoring system merely because one Cloudflare logging setting is unset.
- Implementation location: Existing runtime/error/readiness/purchase/outbox monitoring
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Consolidation did not complete this item's remaining acceptance work. Historical audit evidence and any merged baseline implementation remain inputs for the next selected work.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Determine whether existing monitoring covers application errors, degraded payment readiness, stuck purchases, uncertain settlements, and outbox failures.

### FIX-28 — Integrate the draft with the accepted main release

- Priority: **P1**
- Status: **COMPLETE**
- Evidence: The integration commit `57636d4c84e0a9a96ed078d86413d4e526447106` has original PR #5 head `8711cdcf2dc31b16dc599da6db7cd0afd783a537` and PR #7 head `b812a981432d49d95d02d4e68565c2a49c32314f` as parents. Both and accepted main are ancestors of merged release `548bcc204d59785951da11e85943607d5e62d9fd`; reviewed and merged trees match `6c5cd346c5f5e491973da1e68294c11d63de78ca`.
- Dependencies: Completed assessment, integration review, combined-source checks, current-head GitHub CI, owner merge authorization, and exact-commit production acceptance are satisfied.
- Acceptance criteria: a reviewed combined source commit resolves the demonstrated conflicts, retains accepted payment configuration/recovery/release controls and intended draft delivery/events, and passes both sets of relevant regressions/builds. Record new exact-head CI; do not equate conflict resolution with product/publication approval or automatic deployment.
- Implementation location: commerce.js/discovery.js/README conflict resolution; first-delivery journey regressions; resolver rollout compatibility; reconciled verification/deployment workflows.
- Verification: 174/174 gateway, 32/32 release, 21/21 Pages, 55 utility assertions, all 16 actual Dynamic Worker packages, planner/preparation checks, both builds, actionlint and diff checks pass. PR CI run 39858026572 and production run 39858195268 succeeded; public health/readiness/free resolver behavior independently checked.
- Release state: PR #5 and PR #7 are merged. Consolidated release `548bcc204d59785951da11e85943607d5e62d9fd` is deployed and accepted; no owner application PR remains outstanding.
- Remaining blocker: None for integration. Remaining product, routing, telemetry, recovery, and external administration work retains its own IDs.

Bounded scope:

Reconcile the demonstrated source conflicts against the then-current accepted main. Preserve both the fenced prepared-state recovery/private-token/uncertainty rules and applicable draft delivery/event changes. Preserve readiness imports and draft observations. Never resolve by replacing accepted main with the older draft head. The later owner request explicitly authorized consolidation and merge through the existing GitHub deployment path. Catalog activation and model enablement remain separate product/rollout work.

## Batch 01 implementation and verification

The code changes are limited to FIX-01/02/03. The other 24 entries remain visible, unimplemented in this batch, and pending their own revalidation. No new independently confirmed fourth defect or SKU child was added.

### Source outcomes

- FIX-01 adds explicit, value-free recipient diagnostics, requires the independent expected-recipient assertion for new quotes/payable discovery, declares that Worker secret as required, and documents the exact configuration prerequisite. Already-settled delivery/recovery does not depend on current payment readiness.
- FIX-02 authenticates prepared retries and atomically assigns one settlement owner. The original invocation and competing retries cannot both settle. A committed prepared result survives lost acknowledgement. Authenticated retry or recovery closes abandoned claimed/executing states after five minutes without rerunning execution. This is request-driven cleanup, not a new recurring monitor. External execution outcome can remain unknown; no claim of external exactly-once effects is made.
- FIX-03 adds a release-input preflight and read-only postdeployment acceptance of Pages identity, gateway identity, health, readiness, required bindings, and intended payment discovery. Existing Pages response forwarding and Cap’n Web WebSockets are unchanged. Missing configuration fails the release visibly.

### Local verification

Environment: Node v24.19.0; repository lockfiles unchanged; dependencies installed with install scripts disabled.

| Check | Result |
| --- | --- |
| `npm run selftest` (repository root) | 55 legacy assertions + 21/21 actual Pages ingress tests pass |
| `npm test` (`workers/gateway`) | 76/76 pass; zero failures/skips |
| `npm run test:release` (root) | 32/32 pass; zero failures/skips |
| `npm run build:worker` (root) | Pass; 860-byte Pages bundle |
| `npm run build` (`workers/gateway`) | Pass; 1011.2 KiB as reported by esbuild |
| Workflow YAML and ordered steps | Parse passes; preflight before mutations; acceptance after both deployments |
| `git diff --check` | Pass |
| Independent selected-code review | No concrete remaining blocker in the ownership/retry logic; independent release/configuration review also found no blocker |

The local release-test subprocess was denied in the restricted sandbox; the identical offline command passed with permitted subprocess execution. No network or payment access was needed for those local tests. The table above records local evidence; the separate GitHub release evidence below records the subsequent CI and production results.

### GitHub release verification

Run `39816488828`, job `119956248588`, executed the approved merge commit. The workflow concluded success at `2026-10-22T16:45:33Z`.

| Release check | Result |
| --- | --- |
| Legacy utilities and Pages ingress | Pass; 55 utility assertions and 21/21 ingress tests |
| Release acceptance failure-path suite | 32/32 pass; zero failures/skips |
| Gateway commerce suite | 76/76 pass; zero failures/skips |
| Gateway and Pages builds | Both pass |
| Required release-input preflight | Pass before deployment/migrations |
| Existing commerce/outbox migrations | Pass; 8 and 7 queries respectively, both reporting zero rows read/written |
| Gateway deployment | Pass; version `0187ab0f-9daa-4eb2-b1dd-0fb2d19e1936` |
| Pages deployment | Pass; `71cbb351-482d-42d8-be44-1f69497dcbcd` |
| Production acceptance | Pass; accepted=true for exact merge commit, both deployment identities, payment readiness and intended discovery |

At `2026-10-22T16:47:06.070Z`, an independent authenticated Cloudflare read confirmed 100% of traffic on the release version, the exact source tag, all 12 preserved/staged binding names/types, and unchanged D1/R2 resource targets. No binding was missing or had a type mismatch.

An independent Pages metadata read at approximately `2026-10-22T16:46:52Z` confirmed the canonical production deployment, successful deploy stage, clean `main` source, exact release commit, and expected custom domains.

At `2026-10-22T16:49:41.076027Z` (12:49:41 p.m. EDT), the explicitly identified `SecondWind-readiness-review/1.0` client received HTTP 200 from `/health`, `/api/proof`, `/api/tools`, and `/v2/x402/discovery/resources`. Each response carried the expected Worker version. Health identified the exact release commit. Proof reported ready/configured/verified with all listed dependency checks true. Catalog and discovery each exposed one live product; discovery payment requirements matched the designated recipient and Base network. These were read-only requests and did not create quotes or purchases.

The default Python client separately received an edge 403/Error 1010 before application routing, as it had before this release. The identified review client and GitHub acceptance both passed. No edge security settings were changed; any broader client-compatibility review belongs to the existing domain/edge follow-up in FIX-25.

### Historical pre-release observations and verification limits

- At approximately 2026-10-22 15:37 UTC (11:37 a.m. EDT), `/health` returned 200 with gateway version `f25ead1b-a5fe-461d-88d2-b5d8cca91dcd` and main tag `82fe671add6468176134a344d38d2cbc3686b90e`.
- `/api/proof` returned 503 with recipient configured=false and verified=false. The listed facilitator/D1/schema/R2 booleans were true. These booleans do not prove a live facilitator payment or storage round trip.
- Discovery returned payment_configured=false and an empty accepts array for SW-PT-0006 v1. No paid URL, quote creation, or recovery-delivery request was used for the live check.
- At 2026-10-22 15:43:04 UTC, Pages metadata identified canonical production deployment `03f8463f-83d7-419c-b14f-13d5c310163c`, clean `main`, commit `82fe671add6468176134a344d38d2cbc3686b90e`, and the expected custom domain. The acceptance fixtures match the actual response field types.
- Those observations preceded the accepted deployment recorded above. No wallet-control proof or funded commerce success is claimed; the owner's recipient designation and read-only release acceptance do not constitute a funded transaction.

### Required release inputs and change plan

**Completed:** The owner subsequently confirmed the GitHub secret and instructed “done merge and deploy pr 6.” The plan below was executed through the existing GitHub workflow. Its staging history is retained to explain how the approved recipient reached the release; it is no longer a list of outstanding approvals.

Owner-input follow-up, October 22 at 12:16 p.m. EDT:

- The owner supplied the intended Base-mainnet receiving address in this conversation. Its strict EIP-55 checksum, non-burn status, and matching application configuration were verified. The address is accepted as the owner's designation; no wallet private key or additional wallet-control proof is needed for that designation.
- Staged `X402_PAY_TO` and `X402_EXPECTED_PAY_TO` together using the same owner-supplied value through the version merge-patch API with `deploy=false`. The new version is `8d7a1ddb-ee2c-472a-b744-cc9be36f7d7a` (version 16, created `2026-10-22T16:16:09.098803Z`). No recipient values or other secret values are included in this tracker.
- The staging source was active version `f25ead1b-a5fe-461d-88d2-b5d8cca91dcd`, source commit `82fe671add6468176134a344d38d2cbc3686b90e`. Direct before/after API comparison confirmed identical code modules, unchanged unrelated bindings, and unchanged compatibility settings. The staged version has a staging message and no source tag; do not describe it as the batch-01 source release.
- At that staging step, deployment `3626c8da-f38c-4f6b-b1a2-660250ee913f` still sent 100% of traffic to the prior active version. The staging operation did not change live traffic. The accepted release recorded above subsequently replaced it. There was no funded transaction.
- The GitHub connector exposes no Actions-secret management, and there is no authenticated local GitHub CLI. The owner completed the repository secret step and confirmed it before authorizing the release. Workflow preflight and postdeployment acceptance then passed. No browser fallback or alternate secret-provisioning workflow was used.

1. Owner-recipient input is complete. Preserve the designated address; do not re-infer it from historical Sepolia evidence or require the owner to repeat it as a new approval.
2. Configure the GitHub Actions repository secret `X402_EXPECTED_PAY_TO` with the same owner-supplied address. Before release, recheck that staged version `8d7a1ddb-ee2c-472a-b744-cc9be36f7d7a` remains the latest upload; secret inheritance uses the latest uploaded version. Preserve `CDP_FACILITATOR_KEY` and all unrelated bindings. Do not deploy this staging-only version directly as the batch-01 fix.
3. Review this batch's draft PR and authorize its merge/release. A main merge triggers the existing GitHub deployment workflow. No feature-branch manual production run should be used; FIX-04 still owns the broader enforced release boundary.
4. Run the reviewed GitHub workflow on the approved main commit. The preflight checks the independent release inputs before mutations. Existing migrations 0001 and 0002 remain additive/idempotent; this batch adds no migration. Deploy the gateway with the actual release SHA, then upload Pages tagged with that same SHA.
5. Require postdeployment acceptance to succeed for the Pages deployment, custom-domain gateway identity, readiness, and discovery. Record the exact release commit, both deployment identities, and results. A failed acceptance means the release is not accepted even if uploads succeeded.
6. Keep funded payment/canary authorization separate. This batch's read-only acceptance deliberately reports `funded_purchase_verified: false`.

### Rollback preparation

The known pre-batch code is `82fe671add6468176134a344d38d2cbc3686b90e`; known deployed gateway/Pages identities are recorded above. There are no new database migrations, status values, or payload format changes to undo. Existing prepared/settling/uncertain/settled rows, purchased versions, receipts, recovery hashes, and raw event history must remain intact.

If the authorized code release needs reversal, prepare a GitHub reversal PR for this batch's implementation changes and deploy the reviewed reversal through the normal GitHub path. Retain the independently approved merchant configuration and existing credentials. Do not blindly restore the previously invalid recipient setting. A reversal of the recovery patch restores the old stuck-preparation behavior, so preserve affected rows for subsequent safe recovery. Run the reviewed acceptance checker against the exact reversal commit and both deployments; an upload alone is not rollback acceptance. No automatic rollback or reversal is executed by the new checker.

## Batch 02 implementation and verification (historical)

### Outcome and source identity

This batch selected exactly FIX-04, FIX-05, and FIX-06. FIX-04 source is ready for review but external enforcement/release remain blocked. FIX-05 now has the owner-defined original assembled-payload policy and aligned documentation ready for merge; there is no outstanding A/B choice. FIX-06 is complete as an assessment. Newly demonstrated integration work is recorded as FIX-28; no fourth item was implemented.

- Starting and last checked main: `a853b9edbdb00be21b7ba157e7deb3ed36782643`.
- Working/published branch: `fix/batch-02-release-controls-content-review`.
- Workflow implementation commit: `42494048f132f11b53640ddae0d2590f56e7c844`.
- Verified local and GitHub implementation tree: `d65328ab304039f75932118b992930fd530fe4d2`.
- Review documents: [release controls](FIX04_RELEASE_CONTROLS.md), [public-content policy](FIX05_CONTENT_POLICY_REVIEW.md), [exact draft verification](FIX06_PR5_VERIFICATION.md).
- Draft PR: https://github.com/Cirrefera/Second-Wind/pull/7; open, unmerged, with a clean merge simulation against current main.
- Evidence/documentation commit: `bee0227a5b5db623aadae55a1ebb4cead901e7c7`, tree `707ba29d52489436851eddabd813a0731cfad9e3`.
- GitHub PR verification: [run 39824436671](https://github.com/Cirrefera/Second-Wind/actions/runs/39824436671), associated with that head. The actual checkout is GitHub test merge `e9d77c65bb97aeec1a4b782d337fd45b0ebc7d76`, whose tree exactly matches `707ba29d52489436851eddabd813a0731cfad9e3`. Job `119983862990`, **Verify application**, reports completed/success; every test/build step passed. The confirmed check source is GitHub Actions app ID `15368`. Logs show Node v24.21.0, 76 gateway tests, 32 release tests, 21 Pages tests, all legacy assertions, and both builds passing.
- At this evidence revision, the enclosing run metadata still reported in_progress despite the completed successful job. Do not misreport that lagging field as completed. This documentation-only follow-up leaves workflow/application bytes unchanged; fetch the final PR head and its check before merge.
- Production remains accepted release `048f08853e863391cf8652cafdd464140e810616`. No batch-02 merge, deployment, admin-setting mutation, product publication, or funded transaction occurred.

### Local verification evidence

| Scope | Fresh result |
| --- | --- |
| Main-based workflow implementation | 76 gateway tests, 32 acceptance tests, 21 Pages tests, 55 utility assertions, both builds pass |
| Workflow static/predicate verification | actionlint v1.7.12 pass; 72 actual-expression cases: 2 allowed/70 rejected; independent review pass |
| Batch PR GitHub verification job | Verify application completed/success in run 39824436671; 76 gateway, 32 acceptance, 21 Pages, 55 utilities, both builds pass on the exact matching test-merge tree |
| PR #5 exact current head | 146 gateway tests; 21 Pages tests; 55 utility assertions; both builds pass |
| PR #5 additional offline checks | 16 actual local Dynamic Worker combinations; 32 AWS plans/160 inputs/64 partial shapes; Powertools 7/7; deterministic/scripted routing 34/34 each; preparation evidence reproduces |
| PR #5 current-head GitHub evidence | No workflow runs, statuses, or check runs returned for the exact draft head |
| Draft/main integration simulation | Fails on two demonstrated content conflicts; no combined-source tests claimed |
| Public exposure | Exact 5,333-byte v1 hash matches current catalog; no paid request |

Both checkouts used Node v24.19.0 and locked installs with lifecycle scripts disabled. The main-based release suite required permitted subprocess execution; draft verification required permitted Python subprocess/local loopback execution. Identical commands then passed. These host constraints were not classified as application defects. No dependencies or lockfiles were changed.

### Concrete remaining decisions/actions

1. **FIX-04 configuration:** approve/apply the prepared exact main protection and main-only production environment. Provision the existing approved deployment inputs in that environment and remove/restrict unrestricted repo/org deployment-token fallback after confirming the environment configuration. The current GitHub connector lacks those administrative write operations. Settings must be read back before claiming enforcement.
2. **FIX-04 release:** after settings and current PR checks pass, authorize merge/release of the exact batch head. Prior PR #6 authorization is already executed and is not blanket authorization for this later PR. Production acceptance must then pass for the resulting exact merge.
3. **FIX-05 policy input is satisfied:** the owner specified original assembled payloads made from publicly sourced information. The original content is the useful combination, synthesis, structure, and adaptation. Merge the aligned README/SPEC/review guidance with PR #7 and preserve every bought version. Existing publication contracts already describe/review the original contribution; trusted live enforcement remains FIX-08. Do not ask the owner to choose A/B or confirm this definition again.

The approved merchant address and existing successful payment configuration are already known. Do not ask for them again or substitute a new recipient. No funded purchase is needed to complete these preparation items.

## Historical next batch selection — before the October 24 payment correction

Work from the consolidated `main`, not the pre-integration draft head. The next three queued actionable P1 IDs are **FIX-07, FIX-08, and FIX-13** under the existing priority/ID order. FIX-07's compatibility repair is already deployed; finish reviewed routing coverage. FIX-08 addresses genuine trusted publication, not another decision about whether public sources can form original content. FIX-13 checks actual event fields and live sink schemas before a projection change.

FIX-04 remains visible as blocked on external administrative settings only. FIX-05 and FIX-28 are complete. The consolidation authorization has been executed; do not ask to merge PR #5 or PR #7 again. Do not equate the remaining catalog/product work with unmerged source branches.

## Ready-to-paste continuation prompt

```text
The October 24 owner-directed payment boundary supersedes earlier instructions to retain custom commerce orchestration. Read CONTEXT.md, docs/adr/0001-standard-x402-payment-ownership.md and docs/X402_RECOVERY_MAPPING.md, then the Wayfinder map at https://github.com/Cirrefera/Second-Wind/issues/13. Default to official Hono/x402 payment handling while preserving sandbox trials, Cap'n Web selections, exact selected charges and durable recovery. Reuse the completed pinned-source research and recovery mapping; do not restart alternative-architecture exploration. Implementation remains open under FIX-17/19 and must preserve FIX-02 guarantees. The release identities and prior queue below are historical evidence, not a new merge/deploy authorization or permission to change payment architecture.

Continue Second Wind from Cirrefera/Second-Wind main and docs/SECONDWIND_FIX_TRACKER.md. Read docs/CONSOLIDATION_STATUS.md, docs/JEV_ROUTING_EVALUATION.md, and docs/JEV_QUESTION_AUDIT.md for consolidation and subsequent routing evidence. Refresh refs because subsequent source or documentation commits may supersede older identities.

The owner authorized merging all remaining in-scope work. PR #5 and PR #7 are merged. Consolidated application release: 548bcc204d59785951da11e85943607d5e62d9fd. Integration head: 57636d4c84e0a9a96ed078d86413d4e526447106. Verified and merged tree: 6c5cd346c5f5e491973da1e68294c11d63de78ca. Prior draft head 8711cdcf2dc31b16dc599da6db7cd0afd783a537 and PR #7 head b812a981432d49d95d02d4e68565c2a49c32314f are ancestors. Do not deploy or re-merge an old isolated draft.

GitHub verification run 39858026572/job 120101203757 and production run 39858195268/job 120101770147 both succeeded. Combined checks: 174 gateway, 32 release, 21 Pages, 55 utility assertions, 16 actual Dynamic Worker packages, both builds; source-preparation evidence reproduced exactly. Production acceptance identified gateway b761dab0-61e2-4549-ae59-8d0003cef876 and Pages b6fb9357-1f1c-4064-9617-5eb04424e26e at the exact release commit. Health/proof 200 and readiness ready. One live product remains SW-PT-0006 v1 at 0.10 USDC with unchanged hash. No funded purchase or candidate activation was performed.

The owner's TypeSafe skill/Jev instruction is already authorized and exercised. PR #8 is the preceding accepted release dadca82c5cf43ef6be0ebb62b3553e41b46198b8, with reviewed/released tree 3f69ab4ea93f37d3270a5ccfc8ea1576925aeb01 and successful verification/production runs 39867861178/39868083324. The subsequent question audit fixes the original excluded-deployment regression using request-structure Choice, per-candidate support Nouls, and code-owned consensus. Its final complete live run passes 60/60 outcomes: 38 model-called cases using 76 actual HTTP requests and 22 application-only cases. All 219 gateway tests and both builds pass. Original labels and provisional probability boundaries are unchanged. Preserve the failed development experiments and explain that the final 60 are regressions, not fresh holdouts. PRs #9 and #10 are now merged and combined application d8541816a4242cdab1aaceea9dd2640edc19b676 is accepted in production. Final source/test/release tree is e21bb4ac165254b0892a3f62f4fbd855b4754e56. Verification run 39879914304 / job 120174532617 and production run 39880042324 / job 120174945506 pass. The initial production run 39879436912 stopped at 218/219 tests before deployment; a deterministic clock test reproduced and verified the permanent timeout-close correction. Final acceptance at 2026-10-23 00:46:36 UTC / October 22 8:46:36 p.m. EDT identified gateway 876f2e07-c36a-4263-809e-b94d25daac49 and Pages 00fbc388-cd26-4fcf-a54a-e1b41a825bce, with one live product and funded_purchase_verified=false. Production inference remains disabled. FIX-07 needs truthful version-matched live manifests/contracts; FIX-12 needs production coverage and unseen-request/unknown/fallback acceptance and calibration. Do not ask again for already exercised evaluation or consolidation authorization.

COMPLETE: FIX-01,02,03,05,06,28. FIX-04 source controls are deployed; external settings remain BLOCKED. Main is still unprotected, rulesets empty, and production environment has no branch/protection policy; credential scoping unverified. The connector lacks administrative writes. Existing recipient is already supplied and independently verified; do not request it again.

The product definition is settled: publicly sourced information is selected, combined, structured, adapted, and integrated into original useful assembled payloads. The assembled product is what the buyer purchases. Original contribution and source provenance/licensing are separate review dimensions. Do not reopen the incorrect public-service/private-original A/B choice.

Select the next three IDs: FIX-07, FIX-08, FIX-13. FIX-07: preserve deployed free-text catalog compatibility while preparing/reviewing/registering version-matched structured routing. Structured intent currently truthfully returns routing_not_configured. FIX-08: verify genuine trusted review authority and the actual controlled publication path. FIX-13: reconcile emitter fields and actual live projections while preserving raw history. Fully prepare authorized work before requesting any specific missing input; do not invent reviews, commercial allocations, or enable optional inference.

Two v2 candidates are source-ready but unpublished: AWS-0568 requires component allocation and genuine reviews; SW-PT-0006 v2 requires genuine reviews while preserving v1 purchases. The historical 157-record inventory is not proof that 157 products are finished. Keep all 28 fix IDs and product-specific work visible. PR #1 is an unrelated third-party README advertisement, not application routing; the temporary audit branch adds no serving functionality. Both were excluded from consolidation.

Preserve the single gateway, thin Pages ingress, shared HTTP/x402 and Cap'n Web product services, D1 purchase/entitlement history, R2 exact payload/receipt storage, immutable selected scopes and bought versions, explicit delivery-language handshake, deterministic routing authority, and private recovery credentials. Standard x402 owns payment challenges, verification and settlement; existing quote identifiers are compatibility data, not a buyer-facing stage. Unknown settlement outcomes must never be blindly retried. Finish the existing build without unrelated redesign, new features, or recurring autonomous monitors. Report exact source/CI/deployed evidence and update the canonical tracker with completed work, remaining blockers, and next three IDs.
```
