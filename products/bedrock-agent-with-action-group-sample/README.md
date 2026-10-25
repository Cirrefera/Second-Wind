# create and invoke a Bedrock action-group agent

Boto3 sample for Bedrock Agent creation, Lambda-backed function action group registration, and runtime InvokeAgent streaming response; all operations use real AWS APIs.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: Creating an action group and invoking the agent require buyer Bedrock resources, IAM permissions, model access, and AWS credentials; creation has account side effects. The hosted adapter has no Python runtime or customer credentials.

## Runtime and boundary

Python 3.11+ boto3 1.43.114, Bedrock Agents-supported Region, configured model access, IAM service role/Lambda permissions, and buyer AWS credentials. Creates billable/account resources and is not run in hosted preview.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `agent_action_group.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

Agent setup and invocation use remote Bedrock APIs and may incur inference charges. Restrict action-group Lambda permissions and validate tool inputs in the Lambda handler.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_CreateAgentActionGroup.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/agents-invoke-agent.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/agents-action-add.html

Upstream repository: https://github.com/boto/boto3

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
