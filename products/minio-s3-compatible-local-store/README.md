# run a local S3-compatible MinIO store

Docker Compose definition for a loopback-only local MinIO S3-compatible service with persistent local volume, required operator-provided credentials.

Select `language: "docker-compose"` explicitly in the package configuration.

Hosted preview is blocked: The service is a Docker Compose deployment. The hosted adapter cannot start a Docker Engine or MinIO container, so there is no service preview.

## Runtime and boundary

Requires Docker Compose v2 and local Docker runtime. Starts only when buyer runs compose up; hosted sandbox cannot start a container or claim S3-compatible service availability. MinIO is not AWS S3 and endpoint behavior should be tested for the chosen SDK.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `compose.yaml`
- `minio.env.example`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

Use this local-only profile for development. Do not bind to public interfaces or reuse root credentials outside an isolated local environment. The MinIO server project is archived upstream and separately licensed under AGPL-3.0; this package contains only the Compose configuration and does not distribute MinIO code.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://min.io/docs/minio/container/index.html
- https://github.com/minio/minio
- https://github.com/minio/minio/blob/master/LICENSE

Upstream repository: https://github.com/minio/minio

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
