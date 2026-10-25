# api-gateway-lambda-dynamodb-stack

Creates a REST API with POST/GET collection and GET/PUT/DELETE item routes, five Node.js Lambda handlers, and an on-demand DynamoDB table retained on stack deletion. It adapts the AWS CDK sample with origin-restricted CORS, generated table name, point-in-time recovery, and explicit DocumentClient handlers.

## Runtime and synthesis

Requires Node.js 20 or later and the exact npm dependencies in `package.json` and `package-lock.json`. Run `npm ci`, then `npm run synth -- ./config.json` (or omit the argument to use the example configuration). This performs local AWS CDK synthesis only; it does not call AWS or deploy resources. A later deployment runs in your AWS account and may create billable resources. Review the template, account, Region, IAM scope, quotas, data retention, networking, and cost before deployment.

Hosted bounded preview is unavailable for this product because the private Worker runtime cannot load external CDK/npm modules or native Node APIs. Trial access must be rejected before charge.

## Configuration

`config.schema.json` defines accepted fields; `config.example.json` is a starting point. Select the single `stack` component in `selection.schema.json`.

## Product files

- `product.mjs` constructs the real AWS CDK resources.
- `preview.mjs` runs that construct through a trusted native Node synthesizer and returns only status, selected component, and resource count; it is not supported by the hosted Worker runtime.
- `synth.mjs` runs local synthesis.
- `validation.json` records one local synthesis result; it does not attest to AWS execution or deployment.
- `package.json` and `package-lock.json` pin dependencies.
- `source-provenance.json` records upstream references and adaptations.

## Provenance and license

Reworked from the upstream AWS CDK sample. Changes include a configured CORS origin instead of wildcard, generated DynamoDB table name, RETAIN deletion policy, point-in-time recovery, CRUD handlers, and bounded list pagination.

Apache-2.0 terms are included in `LICENSE`.
