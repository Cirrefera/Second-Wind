# query Athena into a pandas DataFrame

Python awswrangler Athena query helper that executes a caller-provided SELECT/WITH query and returns the actual pandas DataFrame using explicit database, result bucket, and workgroup.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: The Athena query helper requires Python, awswrangler, AWS credentials, an Athena workgroup, and an S3 result location. The hosted adapter has no Python runtime or buyer cloud identity.

## Runtime and boundary

Python 3.11+, awswrangler 3.17.1, pandas 2.2.3, boto3 1.43.114, valid AWS credentials, Athena workgroup, Glue catalog database, and S3 query-results location. Invocation can run billable remote queries; hosted preview does not execute them.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `athena_query.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

The helper accepts SQL text; the SELECT/WITH prefix check is a guardrail, not a SQL authorization boundary. Restrict allowed queries and workgroup permissions, encrypt results, and set result retention deliberately.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://aws-sdk-pandas.readthedocs.io/en/stable/api.html
- https://docs.aws.amazon.com/athena/latest/APIReference/API_StartQueryExecution.html

Upstream repository: https://github.com/aws/aws-sdk-pandas

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
