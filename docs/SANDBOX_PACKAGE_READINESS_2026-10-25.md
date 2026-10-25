# Sandbox package readiness — 2026-10-25

The 71 remaining sandbox-eligible products have authored release drafts. This is **not** a completed hosted rollout. The approved set remains exactly 72 products: the existing `agent-state-dynamodb-manifest` release plus these 71 drafts. No other product becomes sandbox eligible, and none of these drafts is activated by this change.

## Live buyer identity

[PR 24](https://github.com/Cirrefera/Second-Wind/pull/24) replaced numeric product identifiers in service-owned buyer metadata with descriptive slugs across HTTP discovery, OpenAPI, configuration, trial, receipt and Cap'n Web responses. Existing numeric URL/input aliases still resolve. Internal storage keys, signed payment data, immutable historical records and purchased artifact bytes are preserved.

[PR 25](https://github.com/Cirrefera/Second-Wind/pull/25) updated production acceptance to join discovery and component URLs by slug. Deployment and production acceptance [40144539417](https://github.com/Cirrefera/Second-Wind/actions/runs/40144539417) succeeded for Worker version `936c77ea-c192-43c6-a258-a2942315da15`.

Live readback found no `AWS-0568` in `/api/tools`, `/openapi.json`, `/llms.txt`, `/.well-known/x402`, or `/api/products/agent-state-dynamodb-manifest/components`. A configured request to `/api/trials/access` reached the official x402 challenge for `sandbox-preview`, described as `Sandbox preview: agent-state-dynamodb-manifest`, with amount `10000` atomic USDC ($0.01). That readback did not submit a funded payment.

The official x402 Hono seller example uses a descriptive `GET /weather` resource; Cloudflare's example uses `/premium`. These examples support descriptive resource names. They do not require changing the approved `@x402/hono` payment middleware.

- https://docs.x402.org/getting-started/quickstart-for-sellers
- https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-http-content/

## Authored product coverage

Six Luna workers authored the packages and separate private preview entrypoints. Release preparation checks inline file bytes, payload identities, schemas, component allocation and routing consistency. Its `source_ready` result does **not** certify functional completeness, service success, hosted compatibility or publication approval.

The final per-product inventory is [sandbox-package-readiness-2026-10-25.json](sandbox-package-readiness-2026-10-25.json). It records the exact manifest hash, approved maximum price, example validity, disk/package byte agreement, current private-adapter compatibility and remaining blocker. Internal SKU keys in this operator inventory are intentional; they are not public routing names.

| Family | Drafts | Evidence and remaining work |
| --- | ---: | --- |
| Powertools | 6 | Real pinned SDK entrypoints exercised with local fixtures. Batch also ran through the private Workerd adapter, using the purchased batch-handler module and synthetic SQS-shaped records. The other five require native Node integration. |
| CDK | 47 | Real reusable builders and private synthesis entrypoints. Local synthesis is not AWS deployment. The current hosted adapter does not provide the required CDK runtime. Knowledge Base OpenSearch and Aurora provider bundling additionally needs Docker; its Pinecone branch synthesized without contacting the external service. |
| cfn-lint | 1 | Real native validation exercised on valid and invalid templates. Hosted Python integration remains absent. |
| Ruby | 2 | Native Ruby SDK entrypoints authored; Ruby execution was unavailable and remains unverified. |
| Chalice | 2 | Native packaging/policy generation ran on an earlier revision. The final offline hardening revision has not been rerun; native re-verification and hosted runtime integration remain required. |
| Claudia | 2 | Native local packaging/API-builder entrypoints authored. Deployment is not simulated; no AWS deployment occurred. Hosted runtime integration remains absent. |
| awswrangler | 4 | Real SDK paths authored. Require buyer-controlled S3/Athena/Glue/Redshift resources and credentials. No service operation was executed. |
| Bedrock | 3 | Real SDK paths authored. Require provisioned resources, model permissions and credentials. No inference or resource provisioning was executed. |
| AgentCore | 3 | Native SDK entrypoints authored. Require a compatible runtime and buyer-controlled service resources. No service execution was performed. |
| MinIO | 1 | Service health entrypoint authored. Requires a running service/runtime, plus separate review of the archived upstream and AGPL license. |

Automatic approval review rejected later Chalice native reruns because SDK startup could probe credentials or instance metadata. The final source now initializes the SDK client lazily, restricts subprocess environment inheritance and disables instance metadata access. Static review and package verification succeeded; the rejected native action was not retried, and the report does not carry the earlier native success forward as proof of the final revision.

The SageMaker draft supports a pinned JumpStart catalog key or an explicit custom model image/artifact, existing VPC subnet/security-group IDs, and caller-selected production variants, KMS key and network isolation. Both modes synthesized locally; the generated templates were inspected for model references, VPC settings, configuration fields and endpoint name/ARN outputs. Its JSON interface does not expose every CDK endpoint-configuration feature (for example, async inference or data capture). This scope is documented rather than presented as arbitrary `EndpointConfig` compatibility.

## Private preview boundary

The draft adds `js-product-entrypoint-v1` to the existing private preview adapter. Only an approved sandbox SKU with a compatible contract can enter it. It verifies package file hashes, follows a fixed `preview.mjs` local import closure, forbids unresolved external imports and outbound access, and returns only bounded status/count/diagnostic fields. Product modules remain private and are not exposed to buyer-authored Code Mode. See [runtime constraints](PRIVATE_PREVIEW_RUNTIME_CONSTRAINTS.md).

Powertools Batch is the only new draft currently compatible with that adapter. Its Workerd run called the purchased `createSqsBatchHandler`, ran the pinned Powertools processor against two synthetic records, and returned a bounded error count of one. It did not call AWS. Compatibility is a candidate property: Batch is **not published or live**.

The other 70 drafts fail hosted preview availability before payment. Their native entrypoints must be integrated into a real private runtime and verified with their actual dependencies. Cloudflare supports capabilities beyond this particular adapter; this report describes the implemented gateway boundary, not a platform-wide impossibility claim.

## Unchanged commercial and release authority

- Standard `@x402/hono` verification and settlement remain the payment rails.
- A new sandbox trial costs $0.01; product purchase is optional and separate. Existing recovery and accepted purchase URLs remain supported.
- `products/pricing.json` remains the approved maximum-price source. The 72 approved entries were compared with live D1 prices with no differences.
- `products/publication.json` is unchanged and activates only the already-reviewed DynamoDB manifest release. This draft does not write product payloads to R2, activate catalog rows or deploy a native runner.
- No review records were fabricated. Source preparation and CI do not substitute for product, license, payment-boundary or publication review.

## Remaining completion conditions

1. Complete native product review against each catalog promise, including the SageMaker foundation/custom-model configuration and outputs.
2. Integrate real private runtimes for the native product families while preserving the single application Worker, Code Mode/Cap'n Web boundaries, bounded outputs and the approved SKU allowlist.
3. Verify native entrypoints on the exact final package bytes. Exercise service-backed products only against explicitly provisioned buyer-controlled resources; never report fixture success as service success.
4. Stage immutable payloads, obtain the existing required release reviews, and activate only compatible products. Before charging, discovery and trial admission must agree on language, configuration, selected components and runtime availability.
5. Confirm the penny challenge, one paid execution, response-loss recovery without repeat execution or repeat charge, and no source leakage for each newly activated family.

Until these conditions are met, [PR 26](https://github.com/Cirrefera/Second-Wind/pull/26) remains a draft and the 71 packages remain unpublished.
