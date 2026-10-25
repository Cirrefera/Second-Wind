# Private Cloudflare runtime integration — 2026-10-25

Second Wind sells AWS knowledge, guidance and advice. Cloudflare operates the marketplace and private sandbox. This work demonstrates selected product content locally; it does not provision AWS infrastructure, connect an AWS account to the platform, or offer hosted AWS service execution. Standard x402 payments, the $0.01 trial charge, optional separate purchases and the exact 72-product eligibility policy are unchanged.

## Implemented runtime corrections

The installed Code Mode executor uses an older child compatibility date than the application Worker. The generic private preview now uses the gateway's current date through the existing Loader binding. Only the private product path changes; existing buyer-authored execution and the established DynamoDB preview are preserved.

The original import scanner missed whitespace-free imports in minified bundles. Acorn 8.19.0 now parses module syntax and rejects unsupported imports and nonliteral dynamic imports. Direct checks confirmed rejection of forbidden minified imports, imports obscured by comments, escaped forbidden specifiers and dynamic specifiers. Supported minified imports resolve correctly. The exact runtime-built-in allowlist and the 512 KiB/64-module caps remain enforced.

## Exact product outcomes

| Product | Current evidence | Publication |
| --- | --- | --- |
| Powertools Logger | Purchased helper runs in Workerd. DEBUG/INFO emit one record; WARN/ERROR correctly suppress it. Development-mode local output is documented. | Draft |
| Powertools Metrics | Real library emits EMF, with namespace and configured dimensions checked. A private Console output sink captures the generated string; it does not replace metrics logic. | Draft |
| Powertools Idempotency | Purchased wrapper and real persistence-layer commands exercise a bounded in-memory fixture. Duplicate replay runs the wrapped handler once. The missing pinned DynamoDB utility dependency is supplied. | Draft |
| Powertools Parameters | Purchased helper uses the real SSM provider and SDK command with a local response fixture; the real JSON transformation runs. | Draft |
| Powertools Batch | Existing real processor preview continues to run in Workerd under the updated private profile. | Draft |
| Powertools Tracer | Native fixture works. The attempted hosted bundle encounters a module-initialization/global-scope operation error; hosted support remains disabled pending repair. This is not a claim that secure randomness is unavailable during Worker requests. | Draft, unavailable |
| Chalice REST pattern | Actual Chalice routing and handler run locally against valid and invalid synthetic API Gateway inputs. No packaging subprocess or AWS client is used. IAM authorization is not verified by this local execution. | Draft, Python hosting unavailable |
| Chalice policy generator | Actual Chalice analyzer and policy builder run locally with an isolated inert SDK session and blocked sends. No account credential discovery, subprocess or AWS API operation is needed. | Draft, Python hosting unavailable |

The service-backed fixture results explicitly carry `local_fixture_only`. Neither those results nor successful local synthesis establish that an AWS deployment, IAM configuration or service operation would succeed.

## Larger runtime findings

The real SageMaker product also synthesized inside a local Dynamic Worker using its pinned CDK dependencies. Actual Node filesystem/crypto APIs, a CommonJS-to-native-module bridge, real Rego files, and the actual CloudFormation validator Wasm were used. The validator is supplied as a Loader Wasm module rather than compiled dynamically from bytes. The result was one stack with three resources and no AWS calls.

Its optimized closure is 12,638,881 bytes of JavaScript, 8,871,161 bytes of Wasm and 7,338 bytes of Rego data. That is larger than the current gateway package/inline-manifest limits. It requires a reviewed private runtime artifact packaging path; the current limits were not raised to force it through. This is a gateway integration gap, not proof that CDK cannot run on Cloudflare.

Cloudflare documents Python Dynamic Workers through the existing Loader. The local proof stopped before Python code ran because the execution environment could not resolve `pyodide-capnp-bin.edgeworker.net`. Native cfn-lint's direct in-process API worked, but its roughly 31 MB of schema data needs a verified Python dependency/filesystem packaging path. No Python-hosting success is claimed.

## Verification and remaining work

All 71 authored release inputs still pass source preparation, configuration-example validation, approved-price comparison and file-byte reconciliation. Existing gateway checks, the established Dynamic Worker privacy checks and the application build pass. No new test suite was added. Runtime fixture proofs are separate from service execution and deployment evidence.

Five new candidates now fit the existing private preview adapter. They remain unpublished in this draft branch. The publication record is unchanged, so this work does not activate any draft or alter historical purchases. The remaining runtime work is Cloudflare dependency/artifact packaging and private demonstrations of the approved content, not AWS provisioning.

Primary runtime references:

- https://developers.cloudflare.com/workers/configuration/compatibility-flags/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/
- https://developers.cloudflare.com/dynamic-workers/api-reference/
- https://developers.cloudflare.com/dynamic-workers/platform/limits/
- https://developers.cloudflare.com/workers/languages/python/packages/
- https://docs.aws.amazon.com/boto3/latest/guide/credentials.html
