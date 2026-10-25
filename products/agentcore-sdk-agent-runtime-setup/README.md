# serve an agent with AgentCore Runtime

AgentCore Runtime application entrypoint using the official Python SDK decorator, with input contract and local server startup; model/provider logic remains an explicit application integration.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: A real AgentCore Runtime test requires the Python SDK, a deployed runtime, model permissions, and buyer AWS credentials; deployment creates account resources. None is available in the hosted adapter.

## Runtime and boundary

Python 3.11+, bedrock-agentcore 1.24.2 and Strands Agents 1.16.0, Docker/runtime deployment tooling and buyer AWS account. Hosted preview cannot run this SDK or deploy the runtime; sample handler does not claim model inference.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `agent_app.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

The example uses Strands default model configuration. Configure and authorize the intended model explicitly; runtime deployment provisions buyer-account resources and may incur charges.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html
- https://github.com/aws/bedrock-agentcore-sdk-python

Upstream repository: https://github.com/aws/bedrock-agentcore-sdk-python

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
