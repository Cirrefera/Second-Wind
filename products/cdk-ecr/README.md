# cdk-ecr

Private ECR repository with immutable tags, scan-on-push, lifecycle cleanup, and encryption.

This is a focused original CDK v2 example for this AWS resource pattern. `stack.mjs` exports `createStack(app, configuration)`, the construct entrypoint to import into an AWS CDK application and synthesize a CloudFormation template. Pass the explicit `language: "javascript"` selection and any optional schema fields. Exact dependency versions and the lockfile are recorded in `package.json`; install them in an isolated build environment, then import `preview` from `preview.mjs` with the configuration schema in `config.schema.json`.

The private `preview.mjs` entrypoint calls AWS CDK's real `App.synth()` and returns only a bounded resource count and stable diagnostic codes. It does not return template contents, resource names, or source. The hosted Workers preview remains disabled because the current runtime cannot resolve `aws-cdk-lib`; the repository validation record documents local native synthesis.

Upstream API reference: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecr-readme.html

Review the synthesized template, IAM permissions, costs, networking, and removal policies before deploying. Values are demonstration defaults and require environment-specific review.
