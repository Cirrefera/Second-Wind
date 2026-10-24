# Agent state DynamoDB request package

Prepare exact AWS API inputs for a new agent/session table and the optional features you select. This original Second Wind release candidate for `AWS-0568` version 2 contains working JavaScript and Python planners. Every request must explicitly select `language`; missing and unsupported languages fail. No other delivery language is implemented. This offline request planner does not create a table, invoke AWS, or establish that a deployment succeeded.

The `table` component includes the planner, configuration schema, instructions, and license. Each optional component supplies a separate module in both supported languages and requires `table`. A base-only package runs without optional modules. Your saved configuration contains only language and table name; the separately selected feature modules determine the plan. This lets you test the full product, select a smaller file set, and reuse the same configuration. The maximum payment is $5: table $2, status index $1, expiry $0.50, recovery $1 and change stream $0.50. Sandbox use and selection are free. Select the table and only the optional components you want to purchase; x402 collects the selected amount after acceptance.

JavaScript (tested with Node.js 24):

```javascript
import {prepare} from './planner.mjs';
import {feature as expiry} from './features/expiry.mjs';
const plan = prepare({
  language:'javascript',
  table_name:'agent-state-example'
}, [expiry]);
```

Python (tested with Python 3.12):

```python
from planner import prepare
from features.expiry import feature as expiry
plan = prepare({
    'language': 'python',
    'table_name': 'agent-state-example',
}, [expiry])
```

The hosted Code Mode sandbox runs JavaScript only. Use the JavaScript planner to exercise feature combinations there. Python source is available for inspection and delivery, and its existing offline validation is recorded separately; a JavaScript sandbox result is not evidence of executing Python. Each selected component includes both implementations. Your configuration selects which implementation you use.

Optional module names are `status-index.mjs` / `status_index.py`, `expiry.mjs` / `expiry.py`, `recovery.mjs` / `recovery.py`, and `change-stream.mjs` / `change_stream.py`. Import each chosen module's `feature` and pass those modules as the second argument. Use `prepare(config)` for a base-only table. Output `components` records exactly the module IDs used. Order does not change the generated plan. Unsupported, duplicate or malformed modules fail. `selection.schema.json` describes the saved configuration. `plan.mjs` and `config.schema.json` retain the earlier local API for historical compatibility; they are excluded from the new delivered package.

The table uses string `agent_id` and `session_id` keys, on-demand billing, and the AWS managed DynamoDB KMS key. `status-index` adds a GSI keyed by string `status` and `session_id`, projecting keys only. `expiry` enables TTL for `expires_at` through **UpdateTimeToLive** after table activation. TTL does not populate item expiration values, delete immediately, or enforce application access rules. `recovery` enables point-in-time recovery through **UpdateContinuousBackups** after activation. `change-stream` enables old and new item images in CreateTable; assess whether exposing these images fits your workload.

Each step's `input` belongs to its named AWS operation. The whole plan is not a CreateTable request. Wait for ACTIVE before follow-up operations. The initial activation wait budget is 600 seconds with 5-second polling. A caller must enforce that budget, stop on unexpected errors, and choose a separate bounded verification policy for asynchronous TTL and backup enablement.

The generated `verification` requests declare expected table keys, attribute types, KMS encryption, and selected optional features. They are expectations, not an implemented response matcher. Dotted keys identify response fields; objects specify required fields; compare attribute arrays by `AttributeName`, keys by `KeyType`, and indexes by `IndexName`, independent of order. Additional AWS fields such as counters and ARNs are not part of the checks.

The status index is an access pattern rather than a tenant authorization boundary. Common status values can concentrate index traffic. Existing-table migration, global tables, IAM role creation, and customer-managed KMS keys are outside this release. AWS charges for resources a buyer creates are separate from the product purchase. After an interrupted application, inspect DescribeTable, DescribeTimeToLive and DescribeContinuousBackups. Never automatically delete or recreate an existing table; a name collision does not prove successful recovery.

## Sources and verification

This is original Second Wind code under the included Apache-2.0 license. AWS documentation defines the interfaces. No upstream DynamoDB Tools source is included, and the historical catalog attribution is retained only in source history; it is not assigned to this replacement.

- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_CreateTable.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DescribeTable.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateTimeToLive.html
- https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateContinuousBackups.html

Run `node --test scripts/plan.test.mjs`. Both real variants execute all 16 feature selections, reject invalid input and unsupported language, and produce equal operation inputs. Tests materialize a base-only package to verify absent optional source files do not prevent execution. With botocore 1.43.114 installed, run `python scripts/validate-aws.py` for AWS-owned model validation of 160 operation inputs and 64 partial response shapes across both variants. These checks do not call AWS. Run `node scripts/package.mjs /path/to/inventory-reverified-2026-10-19.json` to reproduce the complete inline release input.

`release-input.json` includes actual deliverable bytes, source history, a gateway manifest, routing metadata, and the approved component allocation. It is a local preparation input, not publication approval or an R2 upload receipt. `release-history.json` retains prior metadata and repository references. The new candidate remains draft until product, source, license, and publication reviews are recorded and the existing publication operation activates it.
