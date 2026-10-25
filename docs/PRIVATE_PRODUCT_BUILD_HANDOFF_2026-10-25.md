# Private product implementation checkpoint — 2026-10-25

This is implementation work on `work/build-remaining-products`, based on production commit `8b6d9425024dbd49b74f10cbd29eea7110479b21`. It is not a production readiness or publication approval. No product was activated and no new runtime asset was uploaded to production during this build pass.

## Built and executed

All 49 remaining JavaScript/TypeScript products now compile separately using their own source and pinned npm dependencies. All 49 were executed once in local workerd, with outbound access disabled, after applicable fixes. 45 currently return successful bounded diagnostics. The other 16 of the 65 products have native source materialized but no completed hosted interpreter adapter. They are not counted as runtime builds.

The exact input, source, builder and module hashes, execution results and unresolved products are in `private-product-build-progress-2026-10-25.json`. Reuse this evidence for unchanged artifacts. Do not rerun the audit or claim a generic pass covers another product.

Four JavaScript/TypeScript previews remain blocked: Bedrock Knowledge Base CDK, SageMaker Endpoint CDK, S3 Deployment CDK, and EKS CDK. Their source has native asset or synthesis requirements to resolve. The failed preview result alone is not a precise diagnosis of each underlying exception.

## Implemented changes

- Hash-addressed private runtime descriptors and byte-verified R2 staging/loading, separate from the old 512 KiB inline preview package limit. New limits: 64 modules, 32 MiB per module, 48 MiB total. Actual current bundles are under 35 MiB. This requires production resource-budget validation before activation.
- Whole-product previews preserve whole-product pricing and use an empty component selection. Existing component purchases, one-cent admission, and saved-result recovery retain their existing paths.
- The trusted publisher rebuilds new runtime artifacts, compares the full descriptor with the reviewed manifest, then stages and reads back exact R2 bytes. No public upload or execution-administration endpoint was added.
- CDK validator Wasm is loaded as a Worker Loader Wasm module; pinned validator rules and product support files are installed in request-local storage. Node.js Lambda preview uses the real handler compiled ahead of time and the pinned CDK NodejsFunction code option, avoiding a subprocess during a preview.
- Repaired Cognito's local-directory dependency lock and generated missing exact npm locks for the two Node.js tool packages.
- Customer-facing names are **Node.js Lambda Deployment Kit** (AWS-0676) and **Node.js Resource API Kit** (AWS-0677). The upstream tool name is retained only as dependency/attribution information and stable internal identifiers. Both private previews execute successfully locally; the resource API callback context was corrected to match its actual pinned SDK.
- Both Ruby products now have explicit R2 client constructors using the official S3 SDK, R2 credentials, the account endpoint, and region `auto`. Changes are frozen into new draft payload versions; this does not claim hosted Ruby execution or live R2 operations.

The gateway bundle builds. The 31 existing checks in publication, release-preparation, trials, and catalog passed after the gateway changes. No new test suite was created. Final publisher wiring received syntax validation; it has not performed a live publication.

## Continue implementation

1. Resolve the four remaining JavaScript/TypeScript previews using their actual product dependencies and assets. Retain unchanged successful execution evidence.
2. Complete the 16 interpreter/service-specific private adapters: two Chalice, one cfn-lint, two Ruby, one MinIO, four awswrangler, three Bedrock and three AgentCore. Python Dynamic Workers are documented; vendored dependencies and native extension compatibility still need implementation.
3. Freeze final runtime descriptors into release manifests, review the resulting source and behavior, then use the existing publication path. Current compile reports do not populate release approval fields.
4. Preserve the 72 eligible / 85 excluded policy and all approved prices. Trial access remains $0.01 for a new execution; saved-result recovery is free.

## Reference supplied by the user

AWS Core is reference only. Keep infrastructure on Cloudflare. The R2 SDK examples establish S3 client interoperability; they do not establish that Rust, Kotlin, Go or Ruby execute natively in a Worker. Apply supported operations and options individually. The Ruby wrapper's basic PutObject/GetObject/DeleteObject calls correspond to implemented R2 APIs.

- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-ruby/
- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-rust/
- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-kotlin/
- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-go/
- https://developers.cloudflare.com/r2/api/s3/api/

Local generated bundles live under `.private-builds/` and are excluded from git. They are reproducible from source and locks; do not assert they exist in R2 until uploaded and read back.

## Follow-up implementation

The API Gateway/Lambda/DynamoDB private preview now synthesizes 41 resources using the five real handlers compiled before execution. Native buyer deployment retains its normal bundling default. The freeze command now includes files held in component definitions; previously it could omit these when creating a new draft. This execution still emits upstream runtime deprecation warnings, recorded with the result. No release activation occurred.
