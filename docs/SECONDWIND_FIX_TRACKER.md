# Second Wind — canonical fix tracker

Last updated: 2026-10-22 (America/New_York).

Repository: https://github.com/Cirrefera/Second-Wind

Canonical tracker: `docs/SECONDWIND_FIX_TRACKER.md`.

## Batch control and source identity

- Selected IDs for batch 01: **FIX-01, FIX-02, FIX-03**. No fourth implementation item is authorized in this run.
- Working branch: `fix/batch-01-payment-recovery-release`.
- Starting main and observed production commit: `82fe671add6468176134a344d38d2cbc3686b90e`.
- Separate draft PR #5: `feat/proportional-product-scope` at `8711cdcf2dc31b16dc599da6db7cd0afd783a537`.
- All fetched branches were checked for an existing canonical tracker/handoff and repository AGENTS.md; none was present. Starting checkout was clean.
- Production observation: `/health` 200, gateway version `f25ead1b-a5fe-461d-88d2-b5d8cca91dcd`, main commit tag as above; `/api/proof` 503; discovery `payment_configured=false`, empty accepts for the one live product.
- Production source and configuration are unchanged by this batch. No merge, deployment, funded canary, product publication, secret update, or payment-data mutation was performed. These production actions remain outside this batch's granted authorization.
- Baseline local checks on Node v24.19.0: 54/54 gateway tests, 21/21 actual Pages ingress tests, and 55 legacy utility assertions passed. Both locked dependency installs used `npm ci --ignore-scripts --no-audit --no-fund`.
- Reviewed historical reports: `secondwind-repository-review-2026-10-22.md`, `secondwind-repository-evidence-2026-10-22.json`, `secondwindai-com-audit-2026-10-22.md`, `secondwindai-com-evidence-2026-10-22.json`. Historical claims for unselected items remain pending revalidation.

## Status and priority rules

`READY`: actionable/not started. `IN_PROGRESS`: selected in this batch. `READY_FOR_RELEASE`: implemented and locally verified, with merge/deployment/production acceptance pending. `BLOCKED`: a named dependency/input/authorization prevents further progress. `COMPLETE`: stated acceptance satisfied with evidence. `NOT_APPLICABLE`: current evidence proves no change is required.

P0: current batch release/payment blockers. P1: next release, commerce integrity, and operational integrity prerequisites. P2: bounded catalog, documentation, or domain follow-up. Same-priority actionable items are ordered by ID. Owner decisions may block final enforcement while evidence gathering and concrete preparation remain actionable. Never change a status merely because a historical report says work is done.

## Complete backlog

### FIX-01 — Correct payment configuration and readiness

- Priority: **P0**
- Status: **BLOCKED**
- Evidence: Current GET /api/proof is 503; recipient configured=false, verified=false. Worker has X402_PAY_TO secret binding but no X402_EXPECTED_PAY_TO; secret values were not retrieved.
- Dependencies: An independently verified Base mainnet recipient; authorized Worker secret configuration and GitHub release-check input before production acceptance.
- Acceptance criteria: configuration and readiness checks accurately distinguish valid, invalid, and independently verified recipients; discovery publishes usable intended payment requirements; production acceptance is recorded separately from local tests. Do not execute a funded canary without authorization.
- Implementation location: `workers/gateway/src/contracts.js`, `workers/gateway/src/index.js`, `workers/gateway/src/discovery.js`, `workers/gateway/wrangler.toml`, `workers/gateway/tests/recipient.test.mjs`, `workers/gateway/README.md`.
- Verification: New quote and payable-discovery creation require a valid non-burn recipient matching the independently supplied expectation. Diagnostics contain fixed codes only. Targeted recipient + HTTP suite: 21/21 pass. Combined gateway suite: 76/76 pass. Paid recovery/replay stays available after verification configuration loss. Secret values were not retrieved.
- Release state: Source implemented and locally verified; unmerged and undeployed. Current production remains on the baseline and returns 503 readiness. No funded purchase or production configuration correction performed.
- Remaining blocker: No independently verified current Base-mainnet merchant recipient is available. The encrypted X402_PAY_TO value is inaccessible, so the exact current validation defect is still unknown. Worker X402_EXPECTED_PAY_TO is absent. Need approved Worker correction, matching GitHub X402_EXPECTED_PAY_TO acceptance input, authorized merge/deployment, and fresh production acceptance. Historical Sepolia approval is insufficient.

Original bounded scope:

The audit observed /api/proof returning 503 with both payment_recipient_configured and payment_recipient_verified false. Discovery reported payment_configured false and an empty accepts array.

Identify the actual validation failure without exposing secrets. Correct the application’s configuration validation and deployment requirements where necessary. Use only an independently verified merchant recipient. If that recipient or permission to change configuration is unavailable, prepare the exact correction and mark the production step blocked.

### FIX-02 — Recover interrupted pre-settlement purchases

