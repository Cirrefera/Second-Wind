# Inventory and decision validation

The original 2026-10-19 report and evidence describe a saved inventory export attributed to production D1 at that time. This pass inspected that held export locally and reproduced its recorded canonical snapshot hash; it did not access production. The reports contain release-readiness findings, not paid product contents. No publication status, historical hash, or bought version was changed.

- The held export has 157 records: 155 draft, one live, one retired.
- All records in the held export use `resolve`; the original evidence records zero canonical `payload_objects` rows. This is a historical observation, not a new query.
- The held export has 51 artifact listings without verified artifact release evidence.
- All 157 lack release evidence for new publication in the held export; the retired row is not a promotion candidate. This does not declare every guidance text unusable.
- Stored hashes: 151 differ from the guidance in the held export, one matches a prefix, five are missing. Their historical meaning remains unresolved; the audit does not overwrite them.

`inventory-eligibility-2026-10-19.csv` and `inventory-evidence-2026-10-19.json` are preserved historical findings. `inventory-readiness-2026-10-19.csv` adds a per-listing inventory of payload, metadata and provenance gaps. Its companion `inventory-readiness-evidence-2026-10-19.json` records the report hash, input snapshot hash, generator hash, and the separate local AWS-0568 draft candidate. Raw guidance is excluded from these reports.

The new report retains each SKU/version/status and legacy content hash. It lists public advertised summaries, guidance byte counts and hashes, structured metadata keys, source and license claims, and exact absent or unverified evidence. A repository URL or a structured `path`/`module` field is a pointer; it does not establish delivered file bytes, a source revision, or applicable license/notice mapping. Legacy `tool` listings require a reviewed guidance-versus-execution contract. The 12 bundle listings require exact versioned member releases and entitlement/provenance evidence. Five rows lack provenance claims and six lack license claims. All 157 have empty MIME metadata; five have input schemas. Counts and absence claims apply only to the held export and original audit, not an uninspected external store.

To reproduce the new report locally, run `node review/generate-readiness.mjs /path/to/held-inventory.json` from `workers/gateway`. The generator refuses any export whose canonical snapshot hash differs from the historical evidence. It makes no network requests.

## AWS-0568 original draft

The historical row promises a direct CreateTable manifest with TTL and point-in-time recovery, but contains only prose and a structured `slug` marker. TTL and point-in-time recovery use their separate AWS operations. The original catalog attribution to `awslabs/amazon-dynamodb-tools` has no verified revision/file/license mapping in the held export.

`products/agent-state-dynamodb-manifest` is a separate original Second Wind draft request planner. It separates those operations, rejects sparse component arrays, and declares expected final state for keys, attribute types, KMS encryption, and selected optional features. Offline tests cover all 16 feature selections; botocore validation covers 80 operation inputs and 32 partial response shapes. These checks do not establish an AWS deployment or implement a response matcher.

The local candidate remains draft: its gateway release manifest, reviewed catalog/provenance contract, immutable R2 delivery binding, explicit language-selection flow, trial integration, and publication review are pending. The pre-existing component-price-allocation blocker also remains unresolved; this pass creates no prices or component catalog entries. `release-history.json` preserves the previous local draft metadata and exact repository reference. Historical catalog hashes remain untouched.

## Clef integration status

`src/clef.js` uses Cloudflare's typed choice contract for inventory classification, candidate alignment and journey diagnostics. Each reading includes the model, contract version, question hash, request hash and source snapshot reference. Unknown is an explicit answer. Readings do not change catalog metadata, validate releases, settle payments or declare external deployment success.

`classify-inventory.mjs` runs operator-side classification with an existing Cloudflare account ID and API token authorized for Workers AI. It checkpoints readings separately from inventory. The source implementation has contract fixtures and gated resolver integration tests; live inference, calibration and deployed serving verification remain pending. The checked-in default has no AI binding or automatic model call enabled. Production configuration was not re-queried this pass.

Candidate alignment requires prefiltered candidates. Its model preference is not itself compatibility evidence. Journey diagnostics include only observed event types; missing events do not establish patron abandonment or failure. No buyer inputs, payment credentials or trial code enter that diagnostic reader.

Authoritative API: https://developers.cloudflare.com/workers-ai/models/clef-flash/

## Publication checks

The validator now checks inline component bytes against SHA-256 and byte length, and verifies the supported trial adapter. Review attestations remain necessary for original contribution, licensing and product quality; they do not replace byte verification. Reports are read-only and do not authorize promotion.

## Structured routing integration

The prepared `0004_routing_manifests.sql` migration adds immutable per-SKU/version routing records. It inserts no products or metadata. Reviewed manifests must be loaded before deploying the new resolver; no current product has been silently assigned a manifest.

HTTP `/api/resolve` and Cap’n Web `searchIntent(intent, limit, callbacks)` use the same structured resolver. `search(structuredIntent)` also uses it. Legacy `search(string)` retains its array-returning lexical discovery contract. Candidates from `searchIntent` include product capabilities; optional clarification callbacks request missing language/evidence. Compatibility covers explicitly declared structured requirements, not an unobserved external deployment.

The source routing workflow gates Clef selection and ranking on `CLEF_ROUTING_ENABLED=true` and an available AI binding. It forms a pool after exact identity and declared hard-constraint checks, before lexical pruning. The reader sees up to 20 informative, conflict-free candidates in deterministic score/SKU order; missing language or evidence is recorded separately. A valid typed choice at confidence 0.5 or higher can surface or promote only the exact supplied product/version before the result limit is applied. A chosen product with missing configuration returns only that candidate with `missing_configuration`, `matched: false` and explicit clarification questions. It never becomes purchase-compatible through a model choice. Unknown answers, lower confidence, invalid choices, provider errors, or timeout preserve the deterministic fallback, including `no_match`. Incompatible or uninformative requests make no model call. The 0.5 floor is a provisional local policy pending live evaluation. The default remains disabled until live inference and evaluation are verified; this pass makes no live model call.

Deployment remains pending inventory completion and acceptance testing. This branch must stay draft; the production workflow has not been run.
