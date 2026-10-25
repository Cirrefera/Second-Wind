# read and write S3 data with awswrangler

Python awswrangler S3 helpers that write pandas DataFrames as Parquet and read them back through the real S3 integration, preserving awswrangler metadata return values.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: The S3 read/write helper requires Python, awswrangler, and buyer AWS credentials for the target object store. The hosted adapter has no Python runtime or customer cloud identity.

## Runtime and boundary

Python 3.11+, awswrangler 3.17.1, pandas 2.2.3, boto3 1.43.114 and buyer AWS credentials with required S3 access. Real S3 I/O only occurs when called; no hosted cloud call.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `s3_frames.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

The helper writes to the exact S3 URI supplied. Protect the target prefix with IAM and bucket policy, and choose dataset mode carefully because later writes can replace existing objects.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://aws-sdk-pandas.readthedocs.io/en/stable/api.html
- https://github.com/aws/aws-sdk-pandas

Upstream repository: https://github.com/aws/aws-sdk-pandas

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
