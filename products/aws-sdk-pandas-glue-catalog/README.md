# register Parquet datasets in Glue Catalog

Python awswrangler dataset writer that writes Parquet to S3 and creates or updates AWS Glue Catalog metadata through its real integrated API.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: The Glue catalog writer performs remote S3 writes and Glue metadata updates. The hosted adapter has no Python runtime, buyer credentials, or a safe isolated catalog.

## Runtime and boundary

Python 3.11+, awswrangler 3.17.1 and buyer S3/Glue credentials. Writes remote data and catalog state only when invoked. Overwrite modes can replace data; hosted preview performs no AWS operation.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `glue_catalog.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

`overwrite` and `overwrite_partitions` can replace existing S3 data and Glue metadata. Review the target path, catalog location, and recovery policy before invoking them.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://aws-sdk-pandas.readthedocs.io/en/stable/api.html
- https://docs.aws.amazon.com/glue/latest/dg/catalog-and-crawler.html

Upstream repository: https://github.com/aws/aws-sdk-pandas

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
