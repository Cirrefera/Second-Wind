# AWS CDK API Gateway v2 integrations

**Package:** `cdk-apigatewayv2-integrations` · **Price:** $1.00

Define an HTTP API route with an explicit Lambda integration using the dedicated integrations library.

This package contains original Second Wind configuration and preview glue around the named upstream library/tool. Its private preview synthesizes locally and does not deploy resources. The gateway preview contract remains unavailable until a native TypeScript/CDK runtime is supported. `product.ts` contains the actual reusable AWS CDK constructs; the included `app.ts` is a deployable CDK app when explicitly run with the CDK CLI and your AWS credentials.

## Run locally

Run `npm ci` and `npm run preview`. The paid package exports `buildStack(scope, id, configuration)` from `product.ts`, so you can synthesize and deploy the actual CDK constructs. `npm run preview` separately synthesizes privately and returns only bounded diagnostics. Neither path calls AWS until you explicitly run `npx cdk deploy`. `cdk-lambda-nodejs` uses local `esbuild` bundling; `cdk-s3-deployment` stages the included local `site/` asset directory.

## Configuration

See [`configuration.schema.json`](./configuration.schema.json). The root `input.schema.json` mirrors the buyer configuration shape; no filesystem paths or arbitrary source-code inputs are accepted.

## Provenance

- Upstream: https://github.com/aws/aws-cdk
- Primary documentation: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2_integrations-readme.html
- Upstream license: Apache-2.0
- This package's original wrapper files are licensed under Apache-2.0. No upstream source files are vendored.
- Upstream SDK/library version: 2.274.0

The generated stack or request preview is a local structural check only. It does not prove service availability, permissions, successful deployment, or runtime behavior in AWS. Review synthesized IAM and resource properties before deployment.

## Use the delivered constructs

`product.ts` is the reusable product entrypoint. The CDK CLI app in `app.ts` calls it; `cdk.json` points to that app. After `npm ci`, run `npx cdk synth` to inspect the CloudFormation output and `npx cdk deploy` to deploy using your configured AWS credentials and account. Review the synthesized template and IAM permissions before deployment.

```typescript
import { App } from 'aws-cdk-lib';
import { buildStack } from './product.js';

const app = new App();
buildStack(app, 'MyStack');
app.synth();
```
