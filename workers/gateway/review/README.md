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

## Prepared AWS-0568 version 2

The historical row promises a direct CreateTable manifest with TTL and point-in-time recovery, but contains only prose and a structured `slug` marker. TTL and point-in-time recovery use their separate AWS operations. The original catalog attribution to `awslabs/amazon-dynamodb-tools` has no verified revision/file/license mapping in the held export.

`products/agent-state-dynamodb-manifest/release-input.json` now contains a self-contained original Second Wind draft version 2 package: 13 actual UTF-8 files, an explicit-language configuration schema, separate feature modules, a gateway release manifest, exact routing metadata, historical source identity, and five unpriced component definitions. The JavaScript and Python planners independently generate equal API plans for all 16 feature selections. They separate CreateTable, TTL and recovery operations, and declare expected final state for keys, attribute types, KMS encryption, and chosen optional features. Saved configuration contains only language and table name; imported feature modules determine the plan, allowing a buyer to reuse configuration after selecting a smaller file set. Base-only packages run with optional source files physically absent.

Node/Python behavior tests pass. AWS-owned botocore 1.43.114 service models validate 160 operation inputs and 64 partial response shapes across both variants. These checks do not establish an AWS deployment or implement a response matcher. Actual local gateway source preparation accepts the complete release with no source blockers. Local SQLiteD1/MemoryR2 acceptance tests stage the exact payload and source input while retaining historical catalog hashes. Those tests are not a production R2 upload receipt.

The full historical price remains $0.50. Component IDs, dependencies and actual files are prepared, but no basis-point shares or new prices are invented. Commercial component selection stays blocked until the missing allocation is supplied. The candidate remains draft pending trusted product, contract, routing, language, source/license, purchase-URL and publication reviews, and explicit immutable production staging. `release-history.json` preserves both prior local metadata versions and exact repository references. No live publication was changed.

## Corrected SW-PT-0006 version 2

`products/lambda-powertools-idempotency` preserves the exact historical live version 1 catalog row and guidance under `history/`. A separate draft version 2 contains 9,572 bytes of corrected guidance, including a complete tested Python example. It explicitly supports Python 3.12 with Powertools 3.36.0, boto3 1.43.114 and botocore 1.43.114. Other language variants from the historical guidance are not claimed by this release. The existing full-product price remains $0.10.

Seven tests execute the actual Powertools decorator and DynamoDB adapter with deterministic fake I/O. They cover completed replay, payload mismatch, malformed input, overlapping invocation, expiration, explicit language choice and a failure after an external side effect. The latter demonstrates why this library cannot guarantee one external charge across an uncertain provider outcome. The corrected guidance passes a durable business key to a buyer-supplied payment function and requires downstream provider idempotency and reconciliation. No AWS deployment or payment processor was called.

Actual local source preparation accepts its exact guidance, routing and source history with no source blockers. Local staging acceptance tests retain the entire live version 1 row while staging version 2. Trusted guidance, contract, routing, language, source/license and publication reviews, verified purchase URL, and immutable production staging remain pending. Source inspection pins the upstream revision, four consulted interface/example files and their exact hashes; this evidence does not self-issue a licensing attestation.

Run `node review/verify-source-preparations.mjs` from `workers/gateway` to reproduce `prepared-product-evidence.json`. It compares delivered bytes with the actual local source files, rejects stale validation hashes, invokes read-only gateway preparation for both products, and records the exact remaining publication blockers. It requires source readiness and correctly refuses to describe an unattested, unstaged candidate as publication-ready.

## Complete source-corpus inspection

`corpus-source-inspection.json` covers all 157 held records. `public-source-cache.json` pins all 18 referenced public repositories, tree identities, relevant exact path entries and root license/notice bytes. It records 86 found path pointers and five absent pointers in the inspected pinned trees. The old `cdklabs/generative-ai-cdk-constructs` location returned 404; a separately recorded primary-source lookup resolves its public location to `awslabs/generative-ai-cdk-constructs`. Historical catalog fields are preserved.

The five stale paths are AWS-0558 `src/cdk-lib/sagemaker`, AWS-0672 `src/chalice`, AWS-0677 `src/util/convert-api-gw-proxy-request.js`, AWS-0680 `docs/bucket-versioning/README.md`, and AWS-0686 `rag-solutions/`. Absence at these exact revisions is not a claim that no replacement exists. Selecting replacement files and verifying their relationship to the promised product remain product work.

