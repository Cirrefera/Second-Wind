# Approved catalog maximum payments

The owner approved these assignments on October 24, 2026 and authorized applying them. `products/pricing.json` is the explicit per-SKU schedule; [CATALOG_PRICING.csv](CATALOG_PRICING.csv) is its readable inventory. Stored historical prices were inputs for comparison, not evidence of prior commercial approval.

| Maximum USDC | Products | Assignment |
| --- | ---: | --- |
| 10.00 | 3 | Lambda, SageMaker and AgentCore bundles |
| 5.00 | 8 | Bedrock, DynamoDB, ECS, Step Functions, API Gateway, Glue and S3 bundles; AWS-0568 modular agent-state planner |
| 1.00 | 92 | Focused tools and substantive troubleshooting guides |
| 0.50 | 21 | Simple recipes and configuration helpers |
| 0.25 | 32 | Basic references and service overviews |

The retired SW-TEST-0001 proof listing is excluded. Classification sets maximums; it does not certify draft content, activate products, or promise capabilities absent from the deliverable. The catalog remains 155 draft, one live and one retired.

## Selected component amounts

AWS-0568 version 2 has a $5 maximum: table $2, status index $1, expiry $0.50, recovery $1 and change stream $0.50. Shares are 4000/2000/1000/2000/1000 basis points. All optional components retain their existing explicit dependency on the table. Existing scope code calculates only the chosen components and requires the buyer to choose dependencies; it does not silently add them. Sandbox use and acceptance do not charge. Standard Hono/x402 handles the later authorized purchase.

Both existing release-preparation inputs now use this schedule: AWS-0568 at $5 and SW-PT-0006 at $1. The package generators read the same schedule instead of copying historical price fields. Deliverable bytes and payload hashes are unchanged. Product publication/review prerequisites remain; pricing approval does not supply review attestations.

## Application evidence

The guarded `workers/gateway/operations/apply-approved-pricing.sql` updated 138 catalog rows; 18 active/draft rows already had their assigned value. It required the reviewed SKU/version/status set and allowed only the previous or approved price. It also required no immutable payload, component or routing registration for those versions. A changed inventory or registered release causes zero writes; it must not be bypassed. This is a one-time catalog operation, not a schema migration or a production-startup task.

Readback confirms all five tier counts, unchanged publication statuses, the retired proof listing unchanged at $0.01, and the live SW-PT-0006 maximum at $1. All 3 payment rows retain their prior $0.14 combined price; all 10 historical acceptance records retain their prior combined 902000 atomic-unit amount. The operation only updates `items.price_usd` and `items.updated_at`, and no item-update triggers exist. Existing purchase snapshots and recovery records are untouched.

The source check confirms both candidate inputs remain structurally ready and publication-blocked, their exact payload/files remain unchanged, and the existing component allocator produces 2000000/1000000/500000/1000000/500000 atomic units. No new test suite or test execution was added.
