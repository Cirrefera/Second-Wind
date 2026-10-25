# sagemaker-endpoint-cdk

Creates a generic real-time SageMaker model, endpoint configuration, and endpoint from an ECR inference image, S3 model artifact, execution role, instance type, and endpoint name. The current source package does not expose the generic construct path cited by the intake; this uses AWS CDK L1 SageMaker resources and does not accept modelId.

## Runtime and synthesis

Requires Node.js 20 or later and the exact npm dependencies in `package.json` and `package-lock.json`. Run `npm ci`, then `npm run synth -- ./config.json` (or omit the argument to use the example configuration). This performs local AWS CDK synthesis only; it does not call AWS or deploy resources. A later deployment runs in your AWS account and may create billable resources. Review the template, account, Region, IAM scope, quotas, data retention, networking, and cost before deployment.

Hosted bounded preview is unavailable for this product because the private Worker runtime cannot load external CDK/npm modules or native Node APIs. Trial access must be rejected before charge.

## Configuration

`config.schema.json` defines accepted fields; `config.example.json` is a starting point. Select the single `stack` component in `selection.schema.json`.

## Product files

- `product.mjs` constructs the real AWS CDK resources.
- `synth.mjs` runs local synthesis.
- `package.json` and `package-lock.json` pin dependencies.
- `source-provenance.json` records upstream references and adaptations.

## Provenance and license

Source correction: the cited generative-ai-cdk-constructs SageMaker path is absent in the current package. This package uses AWS CDK L1 SageMaker CfnModel/CfnEndpointConfig/CfnEndpoint to preserve generic endpoint functionality, without Bedrock modelId support.

Apache-2.0 terms are included in `LICENSE`.