The remaining 154 draft listings require actual product construction or substantive review: 50 artifacts need curated runnable files and dependency/build/license mapping; 49 legacy tool pointers need a resolved guidance-versus-invocation contract and the promised implementation; 38 guides need claim/source and quality review; five SW-RR execution promises need real callables and validation/failure contracts; 12 bundles need exact versioned member releases and entitlements. Public upstream source is present for most pointers, but pointing at a library or repackaging it does not complete the curated product contract. The retired test record remains historical. This pass has prepared two real candidates; it has not declared the entire inventory implemented or publication-ready.

Regenerate source inspection offline from the pinned cache with `python review/inspect-source-corpus.py /path/to/inventory-reverified-2026-10-19.json` from `workers/gateway`. `--fetch` explicitly refreshes public GitHub evidence. The reverified export has the preserved canonical snapshot hash. The earlier `live-inventory.json` contains equal SKU-keyed records in a different array order and consequently has a different canonical array hash; these inputs are not substituted silently.

## Clef integration status

`src/clef.js` uses Cloudflare's typed choice contract for inventory classification, candidate alignment and journey diagnostics. Each reading includes the model, contract version, question hash, request hash and source snapshot reference. Unknown is an explicit answer. Readings do not change catalog metadata, validate releases, settle payments or declare external deployment success.

`classify-inventory.mjs` runs operator-side classification with an existing Cloudflare account ID and API token authorized for Workers AI. It checkpoints readings separately from inventory. The source implementation has contract fixtures and gated resolver integration tests; live inference, calibration and deployed serving verification remain pending. The checked-in default has no AI binding or automatic model call enabled. Production configuration was not re-queried this pass.

Candidate alignment requires prefiltered candidates. Its model preference is not itself compatibility evidence. Journey diagnostics include only observed event types; missing events do not establish patron abandonment or failure. No buyer inputs, payment credentials or trial code enter that diagnostic reader.

Journey diagnostics accept the actual current event registry while retaining legacy event names. The state projection includes only event types and enumerated discovery resolution, clarification response and configuration statuses. Explicit no-match, delivery response preparation and payment receipt issuance remain distinct observed outcomes; no client receipt, consumption or external deployment is inferred.

Authoritative API: https://developers.cloudflare.com/workers-ai/models/clef-flash/

## Publication checks

The validator now checks inline component bytes against SHA-256 and byte length, and verifies the supported trial adapter. Review attestations remain necessary for original contribution, licensing and product quality; they do not replace byte verification. Reports are read-only and do not authorize promotion.

## Structured routing integration

The prepared `0004_routing_manifests.sql` migration adds immutable per-SKU/version routing records. It inserts no products or metadata. Reviewed manifests must be loaded before deploying the new resolver; no current product has been silently assigned a manifest.

HTTP `/api/resolve` and Cap’n Web `searchIntent(intent, limit, callbacks)` use the same structured resolver. `search(structuredIntent)` also uses it. Legacy `search(string)` retains its array-returning lexical discovery contract. Candidates from `searchIntent` include product capabilities; optional clarification callbacks request missing language/evidence. Compatibility covers explicitly declared structured requirements, not an unobserved external deployment.

The source routing workflow gates Clef selection and ranking on `CLEF_ROUTING_ENABLED=true` and an available AI binding. It forms a pool after exact identity and declared hard-constraint checks, before lexical pruning. The reader sees up to 20 informative, conflict-free candidates in deterministic score/SKU order; missing language or evidence is recorded separately. A chosen product with missing configuration returns `missing_configuration`, `matched: false` and explicit clarification questions. It never becomes purchase-compatible through a model choice. Incompatible or uninformative requests make no model call.

Candidate alignment now submits Choice and an independent `answer_exists` Noul in one existing Clef Flash call. Code vetoes only evaluated candidates when existence is below 0.35; promotion requires existence at least 0.7 and Choice confidence at least 0.5. Intermediate support, unknown without a negative existence reading, invalid output, failure and timeout retain deterministic fallback. Successful readings expose evaluated/eligible counts, completeness and negative scope; partial-pool absence is not a global semantic no-match. These thresholds remain uncalibrated.

`scripts/evaluate-routing.mjs` and `tests/fixtures/routing-evaluation.json` provide 34 fixed cases using the exact corrected draft version 2 item/routing metadata. `--deterministic` passes 34/34 with zero model calls; `--fixture` passes 34/34 with 24 scripted calls. Against separate semantic target labels, the deterministic baseline has six unsupported-candidate cases and two missing intended routes. Scripted success validates wiring only. `--live` is prepared for an existing authorized Cloudflare account/token, but was not run. No live semantic quality or serving claim is made. The checked-in default remains disabled.

Deployment remains pending inventory completion and acceptance testing. This branch must stay draft; the production workflow has not been run.
