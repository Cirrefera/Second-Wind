# Second Wind — canonical fix tracker

Last updated: 2026-10-22 (America/New_York).

Repository: https://github.com/Cirrefera/Second-Wind

Canonical tracker: `docs/SECONDWIND_FIX_TRACKER.md`.

## Batch 02 current result

Selected IDs: **FIX-04, FIX-05, FIX-06**. Branch: `fix/batch-02-release-controls-content-review`. Review: [draft PR #7](https://github.com/Cirrefera/Second-Wind/pull/7).

- **FIX-04 — BLOCKED on external configuration and release:** the PR verification and production-job controls are implemented and locally verified in `42494048f132f11b53640ddae0d2590f56e7c844`, tree `d65328ab304039f75932118b992930fd530fe4d2`. The exact branch/environment/credential configuration is prepared in [FIX04_RELEASE_CONTROLS.md](FIX04_RELEASE_CONTROLS.md); it has not been applied.
- **FIX-05 — READY_FOR_RELEASE; owner policy clarified:** Second Wind sells original assembled payloads made by selecting, combining, structuring, and adapting publicly sourced material. The earlier A/B choice was incorrect and is superseded. README, SPEC, [FIX05_CONTENT_POLICY_REVIEW.md](FIX05_CONTENT_POLICY_REVIEW.md), and this handoff now reflect that definition. Existing contribution/product-review and provenance/license checks support it; actual trusted publication rollout remains FIX-08. No further owner policy input is required.
- **FIX-06 — COMPLETE as a verification/assessment:** exact draft head `8711cdcf2dc31b16dc599da6db7cd0afd783a537` passes all 146 gateway tests and the additional offline product checks. It has no exact-head GitHub CI evidence and has two demonstrated content conflicts against main. [FIX06_PR5_VERIFICATION.md](FIX06_PR5_VERIFICATION.md) records reproducible results. Completion does not mean PR #5 is merge-ready.
- **FIX-28 — new, READY:** the demonstrated draft/main integration conflict is a separate bounded implementation item. It was recorded, not implemented as a fourth item.
- Main was rechecked at `a853b9edbdb00be21b7ba157e7deb3ed36782643`. Production remains accepted application release `048f08853e863391cf8652cafdd464140e810616`; the read-only public check at 1:24 p.m. EDT confirmed the same gateway version. No batch-02 merge, deployment, settings change, product publication, or funded purchase has occurred.

All FIX-01 through FIX-28 entries remain visible. FIX-01–03 retain their completed release acceptance. Apart from the selected items and newly recorded integration item, the backlog remains queued; historical evidence has not been relabeled as fresh verification.

## Current released application result (batch 01)

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
- Evidence: Current main is unprotected; repository rulesets are empty; only the unrelated existing github-pages environment is configured. Main has no PR trigger. The isolated change adds a secret-free PR verification job and restricts the production job to this repository's main push/manual dispatch with a production environment and job-scoped concurrency.
- Dependencies: Owner authorization and an administrative surface to apply the concrete main protection, main-only production environment, and deployment-credential scope. Then exact reviewed-head merge/release authorization and acceptance. The connector does not expose writes for protections, environment policies, or Actions secrets.
- Acceptance criteria: the intended checks run before merge, required protections are documented and applied when authorized, and production deployment is constrained to the approved release path. YAML alone is not evidence of externally enforced protection.
- Implementation location: `.github/workflows/verify.yml`; `.github/workflows/deploy.yml`; `docs/FIX04_RELEASE_CONTROLS.md`.
- Verification: Node v24.19.0; 76/76 gateway, 32/32 release acceptance, 21/21 actual Pages ingress, 55 utility assertions, both builds, actionlint v1.7.12, and diff check pass. Independent source review found no blocking defect. Actual deployment expression evaluated across 72 combinations: only intended main push/dispatch allowed (2 allowed, 70 rejected). No live negative deployment was attempted.
- Release state: Workflow implementation published on the isolated batch branch in `42494048f132f11b53640ddae0d2590f56e7c844`; local/remote tree match `d65328ab304039f75932118b992930fd530fe4d2`. External settings and production remain unchanged. PR/CI evidence is recorded in the batch-02 section when available.
- Remaining blocker: Apply/read back the proposed settings and environment credential scope with owner authorization; then merge/release the reviewed batch and pass production acceptance. Older branch workflows must not retain unrestricted repository/organization deployment-token access.

Original bounded scope:

The audit found unprotected main, no required status checks, no repository rulesets, and no PR verification trigger in the reviewed main workflow.

Add appropriate PR verification, required checks, and production branch/environment restrictions. Ensure manual workflow dispatch cannot inadvertently deploy an unintended branch to production.

### FIX-05 — Define original assembled payloads and their source provenance

- Priority: **P1**
- Status: **READY_FOR_RELEASE**
- Evidence: The owner clarified on October 22 that publicly sourced information is combined in an original manner to form the product's original content. The original contribution is the useful selection, synthesis, arrangement, adaptation, and integration embodied in the assembled payload. Public source inputs are compatible with this model. Prior public-byte/hash observations are retained as distribution evidence, not a finding that source provenance invalidates originality.
- Dependencies: Owner product-policy input is satisfied. Merge the prepared documentation with PR #7. Existing original-contribution/product/contract/license checks provide the publication contract; genuine review authentication and integration into the live publication path remain FIX-08, with product-specific reviews under their existing IDs.
- Acceptance criteria: Product documentation and publication-review guidance consistently define the original assembled payload; source provenance and applicable attribution/license requirements are recorded separately; the existing release checks require a described and reviewed original contribution; existing bought versions remain intact. No secrecy choice or owner policy reconfirmation is required.
- Implementation location: `README.md`; `SPEC.md`; `docs/FIX05_CONTENT_POLICY_REVIEW.md`; tracker and continuation prompt. Runtime/schema changes are unnecessary for this clarification; existing publication.js and draft release-preparation.js contain the relevant contribution/review fields.
- Verification: Source inspection confirms nonempty `original_contribution`, manifest-bound product/contract review hashes, and separate origin/license evidence. Existing publication tests cover absent contribution, absent product review, and changed contribution without renewed review. Independent review confirms no privacy or originality-scoring mechanism is needed. Documentation consistency and diff checks pass. Main contains the validator/tests; its production activation integration is not claimed complete.
- Release state: Owner policy recorded and bounded documentation correction prepared on the batch-02 branch. Awaiting PR merge; no product activation, payload rewrite, price change, source-history rewrite, or application deployment was performed.
- Remaining blocker: No outstanding owner content-policy decision. Documentation merge remains pending with PR #7; production publication enforcement and actual product approval retain their existing FIX-08/10/11 scope.

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
- Release state: Assessment complete; PR #5 remains open/draft and unchanged. Local results are not current-head GitHub CI and do not mean the combined source or release is ready. Direct deployment of this older draft would omit accepted FIX-01–03 protections.
- Remaining blocker: None for this assessment's acceptance. Two demonstrated integration conflicts are FIX-28. Routing manifests, genuine publication reviews/commercial allocation, and sink verification remain FIX-07/08/10/11/13/14. FIX-05 now records the owner-defined original assembled-payload policy.

Original bounded scope:

The draft contains substantial functionality that is separate from deployed main. Its reported local test results must not be treated as current-head CI evidence.

Reproduce the relevant checks on the exact current head, compare it with production, and identify integration or release blockers. Record newly discovered defects as separate backlog IDs rather than silently expanding this item.

### FIX-07 — Satisfy the structured resolver’s routing prerequisites

- Priority: **P1**
- Status: **READY**
- Evidence: Audit reports migration creates an empty routing-manifest table and draft resolver depends on these records. Current production still runs main.
- Dependencies: FIX-06 exact-head assessment; reviewed version-matched product routing manifests before resolver rollout.
- Acceptance criteria: representative supported queries find the intended products after the proposed rollout, and missing or incompatible configurations produce truthful responses.
- Implementation location: workers/gateway/src/routing.js; migrations/0004_routing_manifests.sql in PR #5
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

The draft resolver depends on version-matched records in product_routing_manifests, while its migration creates an empty table.

Ensure reviewed manifests exist for intended live products before switching the resolver, or implement a deliberate, documented compatibility strategy. Add a release prerequisite that detects missing routing records.

### FIX-08 — Enforce trusted publication and immutable release registration

- Priority: **P1**
- Status: **READY**
- Evidence: Audit found staged publication code; evidence hashes alone cannot authenticate approval. Not revalidated in this batch.
- Dependencies: FIX-06; genuine authenticated reviews, immutable payload evidence, and authorization before production registration/activation.
- Acceptance criteria: unreviewed or inconsistent releases cannot become live; existing bought versions remain deliverable; buyer-supplied data cannot manufacture publication approval. Distinguish evidence hashes from independently authenticated human or organizational approvals.
- Implementation location: Publication modules/tests and preparation/stage/activate paths in PR #5
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Reconcile the current inventory with available source, payloads, contracts, reviews, and publication state. Historical exports are evidence, not a current database snapshot.

Create explicit child backlog entries for each unfinished SKU or release. Each child must have a bounded deliverable and acceptance criteria. Do not hide the construction of an entire catalog inside one item.

### FIX-10 — Finish the AWS-0568 candidate’s release prerequisites

- Priority: **P2**
- Status: **READY**
- Evidence: Candidate source is reported prepared; commercial allocation and genuine approvals remain unverified. No activation authorized.
- Dependencies: FIX-08; owner-supplied component allocation and genuine product/source/language/publication reviews.
- Acceptance criteria: required product inputs and genuine approvals are present, exact deliverable bytes are verified, and staging/activation status is accurately recorded. Do not invent missing component prices or approve the product yourself.
- Implementation location: AWS-0568 package and review evidence in PR #5
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Review the actual prepared package, supported languages, component dependencies, commercial allocation, validation evidence, and publication requirements.

### FIX-11 — Finish the SW-PT-0006 replacement candidate’s release prerequisites

- Priority: **P2**
- Status: **READY**
- Evidence: Replacement source is reported prepared; publication readiness and actual review evidence remain unverified.
- Dependencies: FIX-08; genuine source/license/contract/validation/publication review; retain v1 buyer access.
- Acceptance criteria: the new release meets its declared contract and review requirements while historical purchases continue to resolve to the correct version. Do not equate source readiness with publication approval.
- Implementation location: SW-PT-0006 replacement package and historical version records in PR #5
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Review the corrected guidance, actual example, supported versions, source/license evidence, validation, and historical-version preservation.

### FIX-12 — Validate optional Clef-assisted routing before enabling it

- Priority: **P2**
- Status: **READY**
- Evidence: Optional live Clef flag remains disabled in draft. Fixture success is not live model quality. No live calls made.
- Dependencies: Owner direction on optional assistance, reproducible fixtures and deterministic baseline; separately authorized live evaluation and reviewed calibration before enabling.
- Acceptance criteria: fixture and deterministic results are reproducible; live evaluation and threshold calibration are separately documented if authorized. Keep live assistance disabled until its dependencies and acceptance criteria are met.
- Implementation location: workers/gateway/src/routing.js and routing fixtures in PR #5
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Keep deterministic compatibility checks authoritative. Verify typed responses, fallback behavior, bounded candidate scope, and the treatment of uncertain or unavailable model output.

### FIX-13 — Align telemetry projections with the current event contract

- Priority: **P1**
- Status: **READY**
- Evidence: Audit reports payment.settled / exact_amount_atomic / payment_network do not match older specialized projections. Raw history must remain intact.
- Dependencies: Current event-contract and sink-schema verification; authorization before changing live pipelines.
- Acceptance criteria: current payment and receipt events appear in the intended projections with correct amounts, identifiers, and network fields.
- Implementation location: workers/gateway/src/telemetry.js; current pipeline SQL; draft telemetry-review.md
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Trace the same event ID from the D1 outbox through ingestion to the raw and specialized tables. Check backlog age, retries, failed dispatches, and throughput against actual needs.

### FIX-15 — Prevent recovery-challenge slot interference

- Priority: **P1**
- Status: **READY**
- Evidence: Audit fixture filled five outstanding challenges and got 429 on the sixth. This batch does not change challenge throttling.
- Dependencies: Preserve wallet proof, expiry, one-time use, and retained-token recovery.
- Acceptance criteria: an unrelated caller cannot monopolize recovery issuance, while expiry, wallet ownership verification, one-time use, and retained-token recovery continue to work.
- Implementation location: workers/gateway/src/commerce.js recovery challenge paths; recovery tests
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

An unauthenticated caller who knows a payment ID can fill its outstanding challenge slots and temporarily block a new lost-token recovery challenge.

Implement a bounded challenge and throttling design that preserves legitimate recovery availability.

### FIX-16 — Establish safe reconciliation for unknown settlement outcomes

- Priority: **P1**
- Status: **READY**
- Evidence: Uncertain settlement is intentionally not retried. Stored confirmed R2 receipt repair already exists; no operator workflow revalidated here.
- Dependencies: Verified external settlement evidence; explicit operational authority for entitlement reconciliation.
- Acceptance criteria: operators can identify the purchase, obtain trustworthy settlement evidence, and resolve entitlement state without a duplicate transfer. Automated reconciliation must be supported by verified external evidence.
- Implementation location: workers/gateway/src/commerce.js; settlement/reconciliation operations documentation
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Document and, where appropriate, implement the operator workflow for settlements whose external outcome is unknown. Preserve the existing rule against blindly settling again.

### FIX-17 — Complete the machine-readable API contract

- Priority: **P2**
- Status: **READY**
- Evidence: Audit identifies missing operations/schemas and unsupported completeness claim. This batch changes only payment readiness/discovery gating.
- Dependencies: Actual deployed/draft route contract and intended release scope.
- Acceptance criteria: intended public operations and their meaningful schemas are represented and checked against implementation. Remove any unsupported claim that the document is complete.
- Implementation location: workers/gateway/src/discovery.js OpenAPI generator; HTTP/Cap’n Web contract
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
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
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

Determine whether existing monitoring covers application errors, degraded payment readiness, stuck purchases, uncertain settlements, and outbox failures.

### FIX-28 — Integrate the draft with the accepted main release

- Priority: **P1**
- Status: **READY**
- Evidence: `git merge-tree --write-tree a853b9edbdb00be21b7ba157e7deb3ed36782643 8711cdcf2dc31b16dc599da6db7cd0afd783a537` returns exit 1 with content conflicts in `workers/gateway/src/commerce.js` and `workers/gateway/src/discovery.js`; generated conflict tree `8f795d3d3877c080903f448f49ebcf0e3d99cea9`. This was recorded during FIX-06, not resolved in batch 02.
- Dependencies: Fresh refs, completed FIX-06 assessment, preservation of accepted FIX-01–03 and any subsequently accepted FIX-04 workflow changes. Keep product/publication prerequisites independent from source integration.
- Acceptance criteria: a reviewed combined source commit resolves the demonstrated conflicts, retains accepted payment configuration/recovery/release controls and intended draft delivery/events, and passes both sets of relevant regressions/builds. Record new exact-head CI; do not equate conflict resolution with product/publication approval or automatic deployment.
- Implementation location: Existing draft branch integration; primarily commerce.js/discovery.js and resulting workflow/test reconciliation.
- Verification: Not implemented or tested as combined source. Exact-head individual results and conflict reproduction are in `docs/FIX06_PR5_VERIFICATION.md`.
- Release state: No merge, branch update, or production action for PR #5 occurred in batch 02.
- Remaining blocker: Select this bounded implementation work in a subsequent batch and verify the combined result; no additional owner input presumed for isolated preparation.

Bounded scope:

Reconcile the demonstrated source conflicts against the then-current accepted main. Preserve both the fenced prepared-state recovery/private-token/uncertainty rules and applicable draft delivery/event changes. Preserve readiness imports and draft observations. Never resolve by replacing accepted main with the older draft head. No catalog activation, model enablement, new architecture, or automatic merge/deployment is included.

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

## Batch 02 implementation and verification

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

## Next batch selection

After completing any newly authorized blocked actions, the next three queued actionable P1 IDs by the established priority/ID order are **FIX-07, FIX-08, and FIX-13**. FIX-06's assessment dependency is now satisfied. FIX-07/08 source preparation may proceed in isolation, but production rollout of the draft also requires FIX-28 integration and the existing product inputs. FIX-13 must inspect the current emitter/sink contract before any authorized pipeline change. Keep FIX-04 visible as blocked on external settings/release and FIX-05 as READY_FOR_RELEASE for the adopted policy/documentation. Do not silently claim production publication enforcement or substitute a fourth selected implementation item.

## Ready-to-paste continuation prompt

Continue the existing Second Wind remediation in batches of exactly three stable IDs. Fetch current main, the batch-02 branch/PR, and PR #5 before editing. Use parallel agents for independent selected work. Finish the existing application within its existing architecture.

Repository: https://github.com/Cirrefera/Second-Wind
Canonical tracker: docs/SECONDWIND_FIX_TRACKER.md. Draft batch PR: https://github.com/Cirrefera/Second-Wind/pull/7. The latest batch-02 tracker/review evidence is on fix/batch-02-release-controls-content-review until PR #7 is merged; main may still contain the batch-01 record. Do not overwrite the newer handoff with the older main copy.

Starting/last checked main: a853b9edbdb00be21b7ba157e7deb3ed36782643.
Released application: 048f08853e863391cf8652cafdd464140e810616, gateway 0187ab0f-9daa-4eb2-b1dd-0fb2d19e1936, Pages 71cbb351-482d-42d8-be44-1f69497dcbcd; accepted GitHub run 39816488828. FIX-01/02/03 remain COMPLETE. The owner approved the existing merchant and release inputs; do not request recipient input again. Funded-purchase verification remains false.

Batch-02 workflow implementation: 42494048f132f11b53640ddae0d2590f56e7c844, verified tree d65328ab304039f75932118b992930fd530fe4d2. FIX-04 adds the secret-free PR check Verify application and the production job guard/environment, preserving release preflight and acceptance. Local tests: 76 gateway, 32 release, 21 Pages, 55 utility assertions, both builds; actionlint and 72-case event matrix pass. GitHub run 39824436671 on head bee0227a5b5db623aadae55a1ebb4cead901e7c7 checked out test merge e9d77c65bb97aeec1a4b782d337fd45b0ebc7d76; both have tree 707ba29d52489436851eddabd813a0731cfad9e3. Its Verify application job 119983862990 completed successfully with all tests/builds; check source GitHub Actions app 15368. Enclosing run metadata was still in_progress at the evidence revision, so fetch current run/check state and final PR head. Subsequent evidence edits are documentation-only. FIX-04 remains BLOCKED until exact prepared main/environment protections and environment credential scope are applied/read back with owner authorization, then reviewed merge/release is authorized and accepted. Detailed settings are in docs/FIX04_RELEASE_CONTROLS.md; source YAML alone is not external enforcement. The connector lacks those settings/secret write operations.

FIX-05 is READY_FOR_RELEASE with owner policy input satisfied. Second Wind combines publicly sourced information in an original manner: its selection, synthesis, organization, adaptation, and integration form the original assembled payload that the buyer purchases. README, SPEC, docs/FIX05_CONTENT_POLICY_REVIEW.md, and this handoff now reflect that model. The earlier public-service versus private-original A/B framing was incorrect; do not ask for that choice again. Existing original_contribution, product/contract review hashes, and separate provenance/license checks already express the policy. Main has the validator/tests; actual trusted live activation integration remains FIX-08. Exact v1 bytes and the v2 candidate have been publicly available; that is distribution evidence, not a finding against original composition. Preserve public history, source attribution, and bought versions.

FIX-06 is COMPLETE as an assessment of exact PR #5 head 8711cdcf2dc31b16dc599da6db7cd0afd783a537, tree f7aebfa09422e061fba558a817af258c9ba08c06. Reproduced 146 gateway tests, 55 utility assertions, 21 Pages tests, both builds, 16 actual local Dynamic Worker combinations, 32 plans/160 AWS inputs/64 partial shapes, Powertools 7/7, deterministic/scripted routing 34/34 each, source-preparation evidence. No exact-head GitHub CI exists; no live inference or funded commerce was tested. Read docs/FIX06_PR5_VERIFICATION.md for commands and distinctions.

New FIX-28 (P1 READY) records demonstrated draft/main conflicts in commerce.js and discovery.js. It is not implemented. The isolated draft predates accepted readiness/recovery/release fixes; never deploy it directly over main. Resolve and verify combined source only when FIX-28 is selected. Product publication and model enabling remain separate dependencies.

Next queued batch: select exactly FIX-07, FIX-08, FIX-13 under priority/ID order, unless the owner directs completion of a specific blocked action first. FIX-07: prepare/revalidate version-matched routing manifests and rollout prerequisites. FIX-08: verify and enforce genuine trusted publication/immutable registration, respecting the adopted original assembled-payload policy and pending product inputs. FIX-13: reconcile actual event fields with current projections, preserving raw history; live pipeline changes need authorization. Draft production rollout also depends on FIX-28. Complete independent preparation for any blocked selected item; do not substitute a fourth implementation task.

Preserve the single gateway, thin Pages ingress, D1 commerce authority, R2 payload/receipt storage, private recovery credentials, original purchase/language handshake, deterministic routing authority, and no recurring autonomous monitors. Settling/uncertain payments must never be blindly retried. Keep all FIX-01 through FIX-28 entries and their evidence visible. Respect any later owner policy, scope, or release authorization rather than asking again. Return six sections: batch outcome; complete backlog; exact source/PR/local/CI/staging/production evidence; concrete remaining decisions/actions; next three IDs; self-contained next-model prompt.