- Priority: **P0**
- Status: **READY_FOR_RELEASE**
- Evidence: Main source still leaves prepared purchases in payment_in_progress after prepared-to-settling write failure; draft PR #5 retains the same path. Audit fault fixture recorded one verification and zero settlements.
- Dependencies: Durable ownership/state fencing; preserve existing private recovery credentials and settlement uncertainty rules.
- Acceptance criteria: fault-injection tests demonstrate recovery after the database fault disappears, with no endless retry loop, repeated side effects, or extra settlement calls.
- Implementation location: `workers/gateway/src/commerce.js`; `workers/gateway/tests/interrupted-purchase.test.mjs`.
- Verification: 11 new fault/race regressions pass within 76/76 combined gateway tests. Injected failures before/after prepared and settling writes, initial claim acknowledgement loss, concurrent original/resumed calls, private-token failures, stale cleanup racing settlement, and late execution writes. Saved prepared results resume with one execution and one settlement; repeated retries do not settle again. No schema change.
- Release state: Source implemented and locally verified, including independent ownership/state review; unmerged and undeployed. No production fault injection or funded settlement performed.
- Remaining blocker: Authorized merge/deployment and production acceptance remain. If a settling claim commits but acknowledgement and readback are unavailable, later invocations remain settlement_pending_recovery and require trustworthy reconciliation (FIX-16), rather than guessing that no money moved.

Original bounded scope:

A transient database failure during the prepared-to-settling transition can leave a purchase permanently prepared. Retries then return payment_in_progress indefinitely.

Implement a bounded recovery or explicit terminal-outcome path using durable ownership and state checks. Preserve prepared results and prevent duplicate execution or settlement. Treat settling and uncertain states separately.

### FIX-03 — Add production release acceptance checks

- Priority: **P0**
- Status: **READY_FOR_RELEASE**
- Evidence: Main workflow stops after Worker and Pages uploads; /health currently identifies 82fe671add6468176134a344d38d2cbc3686b90e while /api/proof is degraded.
- Dependencies: FIX-01 for a passing production release; reviewed expected recipient and existing Cloudflare API credentials for read-only release acceptance.
- Acceptance criteria: incorrect deployment identity, degraded readiness, or unavailable payment configuration causes acceptance to fail. Local workflow verification must not be represented as a completed production deployment.
- Implementation location: `.github/workflows/deploy.yml`; `scripts/release-acceptance.mjs`; `scripts/release-acceptance.test.mjs`; root `package.json`.
- Verification: 32/32 offline release-acceptance tests pass. Checks reject wrong Pages/gateway commit, failed/degraded readiness, mismatched gateway versions, missing dependencies, unavailable discovery, and wrong recipient/network/asset/amount. Both builds and workflow YAML/order validation pass. Current live Pages API field shapes were independently checked; production acceptance was not run for a new release.
- Release state: Source implemented and locally verified; unmerged and undeployed. Workflow preflight precedes mutations; read-only acceptance follows both deployments. It never creates a quote/purchase, transfers funds, or automatically rolls back.
- Remaining blocker: Independently reviewed GitHub X402_EXPECTED_PAY_TO input, FIX-01 configuration, and authorized merge/deployment. Existing Cloudflare release token must have Pages metadata read access; any permission failure causes truthful acceptance failure.

Original bounded scope:

The deployment workflow ends after uploading Pages and does not verify the live domain.

Add checks for expected deployment identity, /health, /api/proof, and payment discovery after both deployments. Make configuration failure visible as failed release acceptance. Use existing safe discovery endpoints; do not create production purchases merely to perform a smoke check.

### FIX-04 — Enforce PR verification and production release boundaries

- Priority: **P1**
- Status: **READY**
- Evidence: Audit reports no PR trigger, unprotected main, no rulesets, and unrestricted manual dispatch. Current deploy workflow still has push-to-main and workflow_dispatch only.
- Dependencies: Repository administration authorization before applying protections; code-only verification and release-boundary preparation can proceed.
- Acceptance criteria: the intended checks run before merge, required protections are documented and applied when authorized, and production deployment is constrained to the approved release path.
- Implementation location: .github/workflows/; GitHub branch/ruleset/environment settings
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

The audit found unprotected main, no required status checks, no repository rulesets, and no PR verification trigger in the reviewed main workflow.

Add appropriate PR verification, required checks, and production branch/environment restrictions. Ensure manual workflow dispatch cannot inadvertently deploy an unintended branch to production.

### FIX-05 — Resolve the public-source and paid-content boundary

- Priority: **P1**
- Status: **READY**
- Evidence: Audit found exact public SW-PT-0006 v1 content at 5,333 bytes with the live SHA-256. Exposure/policy must be rechecked in its selected batch; public history must be preserved.
- Dependencies: Owner policy decision before changing publication/customer claims; exposure verification and concrete policy alternatives can proceed independently.
- Acceptance criteria: the chosen policy is explicit and enforced for future releases while existing buyers retain their purchased versions. Do not delete history, make repositories private, or claim previously public content has become confidential without explicit authorization.
- Implementation location: SPEC.md; README.md; publication paths and public product history in PR #5
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

Original bounded scope:

The exact historical guide currently advertised as SW-PT-0006 v1 was publicly available in PR #5, with matching byte count and SHA-256.

