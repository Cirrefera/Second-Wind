# send image and text to Bedrock Converse

Boto3 Converse sample that sends a local image and prompt as typed multimodal content, then returns the actual model response and usage metadata.

Select `language: "python"` explicitly in the package configuration.

Hosted preview is blocked: Multimodal inference sends supplied image data to a buyer-selected Bedrock model and incurs remote inference. The hosted adapter has no Python SDK, buyer credentials, or consented image input.

## Runtime and boundary

Python 3.11+ boto3 1.43.114, compatible vision-capable model and Region, model access, buyer credentials, supported image format and service limits. Sends image bytes to remote Bedrock and incurs inference charges; never executed by hosted preview.

This package contains native source for the described integration. The hosted sandbox does not currently have the required native runtime or service environment for this SKU. Hosted preview is unavailable and must fail before any trial payment. No hosted result should be interpreted as a deployment, query, write, inference, or session success.

## Files

- `requirements.txt`
- `multimodal.py`
- `selection.schema.json`

## Use

Review the files, install the pinned dependencies in the named native runtime, provide credentials through your normal AWS credential chain or local environment, and invoke the shown entrypoint yourself. Remote AWS calls may incur account charges or persist data. Review IAM scope, target account, Region, retention, and data handling before running. This package never stores credentials.

Image bytes are transmitted to the selected Bedrock model. Check model input support, data residency, image sensitivity, and per-request inference costs before sending.

## Sources and provenance

The current package contains original Second Wind integration code and configuration based on the documented upstream interfaces; it does not redistribute upstream repository source.

- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html

Upstream repository: https://github.com/boto/boto3

Dependency versions are pinned in the supplied manifest. The current package source has not been tested against a live AWS account. Hosted preview runtime integration, independent source/license review, and publication approval remain pending.


## Native preview entrypoint

Run `preview.py` in the package directory using its documented native runtime. This entrypoint calls the product integration itself and emits only bounded status/count diagnostics. It requires a real local service or buyer AWS resources and credentials as stated above; it does not simulate success. It may perform remote reads, writes, inference, or session invocation as applicable, so review the operation and cost before running. The hosted gateway cannot execute this native runtime and remains unavailable.
