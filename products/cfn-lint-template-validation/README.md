# CloudFormation template validation with cfn-lint

**Package:** `cfn-lint-template-validation` · **Price:** $1.00

Validate CloudFormation and SAM templates against AWS resource provider schemas and cfn-lint rules.

This package contains original Second Wind configuration and preview glue around the named upstream library/tool. It does not deploy AWS resources. The preview contract is deliberately unavailable in the current gateway because its private runner does not install or execute native python dependencies. The local entrypoint uses the actual upstream dependency when run in an environment with the required toolchain; it does not substitute generic checks for upstream behavior.

## Run locally

Create a virtual environment, install `requirements.lock.txt` for a fully pinned local environment (or `requirements.txt` for only the direct dependency), then run `python -c "from preview import preview; print(preview({'language':'python','template': open('template.yaml').read()}))"`. Supply template contents, not a caller-selected filesystem path. cfn-lint may need network access on first schema load.

## Configuration

See [`configuration.schema.json`](./configuration.schema.json). The root `input.schema.json` mirrors the buyer configuration shape; no filesystem paths or arbitrary source-code inputs are accepted.

## Provenance

- Upstream: https://github.com/aws-cloudformation/cfn-lint
- Primary documentation: https://github.com/aws-cloudformation/cfn-lint
- Upstream license: MIT-0
- This package's original wrapper files are licensed under Apache-2.0. No upstream source files are vendored.
- Upstream SDK/library version: 1.58.0

The generated stack or request preview is a local structural check only. It does not prove service availability, permissions, successful deployment, or runtime behavior in AWS. Review synthesized IAM and resource properties before deployment.
