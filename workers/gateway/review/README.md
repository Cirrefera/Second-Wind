# Inventory and decision validation

The 2026-10-19 report was computed from a fresh read of production D1. It contains release-readiness findings, not paid product contents. No publication status or historical hash was changed.

- 157 records: 155 draft, one live, one retired.
- All records currently use `resolve`; canonical `payload_objects` has zero rows.
- 51 artifact listings have no verified artifact release.
- All 157 need release evidence before new publication. This does not declare every guidance text unusable.
- Stored hashes: 151 differ from current guidance, one matches a prefix, five are missing. Their historical meaning remains unresolved; the audit does not overwrite them.

`inventory-eligibility-2026-10-19.csv` gives per-SKU blockers. `inventory-evidence-2026-10-19.json` binds the report to the inspected snapshot. Raw deliverables are intentionally excluded from this repository report.

## Clef integration status

`src/clef.js` uses Cloudflare's typed choice contract for inventory classification, candidate alignment and journey diagnostics. Each reading includes the model, contract version, question hash, request hash and source snapshot reference. Unknown is an explicit answer. Readings do not change catalog metadata, validate releases, settle payments or declare external deployment success.

`classify-inventory.mjs` runs operator-side classification with an existing Cloudflare account ID and API token authorized for Workers AI. It checkpoints readings separately from inventory. The current implementation is tested with contract fixtures; live inference, calibration and serving integration remain pending. There is no AI binding or automatic model call in production.

Candidate alignment requires prefiltered candidates. Its model preference is not itself compatibility evidence. Journey diagnostics include only observed event types; missing events do not establish patron abandonment or failure. No buyer inputs, payment credentials or trial code enter that diagnostic reader.

Authoritative API: https://developers.cloudflare.com/workers-ai/models/clef-flash/

## Publication checks

The validator checks product file bytes against SHA-256 and byte length, and verifies the supported trial adapter. Review attestations remain necessary for original contribution, licensing and product quality; they do not replace byte verification. Reports are read-only and do not authorize promotion. `publication-process.md` defines the trusted operator boundary and the prepared D1 approval guard. No publication approvals have been issued.

## Structured routing integration

Migration `0004_routing_manifests.sql` adds immutable per-SKU/version routing records. GitHub preparation applied migrations 0003–0005 on October 19. `live-routing-2026-10-19.json` describes the unchanged live release as guidance, with its limitations stated explicitly. The preparation workflow verifies its exact guidance hash before inserting this routing record. It changes no product content or publication status. The DynamoDB planner has separate version 2 routing metadata; that product remains draft. The deployment workflow checks live routing coverage before switching the Worker.

HTTP `/api/resolve` and Cap’n Web `searchIntent(intent, limit, callbacks)` use the same structured resolver. `search(structuredIntent)` also uses it. Legacy `search(string)` retains its array-returning lexical discovery contract. Candidates from `searchIntent` include product capabilities; optional clarification callbacks request missing language/evidence. Compatibility covers explicitly declared structured requirements, not an unobserved external deployment.

Clef annotations are enabled only with `CLEF_ROUTING_ENABLED=true` and an AI binding. The default remains off until live inference and evaluation are verified. A reading cannot reintroduce an excluded product or select a different product version. Provider failure leaves the deterministic candidate results available.

## GitHub verification and remaining release work

GitHub Actions run 39255635047 passed the gateway tests, build, both real Dynamic Worker integrations, all 16 supported planner choices, 80 AWS SDK shape checks, and reproducible packaging. Those sandbox tests made no AWS calls. Search/configure/trial inspection was verified in one Cap’n Web HTTP batch. Selected product tests and explicit acceptance remain separate decisions.

`production-baseline-2026-10-19.json` records a subsequent read-only GitHub check. Production remains on Worker version `f25ead1b-a5fe-461d-88d2-b5d8cca91dcd` and source `82fe671add6468176134a344d38d2cbc3686b90e`. Discovery and existing Cap’n Web selection respond. Recipient readiness remains false. No funded canary has run.

Draft storage preparation was blocked by R2 HTTP 403 / provider code 10000 using the GitHub credential. At that check, payload_objects, component_releases and product_routing_manifests were empty. The additive schemas had been applied, but no product status or historical purchase changed. The GitHub credential needs object access to the existing payload bucket before preparation can complete. Draft storage is now an explicit verification-workflow input rather than an automatic retry on every PR update.

`aws-0568-pricing.md` records the draft allocation and full-product maximum. Exact chosen files run in the existing isolated sandbox and are hash-bound before acceptance. Publication still needs immutable production storage, production trial acceptance, licensing and product review, an expected verified recipient, and an approved funded canary. Trial abuse budgets and retention cleanup, live Clef evaluation, and Basin/Iceberg arrival and longitudinal reporting remain unfinished.

This PR stays draft. Deployment uses the existing GitHub workflow. No new application Worker, Cloudflare Artifacts dependency, product promotion, or mainnet settlement was introduced. MCP registry listings remain deferred until the core purchase experience is ready.
