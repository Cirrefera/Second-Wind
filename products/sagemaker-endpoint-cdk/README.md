# sagemaker-endpoint-cdk

Synthesizes a SageMaker endpoint from either a verified JumpStart catalog model or a custom SageMaker model. Both modes configure one or more production variants that point to the generated SageMaker model, accept VPC subnet and security group IDs, and export the deployed endpoint name and ARN as CloudFormation outputs.

## Model modes

`mode: "jumpstart"` uses the pinned `@cdklabs/generative-ai-cdk-constructs` 0.1.320 `JumpStartModel` and `JumpStartSageMakerEndpoint` APIs. `model_id` must be an exact key in the package's bundled JumpStart catalog, such as `HUGGINGFACE_ASR_WHISPER_BASE_3_0_20`; it is not an arbitrary SageMaker or Hugging Face model identifier. The construct checks whether the selected instance type is in that model's supported list and whether the model is available in the configured Region. Models requiring a license agreement are rejected unless `accept_eula` is explicitly true. The caller-provided execution role must allow SageMaker to read the selected JumpStart model artifact.

`mode: "custom"` creates an `AWS::SageMaker::Model` from the supplied ECR image and S3 artifact. Here `model_id` is the SageMaker model resource name and must satisfy SageMaker's 63-character name limit. The execution role must permit SageMaker to access the image and artifact. This mode does not turn a Hugging Face model identifier into a deployed model; callers must provide a compatible inference image and model artifact.

## Serialized CDK configuration

The original API uses CDK values (`modelId`, `instanceType`, `EndpointConfig`, and `IVpc`), which cannot be serialized directly as JSON. The exported `createJumpStartEndpoint(scope, props)` accepts the exact JumpStart catalog key, instance type, CDK `IVpc`, role construct, and full `CfnEndpointConfigProps`. `createCustomModelEndpoint(scope, props)` accepts a SageMaker model name, custom image/artifact, `IVpc`, execution-role ARN, and full `CfnEndpointConfigProps`. Both builders replace each supplied production variant's model name with the generated model reference before synthesis.

`config.schema.json` defines the JSON adapter used by the local preview: `model_id`, `instance_type`, `endpoint_config.production_variants`, and `vpc_config` containing existing subnet and security group IDs. That JSON adapter supports production-variant settings, KMS key ID, and network isolation; advanced CloudFormation endpoint-config properties such as data capture, async inference, explainers, metrics, shadow variants, and tags are available through the exported CDK builders, but are not serialized by the preview configuration.

The example configuration uses a JumpStart Whisper catalog key and illustrative VPC identifiers. Replace them with IDs from your VPC before deployment. `config.schema.json` defines all accepted fields; `selection.schema.json` selects the single `stack` component.

## Runtime and deployment

Requires Node.js 20 or later, Docker if required by the pinned CDK dependency, and the exact dependencies in `package.json` and `package-lock.json`. Run `npm ci`, then `npm run synth -- ./config.json` (or omit the argument to use the JumpStart example). Synthesis is local and makes no AWS API calls. Deploying the resulting stack creates a SageMaker endpoint and billable compute resources in your AWS account; review instance cost, quota, IAM permissions, networking, and the selected model license before deployment.

The current hosted private preview adapter cannot load this product's CDK and JumpStart dependency closure, so hosted trial access is unavailable and must be rejected before charge. `preview.mjs` is a trusted native Node entrypoint that synthesizes the same product locally and returns only bounded status and resource-count diagnostics; it does not expose the template or contact AWS.

## Source and license

The JavaScript wiring is original Second Wind code over pinned AWS CDK L1 SageMaker resources and the published JumpStart constructs. Upstream implementation files are not copied into this package. The pinned construct package is Apache-2.0; its license and this package's license are included.
