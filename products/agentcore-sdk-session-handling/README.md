# invoke and stop AgentCore runtime sessions

Boto3 AgentCore Runtime session helper that persists a caller-managed runtimeSessionId across invocations, streams real invocation responses, and explicitly stops sessions.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: Invoking an AgentCore session starts or uses a buyer runtime and can incur service/model charges. The hosted adapter has no Python runtime, deployed AgentCore endpoint, or buyer credentials.

## Runtime and boundary

Python 3.11+ boto3 with AgentCore runtime model, deployed runtime ARN, compatible Region and buyer credentials. Each invocation can incur runtime/model cost; state and lifecycle are remote. Hosted preview does not execute or claim sessions.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `sessions.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

Keep a stable session ID only for the intended conversation and bind it to an authenticated user in your application. The helper does not implement user authorization or tenant isolation.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-stop-session.html

Upstream repository: https://github.com/boto/boto3

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
