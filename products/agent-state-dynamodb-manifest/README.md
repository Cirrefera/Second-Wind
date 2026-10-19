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

`prepare` returns JSON. Each step's `input` belongs to its named AWS operation. The whole plan is not a CreateTable request. Wait for ACTIVE before applying follow-up operations. The returned verification requests describe expected final state, including the table keys and attribute types, KMS encryption, and the selected index or stream. These are declarative expectations for a caller to check, not an implemented response validator. In `checks`, dotted keys locate response fields, nested objects specify required fields, and arrays are compared without order: match attributes by `AttributeName`, keys by `KeyType`, and indexes by `IndexName`. Ignore additional AWS response fields such as counters and ARNs. Asynchronous enablement may require polling. The supplied 600-second wait budget applies only to initial table activation; callers must choose a separate bounded policy for TTL and backup verification. A client applying the plan must enforce the supplied wait budget and stop on unexpected AWS errors. The module itself never calls AWS, spends funds, or claims that a table exists.

The status index is a simple access pattern, not a tenant authorization boundary. Common status values can concentrate index traffic; assess workload cardinality before deployment. Existing-table migration, globally replicated tables, IAM role creation, and customer-managed KMS keys are outside this version's scope. AWS charges for resources you create are separate from the product purchase.

After an interrupted application, compare DescribeTable, DescribeTimeToLive and DescribeContinuousBackups with your chosen plan. Do not delete or recreate a table automatically. A name collision needs inspection; it is not successful recovery evidence.

Delivery consists of the JavaScript planner, JSON configuration schema, and these usage instructions. Only JavaScript orchestration is implemented. The planner does not implement an explicit language-selection flow; the draft candidate records that integration as pending. Other languages can consume the generated AWS API JSON, but no alternative language adapter is claimed.

## Sources and validation

Written by Second Wind under the repository's Apache-2.0 license. AWS API documentation supplies interface definitions; no AWS guide is repackaged as the product.

- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_CreateTable.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DescribeTable.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateTimeToLive.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateContinuousBackups.html

Run `node --test scripts/plan.test.mjs` from this directory. Tests verify all 16 selection boundaries, invalid inputs including sparse component arrays, stable output, operation ordering, and the declared final-state expectations. Reproduce AWS model validation with botocore 1.43.114 available to Python: `python scripts/validate-aws.py`, then regenerate draft file hashes with `node scripts/package.mjs`. AWS service-model shape validation is separate from an actual AWS deployment. No AWS deployment has been performed for this package.

`release-candidate.json` is draft packaging metadata, not a gateway publication manifest or an immutable R2 delivery receipt. The catalog's historical upstream attribution does not establish provenance for this original replacement; publication requires a separate reviewed contract and provenance decision. `release-history.json` retains the prior local draft metadata and its repository reference.
