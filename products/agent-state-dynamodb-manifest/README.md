# Agent state DynamoDB request package

Prepare exact AWS API inputs for an agent/session table and the optional features you select. This is an original Second Wind package for draft SKU `AWS-0568`; it is not published or priced for component purchasing yet.

```javascript
import {prepare} from './plan.mjs';
const plan = prepare({
  table_name:'agent-state-example',
  components:['table','status-index','expiry','recovery','change-stream']
});
```

The table uses string `agent_id` and `session_id` keys, on-demand billing, and the AWS managed DynamoDB KMS key. The optional status index projects keys only, limiting copied data. `expires_at` is an item attribute containing Unix epoch seconds; enabling TTL does not populate it or enforce immediate application expiration. Recovery enables point-in-time backups. Change streams include both old and new item images; choose that component only when those images are appropriate for the workload.

`prepare` returns JSON. Each step's `input` belongs to its named AWS operation. The whole plan is not a CreateTable request. Wait for ACTIVE before applying follow-up operations. The returned verification requests describe expected final state; asynchronous enablement may require polling. A client applying the plan must enforce the supplied wait budget and stop on unexpected AWS errors. The module itself never calls AWS, spends funds, or claims that a table exists.

The status index is a simple access pattern, not a tenant authorization boundary. Common status values can concentrate index traffic; assess workload cardinality before deployment. Existing-table migration, globally replicated tables, IAM role creation, and customer-managed KMS keys are outside this version's scope. AWS charges for resources you create are separate from the product purchase.

After an interrupted application, compare DescribeTable, DescribeTimeToLive and DescribeContinuousBackups with your chosen plan. Do not delete or recreate a table automatically. A name collision needs inspection; it is not successful recovery evidence.

Delivery consists of the JavaScript planner, JSON configuration schema, and these usage instructions. Only JavaScript orchestration is implemented. Other languages can consume the generated AWS API JSON, but no alternative language adapter is claimed.

## Sources and validation

Written by Second Wind under the repository's Apache-2.0 license. AWS API documentation supplies interface definitions; no AWS guide is repackaged as the product.

- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_CreateTable.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateTimeToLive.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateContinuousBackups.html

Tests verify selection boundaries, invalid inputs, stable output and operation ordering. AWS service-model shape validation is separate from an actual AWS deployment. No AWS deployment has been performed for this package.