Confirm current exposure and establish whether the commercial model charges for exclusive content or for packaging, provenance, automation, and delivery. Align publication behavior and customer-facing claims with that decision.

### FIX-06 — Verify the exact current head of draft PR #5

- Priority: **P1**
- Status: **READY**
- Evidence: PR #5 is still open/draft at 8711cdcf2dc31b16dc599da6db7cd0afd783a537. Its reported 146-test results have not been rerun in this batch.
- Dependencies: Reproduce checks on the current exact draft head; no automatic merge.
- Acceptance criteria: an exact-commit verification record and a clear merge/release readiness assessment exist. Do not merge automatically.
- Implementation location: PR #5; workers/gateway/review/; draft test and workflow files
- Verification: Not selected or independently revalidated in this batch. Audit evidence is a starting point only.
- Release state: Unchanged by batch 01; no source/merge/deployment/production completion claimed.
- Remaining blocker: Resolve/revalidate the dependencies above when selected; no other blocker presumed.

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
- Dependencies: Owner commercial policy (including FIX-05) and current implementation contract.
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
| Independent selected-code review | No concrete remaining blocker in the ownership/retry logic; release/configuration review recorded in handoff |

The release-test subprocess was denied in the restricted sandbox; the identical offline command passed with permitted subprocess execution. No network or payment access was needed for those tests. This is local verification, not GitHub Actions evidence, staging acceptance, or production verification.

### Production observations and limitations

- At approximately 2026-10-22 15:37 UTC (11:37 a.m. EDT), `/health` returned 200 with gateway version `f25ead1b-a5fe-461d-88d2-b5d8cca91dcd` and main tag `82fe671add6468176134a344d38d2cbc3686b90e`.
- `/api/proof` returned 503 with recipient configured=false and verified=false. The listed facilitator/D1/schema/R2 booleans were true. These booleans do not prove a live facilitator payment or storage round trip.
- Discovery returned payment_configured=false and an empty accepts array for SW-PT-0006 v1. No paid URL, quote creation, or recovery-delivery request was used for the live check.
- At 2026-10-22 15:43:04 UTC, Pages metadata identified canonical production deployment `03f8463f-83d7-419c-b14f-13d5c310163c`, clean `main`, commit `82fe671add6468176134a344d38d2cbc3686b90e`, and the expected custom domain. The acceptance fixtures match the actual response field types.
- The newly prepared release has not been deployed. No production pass, wallet-control proof, or funded commerce success is claimed.

### Required release inputs and change plan

1. Obtain an independently verified intended Base-mainnet receiving address. Do not infer it from the existing encrypted setting, a branch name, a fixture, or the old Sepolia approval.
2. After owner authorization, configure the matching GitHub Actions `X402_EXPECTED_PAY_TO` secret and prepare the Worker correction described in `workers/gateway/README.md`. Preserve `CDP_FACILITATOR_KEY`, all unrelated bindings, and approved merchant identity. Only change `X402_PAY_TO` with specific recipient-change authorization.
3. Review this batch's draft PR and authorize its merge/release. A main merge triggers the existing GitHub deployment workflow. No feature-branch manual production run should be used; FIX-04 still owns the broader enforced release boundary.
4. Run the reviewed GitHub workflow on the approved main commit. The preflight checks the independent release inputs before mutations. Existing migrations 0001 and 0002 remain additive/idempotent; this batch adds no migration. Deploy the gateway with the actual release SHA, then upload Pages tagged with that same SHA.
5. Require postdeployment acceptance to succeed for the Pages deployment, custom-domain gateway identity, readiness, and discovery. Record the exact release commit, both deployment identities, and results. A failed acceptance means the release is not accepted even if uploads succeeded.
6. Keep funded payment/canary authorization separate. This batch's read-only acceptance deliberately reports `funded_purchase_verified: false`.

### Rollback preparation

The known pre-batch code is `82fe671add6468176134a344d38d2cbc3686b90e`; known deployed gateway/Pages identities are recorded above. There are no new database migrations, status values, or payload format changes to undo. Existing prepared/settling/uncertain/settled rows, purchased versions, receipts, recovery hashes, and raw event history must remain intact.

If the authorized code release needs reversal, prepare a GitHub reversal PR for this batch's implementation changes and deploy the reviewed reversal through the normal GitHub path. Retain the independently approved merchant configuration and existing credentials. Do not blindly restore the previously invalid recipient setting. A reversal of the recovery patch restores the old stuck-preparation behavior, so preserve affected rows for subsequent safe recovery. Run the reviewed acceptance checker against the exact reversal commit and both deployments; an upload alone is not rollback acceptance. No automatic rollback or reversal is executed by the new checker.

## Next batch selection

Next selected IDs: **FIX-04, FIX-05, FIX-06**. They are the first three actionable P1 items. FIX-04 can implement PR verification and prepare protections; applying external protections needs the proper authorization. FIX-05 can verify current exposure and prepare a concrete policy decision; enforcement depends on the owner's policy. FIX-06 can independently test the exact draft head and assess integration without merging it. FIX-07/08 depend on that draft assessment, while later telemetry and catalog items remain queued.
