# create and retrieve AgentCore memory

AgentCore Memory lifecycle sample using AWS SDK control/runtime clients to create a memory, record a conversation event, and retrieve relevant memory records.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: AgentCore Memory preview would create persistent buyer data and needs the Python SDK, an AgentCore Memory resource, IAM permissions, and AWS credentials. The hosted adapter has none of these.

## Runtime and boundary

Python 3.11+ boto3 version with AgentCore Memory service model, AgentCore-enabled Region, IAM permissions, and buyer account. Memory operations persist user content remotely and are never executed by hosted preview.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `memory.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

Conversation events are stored remotely; the sample sets a 30-day raw event expiry and configures a summary strategy. Choose retention and KMS settings for your data policy, and verify lifecycle status before writes.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-customer-scenario.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-create-a-memory-store.html

Upstream repository: https://github.com/aws/bedrock-agentcore-sdk-python

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
