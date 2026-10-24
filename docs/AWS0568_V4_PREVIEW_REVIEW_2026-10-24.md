# AWS-0568 v4 protected preview review

This is a source, contract, and release-metadata review of the AWS-0568 version 4 draft. It is not an independent human review, legal opinion, new sandbox execution, or AWS deployment. V4 is a draft and remains inactive. It derives from the pinned immutable v3 release input. V3 release bytes, prices, allocations, purchase snapshots, and previously issued payloads remain unchanged.

## Release identity

The exact identities are:

- Pinned v3 source input SHA-256: `2ddda65a09c19b38c171dbd45ee2b24d521dc575d39f604bd32126d432b6fc01`
- V4 release reference and payload SHA-256: `sha256:12189231ae8d6796fa6a55713eb40fc8eea3cfb766dee756e265febe91f0d1e3`
- Canonical manifest SHA-256: `b648805a93d1ade2f56e55e89e40e27f0061eb59095914889f4698e86a979e56`
- Canonical routing SHA-256: `5af4442598f7d05d04a4864ea1e6fa56a8680d2a8cc7a3716fa0fea8b44ddf2f`
- Release-input SHA-256: `cf46075ac113a1b83bb850763fb13fbc960441139ef1cb3aa2d12f4151b54827`
- Updated README SHA-256: `f4babbc63410fa5dd65cacfff2bdc3749df2824c283cae8d4c95cd07c6be1546`

The package retains its 13-file inventory and changes only the delivered README bytes. Planner and feature source, schemas, license, language file mappings, product prices, component allocations, and purchase shares match v3.

## Preview and access contract

The manifest declares the trusted `dynamodb-plan-summary-v1` adapter in `bounded-diagnostics` mode. The adapter executes JavaScript. A Python delivery selection is previewed through the JavaScript planner and is not Python execution; the result identifies `execution_language` as `javascript` and reports the configured `delivery_language` separately. The allowed summary fields are `ok`, `configuration_valid`, `selected_components`, `operation_count`, `verification_count`, `runtime_supported`, `code`, `execution_language`, and `delivery_language`.

Each new trial requires a separate $0.01 x402 sandbox-access payment, even if no product purchase follows. HTTP preparation returns the x402 challenge; Cap'n Web preparation returns a public acceptance with its payment URL. The payment retry uses `X-Recovery-Token` equal to the original private `trial_token`. Repeating or recovering the same trial identity is free. The access fee is independent from the product purchase, does not include a product grant or source delivery, and does not change the $5 product maximum or any component allocation.

The buyer's JavaScript runs in the Code Mode sandbox with only `codemode.preview()`, `codemode.components()`, and `codemode.configuration()`. The trusted adapter privately loads the selected product JavaScript files and returns bounded diagnostics. No product module, source file, README/cookbook content, full generated plan, operation input, or arbitrary log/error text is exposed to buyer code or in the preview result. Python source remains available in the separately paid product delivery; a Python delivery configuration is previewed through JavaScript and reports that delivery language separately.

## Source and evidence

The JavaScript and Python planner/feature bytes and their existing source-validation hashes are unchanged from v3. Existing offline evidence reports 16 feature combinations per language, 32 plans, 160 operation inputs, and 64 partial response shapes against botocore 1.43.114. That evidence concerns unchanged planner source only; it is not fresh evidence for the v4 adapter or payment route. Subsequent integrated verification is recorded below; the original source review itself did not run the v4 adapter.

The v4 README describes the separate one-cent access fee, free recovery of the same preview, bounded private adapter, and distinction between JavaScript preview execution and Python delivery. The component prices and maximum remain unchanged.

## Preservation and remaining gate

V3 remains an immutable historical release. Existing v3 purchase snapshots and delivery objects continue to resolve to v3 content; v4 is a separate release identity for new purchases. Do not mutate or overwrite v3 records while registering v4.

The protected adapter has now executed in the real local Dynamic Worker runtime (Miniflare/workerd), across all 16 component selections for both delivery-language settings. It returns JavaScript execution evidence and the chosen delivery language separately. The existing integration check confirms buyer-controlled code cannot import product modules, read source files, obtain the complete plan, or access gateway secrets. This is local runtime evidence, not a production paid trial or an AWS deployment.

The integrated gateway suite passed 233 existing cases. Its updated trial cases exercise the official Hono/x402 lifecycle with a synthetic facilitator: exactly 10,000 USDC atomic units for admission; incorrect amount rejection; no product files in admission delivery; no execution without settlement; immutable credentials/inputs; concurrent acceptance convergence; result recovery without re-execution; and optional, separately charged selected-file purchases. Existing telemetry cases include the separate admission payment while retaining private-content exclusion and durable event behavior. No new test suite was introduced.

Both builds, Pages selfchecks and 34 existing release-acceptance cases passed. Production activation remains ordered after compatible gateway deployment and identity readback. No funded production settlement is claimed. Publication approval is the user's instruction to continue the approved implementation and release plan.
