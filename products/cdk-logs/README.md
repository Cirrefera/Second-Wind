# cdk-logs

CloudWatch Log Group with explicit retention, optional KMS encryption key and Lambda subscription filter.

This version 2 release updates the original catalog entry with an original Second Wind CDK example for Amazon CloudWatch Logs, using real `aws-cdk-lib` v2 constructs. It synthesizes locally with Node.js 20 or later, `aws-cdk-lib` 2.274.0 and `constructs` 10.5.0. Install pinned dependencies with `npm ci`, then call `preview({configuration, selected_components: ['stack']})` from `preview.mjs`. This runs `App.synth()` and returns only bounded booleans, selected component IDs, stack count, resource count, or a stable error code. The CloudFormation assembly stays on the local host. Synthesis does not deploy, call AWS APIs, validate account permissions, confirm quotas, or prove that a deployment will succeed.

## Configuration

Set `language` to `javascript` explicitly. See `config.schema.json` for the exact input contract. The package has one component, `stack`; choose it explicitly. The fixed private preview entrypoint is `preview.mjs`, while `product.mjs` exports the reusable `createStack(app, {configuration, selected_components})` function for a buyer's own CDK application. The package does not expose generated templates through the preview response.

Hosted trials are currently unavailable for this release. The gateway's Worker Loader cannot execute the Node built-ins and external CDK dependencies required by native CDK synthesis. The release manifest records this boundary. The preview module is for a local Node process only until an isolated native Node preview runtime is deployed.

## Safety and deployment boundary

Review the synthesized template and CDK security diff before deployment. Validate IAM, encryption, network placement, data retention, logging, resource limits and deletion behavior against your environment. `cdk synth` is local generation only; `cdk deploy` is a separate operation that can create billable resources and requires explicit AWS credentials, bootstrap state and approvals. This package does not execute deployment or make AWS success claims. Imported resource ARNs, if accepted by the schema, are references only and are not checked against AWS.

## Dependencies and provenance

- `aws-cdk-lib` 2.274.0 (Apache-2.0), official AWS CDK v2 construct library.
- `constructs` 10.5.0 (Apache-2.0), peer dependency required by aws-cdk-lib 2.274.0.
- Product source is original Second Wind code under Apache-2.0; no AWS CDK implementation code is copied into this package.
- API docs: https://docs.aws.amazon.com/cdk/api/v2/docs/ and https://docs.aws.amazon.com/cdk/v2/guide/
