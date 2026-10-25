# Ruby AWS SDK resource interface

**Package:** `aws-sdk-ruby-resource-interface` · **Price:** $0.50

Use modular AWS SDK for Ruby v3 service clients with explicit regions, credentials, and request parameters.

This package contains original Second Wind configuration and preview glue around the named upstream library/tool. The native SDK helpers can issue AWS API requests when called with normal clients and configured credentials. `build_request(configuration)` uses real SDK clients with response stubbing for local request validation. The gateway preview contract remains unavailable until a native Ruby runtime is supported.

## Run locally

Run `bundle install`; then call `build_request(configuration)` from `client.rb`. The package exports normal `Aws::S3::Client`, `Aws::DynamoDB::Client`, and `Aws::BedrockRuntime::Client` factories plus PutObject, GetItem, and InvokeModel helpers. `build_request(configuration)` exercises the real SDK request pipeline with response stubbing and does not contact AWS. Use `client_for(service)` and the operation helpers when you intend to make a real AWS request with your credentials. Direct gem versions are pinned in `Gemfile`; generate and review a platform-appropriate `Gemfile.lock` with Bundler before using this package in a production build.

## Configuration

See [`configuration.schema.json`](./configuration.schema.json). The root `input.schema.json` mirrors the buyer configuration shape; no filesystem paths or arbitrary source-code inputs are accepted.

## Provenance

- Upstream: https://github.com/aws/aws-sdk-ruby
- Primary documentation: https://docs.aws.amazon.com/sdk-for-ruby/v3/developer-guide/service-clients.html
- Upstream license: Apache-2.0
- This package's original wrapper files are licensed under Apache-2.0. No upstream source files are vendored.
- Upstream SDK/library version: Ruby SDK v3 service gem; version constrained in Gemfile

Real client operations require valid AWS credentials and may read, write, or invoke billable services. `build_request` uses response stubs and does not make AWS calls.
