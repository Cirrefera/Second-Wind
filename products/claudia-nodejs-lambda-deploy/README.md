# deploy a Node.js Lambda with Claudia

Pinned Claudia.js deployment scaffold for a Node.js Lambda/API Gateway service, with explicit create and update commands; deployment runs in the buyer AWS account.

Select `language: "javascript"` explicitly in the package configuration.

Hosted preview is blocked: Claudia is an npm CLI whose create/update workflow changes buyer AWS resources. The hosted adapter has no npm dependency loader or buyer AWS credentials, so no deployment preview can run.

## Runtime and boundary

Node.js 18.x, Claudia 5.14.1, buyer AWS credentials and account. Scripts call Claudia only when the buyer runs them; no deploy, role creation, or AWS success is claimed during hosted preview.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `package.json`
- `app.js`
- `deploy.sh`
- `update.sh`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

The proxy API can be publicly reachable. Add an authorizer or API resource policy and review the generated IAM role before routing real user data.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://github.com/claudiajs/claudia
- https://claudiajs.com/tutorials/installing.html
- https://claudiajs.com/tutorials/deploying.html

Upstream repository: https://github.com/claudiajs/claudia

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.sh` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
