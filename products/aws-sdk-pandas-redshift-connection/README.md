# connect awswrangler to Redshift

Python awswrangler Redshift connection helper using a buyer-managed password from environment and the real Redshift connector/DataFrame query path.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: The Redshift helper requires Python, a database driver, network access, and buyer credentials for an actual query. The hosted adapter has no Python runtime or database connection.

## Runtime and boundary

Python 3.11+, awswrangler 3.17.1 and compatible database-driver dependencies, reachable Redshift endpoint, network access and buyer credentials. Query execution is remote and not hosted-previewed.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `redshift.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

The SELECT/WITH check does not make arbitrary SQL safe. Use a least-privilege database user, TLS, short-lived secrets, and parameterized queries where supported.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://aws-sdk-pandas.readthedocs.io/en/stable/api.html
- https://github.com/aws/aws-sdk-pandas

Upstream repository: https://github.com/aws/aws-sdk-pandas

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
