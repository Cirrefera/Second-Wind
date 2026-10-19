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

The validator now checks inline component bytes against SHA-256 and byte length, and verifies the supported trial adapter. Review attestations remain necessary for original contribution, licensing and product quality; they do not replace byte verification. Reports are read-only and do not authorize promotion.

## Structured routing integration

The prepared `0004_routing_manifests.sql` migration adds immutable per-SKU/version routing records. It inserts no products or metadata. Reviewed manifests must be loaded before deploying the new resolver; no current product has been silently assigned a manifest.

HTTP `/api/resolve` and Cap’n Web `searchIntent(intent, limit, callbacks)` use the same structured resolver. `search(structuredIntent)` also uses it. Legacy `search(string)` retains its array-returning lexical discovery contract. Candidates from `searchIntent` include product capabilities; optional clarification callbacks request missing language/evidence. Compatibility covers explicitly declared structured requirements, not an unobserved external deployment.

Clef annotations are enabled only with `CLEF_ROUTING_ENABLED=true` and an AI binding. The default remains off until live inference and evaluation are verified. A reading cannot reintroduce an excluded product or select a different product version. Provider failure leaves the deterministic candidate results available.

Deployment remains pending inventory completion and acceptance testing. This branch must stay draft; the production workflow has not been run.
