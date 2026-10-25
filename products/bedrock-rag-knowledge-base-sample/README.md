# retrieve grounded context from a Bedrock knowledge base

Boto3 Bedrock Knowledge Bases example with retrieve and retrieve-and-generate calls, bounded result selection, and unmodified response citations for caller display.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: Knowledge Base retrieval requires a provisioned buyer Knowledge Base, model access for generation, IAM permissions, and AWS credentials; hosted runtime lacks the Python SDK and customer identity.

## Runtime and boundary

Python 3.11+ boto3 1.43.114, provisioned Knowledge Base/data source/vector store, permitted model, and buyer account credentials. Calls can incur retrieval/inference charges. Hosted preview does not make a remote request.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `knowledge_base.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

Retrieved passages can contain sensitive source material. Apply data access controls at ingestion and retrieval, review citations, and account for remote inference charges when using retrieve-and-generate.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Retrieve.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-retrieve.html

Upstream repository: https://github.com/boto/boto3

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
