# read and write S3 objects from Ruby

Ruby S3 client wrapper using the maintained AWS SDK for Ruby v3 with direct PutObject/GetObject/DeleteObject operations and optional S3-compatible endpoint settings.

Select `language: "ruby"` explicitly in the package configuration.

Hosted preview is blocked: The real S3 operations require Ruby, the aws-sdk-s3 gem, and a buyer S3 endpoint with credentials. The hosted adapter has no Ruby runtime or customer credentials.

## Runtime and boundary

Ruby 3.2+ and aws-sdk-s3 1.233.0. Calls S3 only when invoked with buyer credentials and a bucket. Never embeds credentials; not a replacement HTTP/signature implementation.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `Gemfile`
- `lib/object_store.rb`
- `example.rb`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

Grant only the bucket and actions needed by the application. Object keys are not filesystem paths, and a returned SDK response reports the actual S3 operation outcome.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://docs.aws.amazon.com/sdk-for-ruby/v3/api/Aws/S3/Client.html
- https://github.com/aws/aws-sdk-ruby

Upstream repository: https://github.com/aws/aws-sdk-ruby

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.rb` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
