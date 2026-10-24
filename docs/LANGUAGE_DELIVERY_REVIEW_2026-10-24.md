# AWS-0568 v3 language-scoped delivery review

This is a source and release-metadata review of the AWS-0568 version 3 draft. It was prepared by Codex under the repository owner's instruction; it is not an independent human review, legal opinion, production trial, or runtime validation of the v3 allowlist behavior. The release remains a draft. This review preserves the existing version 2 payload, input, component release, purchase records, and review evidence without changing them.

## Exact release identities

- SKU/version: `AWS-0568` / `3`
- Release reference and payload SHA-256: `sha256:088904ab15e2a0b2419e3cc18a3c134c3ba1dab8e631e4190dd963308f05272c`
- Canonical manifest SHA-256: `0793a18bd81cf1cc3ce6f2a097ef8f05b1c9ec54963f41b408a77c0a94dde9a9`
- Canonical routing manifest SHA-256: `33a8217008572534ae05610b1772e857cc9309718562344796fc354e7ae75850`
- Release input file: `products/agent-state-dynamodb-manifest/releases/v3/release-input.json`

The v3 file package contains 13 source/documentation files. Its package bytes contain both supported language implementations so that the immutable inventory and component release remain complete. Each component additionally carries a complete `files_by_language` path allowlist. The v3 release is versioned separately; no v2 payload, manifest, purchase snapshot, or published object was rewritten or replaced.

## Service, contract, and product

The JavaScript and Python table planners independently build the same base request shape: string `agent_id` and `session_id` keys, on-demand billing, and AWS-managed KMS. The optional status index adds a keys-only `status-index` GSI. Expiry requests TTL activation for `expires_at`; recovery requests point-in-time recovery; change stream requests `NEW_AND_OLD_IMAGES`. Each optional component depends on `table`. The planners prepare requests and verification expectations; they contain no AWS SDK calls, credentials, subprocess execution, network access, or response-matching implementation.

I inspected the v3 mapping against each component's complete `files` inventory. The `table` allowlists each include the matching planner, shared selection schema, README, and Apache license. Every optional feature maps its JavaScript implementation to `javascript` and its Python implementation to `python`. Each language list is nonempty and contains only paths present in that component. This is a source-level inspection of the mapping; no v3 selector, package extraction, Code Mode, or Python runtime was executed during this review.

The saved configuration requires `language` and `table_name`, and the planner sources reject a missing or unsupported language. The Code Mode sandbox remains JavaScript-only; Python source is delivered for buyer-controlled use and is not represented as executing in Code Mode.

## Source validation and runtime evidence limits

The existing `products/agent-state-dynamodb-manifest/validation.json` reports 16 combinations per language, 32 plans, 160 operation inputs, and 64 partial response shapes against botocore 1.43.114. Its pinned planner, feature, and schema source hashes match the files inventoried in v3. The package's executable source bytes are unchanged. I also inspected each v3 allowlist against its complete component inventory, confirming the listed paths and explicit language partition statically. This review transfers the existing offline source-validation evidence to the identical source bytes while distinguishing the new mapping review; no new mapping tests or runtime checks were run. It does not show Python execution in Code Mode.

No v3 sandbox trial was run for this review. The existing `trials.js` implementation constructs the trial module set from the full immutable `component.files` inventory, filtering JavaScript modules independently of the delivery allowlists. V3 retains those component inventories and exact JavaScript bytes unchanged. The existing v2 Dynamic Worker evidence cited in `docs/PRODUCT_RELEASE_REVIEW_2026-10-24.md` covers all 16 JavaScript feature packages in that same trial path. This review transfers that evidence to the byte-identical JavaScript trial inventory; it does not claim a new v3 execution, validate the new allowlists dynamically, or show Python execution in Code Mode.

## Origin and license mapping

The v3 payload's 13 paths are the original Second Wind planners, feature modules, selection schema, README, and checked-in Apache-2.0 license. The source files' hashes match the v2-reviewed source inventory and `source-provenance.json`; no AWS SDK or DynamoDB Tools implementation is included. The checked-in license is included in the base table component's shared files and therefore in either language's selected table package. This is a source-level mapping assessment, not a universal originality guarantee or legal certification.

## Routing and buyer-flow limits

The v3 route metadata identifies offline DynamoDB request planning and explicitly selects `javascript` or `python`. Its supported boundary excludes AWS execution, response matching, existing-table migration, IAM provisioning, global tables, customer-managed KMS, and immediate TTL deletion. This review confirms metadata consistency with inspected source; it is not evidence of a completed purchase, payment, or public activation.

The v3 selector implementation must be deployed before activation so the buyer's selected language is honored. The v3 release has not been staged or activated by this review. The publication record is prepared separately and must only be used after the compatible gateway deployment has succeeded and its identity has been read back.

The existing shared `/api/x402/:key` purchase route supports the configured method for the accepted purchase and returns the exact purchased artifact through authenticated delivery. This is a source review of route availability only; it does not assert a funded transaction or production URL readback.

## Remaining release gates

The source, manifest, routing, product, contract, license, validation, and sandbox-trial review records are bound to the exact v3 manifest or routing hash in `products/agent-state-dynamodb-manifest/releases/v3/publication-reviews.json`. The validation and sandbox-trial records explicitly rely on unchanged source and trial inventories, plus the static mapping inspection above. They do not claim new runtime evidence for allowlist selection or Python execution. The v3 release still requires deployment of the compatible gateway before the prepared activation record is used.
