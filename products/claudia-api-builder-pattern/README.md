# build routes with Claudia API Builder

Claudia API Builder route module using the real Express-style get/post API, with request validation and API Gateway-ready Lambda export.

Select `language: "javascript"` explicitly in the package configuration.

Hosted preview is blocked: The real route module requires Node.js and claudia-api-builder. The hosted adapter does not load npm packages or a local API Gateway emulator, so it cannot invoke the product module.

## Runtime and boundary

Node.js 18.x with claudia-api-builder 4.2.0. The route module must be bundled/deployed by Claudia in the buyer account; no live API or AWS deployment is supplied.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `package.json`
- `api.js`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

The sample routes are public unless the deployed API has an authorizer or resource policy. Add authentication, request limits, and application authorization before handling sensitive data.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://github.com/claudiajs/claudia-api-builder
- https://github.com/claudiajs/claudia-api-builder/blob/master/docs/api.md

Upstream repository: https://github.com/claudiajs/claudia-api-builder

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

After installing the pinned npm dependencies, run `node preview.js`. It calls the actual Claudia API Builder `proxyRouter` with a local API Gateway-shaped GET request and emits only status and response byte count. It does not deploy to AWS. Hosted preview remains unavailable because its gateway cannot load npm packages.
