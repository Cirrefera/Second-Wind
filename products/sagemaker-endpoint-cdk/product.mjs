import { App, CfnOutput, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import { sagemaker_deployment as deployment } from '@cdklabs/generative-ai-cdk-constructs';

function validate(c) {
  if (!c || !['jumpstart', 'custom'].includes(c.mode)
      || typeof c.model_id !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(c.model_id)
      || !/^\d{12}$/.test(c.account) || !/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(c.region)
      || !c.execution_role_arn?.startsWith(`arn:aws:iam::${c.account}:role/`)
      || !/^[A-Za-z0-9-]{1,63}$/.test(c.endpoint_name || '')
      || !/^ml\.[a-z0-9.]+$/.test(c.instance_type || '')
      || typeof c.endpoint_config !== 'object' || !Array.isArray(c.endpoint_config.production_variants)
      || c.endpoint_config.production_variants.length < 1 || c.endpoint_config.production_variants.length > 4) {
    throw new Error('invalid_configuration');
  }
  if (c.mode === 'custom' && !/^[A-Za-z0-9]([A-Za-z0-9-]{0,62})$/.test(c.model_id)) {
    throw new Error('invalid_custom_sagemaker_model_name');
  }
  if (c.mode === 'custom' && (!/^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/.+/.test(c.image_uri || '')
      || !/^s3:\/\/[^/]+\/.+/.test(c.model_data_url || ''))) {
    throw new Error('custom_model_requires_image_and_artifact');
  }
  for (const variant of c.endpoint_config.production_variants) {
    if (!variant || !/^ml\.[a-z0-9.]+$/.test(variant.instance_type || '')
        || !Number.isInteger(variant.initial_instance_count) || variant.initial_instance_count < 1 || variant.initial_instance_count > 10
        || !/^[A-Za-z0-9_-]{1,63}$/.test(variant.variant_name || '')
        || (variant.initial_variant_weight !== undefined && !(variant.initial_variant_weight >= 0 && variant.initial_variant_weight <= 1))) {
      throw new Error('invalid_endpoint_config');
    }
    if (c.mode === 'jumpstart' && variant.instance_type !== c.instance_type) {
      throw new Error('jumpstart_variant_instance_type_must_match_model_instance_type');
    }
  }
  if (c.vpc_config && (!Array.isArray(c.vpc_config.security_group_ids) || !c.vpc_config.security_group_ids.length
      || !Array.isArray(c.vpc_config.subnets) || !c.vpc_config.subnets.length)) {
    throw new Error('invalid_vpc_config');
  }
}

function cloudFormationEndpointConfig(endpointConfig, modelName) {
  const props = {
    productionVariants: endpointConfig.production_variants.map(variant => ({
      modelName,
      instanceType: variant.instance_type,
      initialInstanceCount: variant.initial_instance_count,
      variantName: variant.variant_name,
      ...(variant.initial_variant_weight === undefined ? {} : { initialVariantWeight: variant.initial_variant_weight }),
      ...(variant.volume_size_in_gb === undefined ? {} : { volumeSizeInGb: variant.volume_size_in_gb }),
      ...(variant.model_data_download_timeout_seconds === undefined ? {} : { modelDataDownloadTimeoutInSeconds: variant.model_data_download_timeout_seconds }),
      ...(variant.container_startup_health_check_timeout_seconds === undefined ? {} : { containerStartupHealthCheckTimeoutInSeconds: variant.container_startup_health_check_timeout_seconds }),
    })),
    ...(endpointConfig.kms_key_id ? { kmsKeyId: endpointConfig.kms_key_id } : {}),
    ...(endpointConfig.enable_network_isolation === undefined ? {} : { enableNetworkIsolation: endpointConfig.enable_network_isolation }),
  };
  return props;
}

const ENDPOINT_CONFIG_FIELDS = [
  'asyncInferenceConfig', 'dataCaptureConfig', 'enableNetworkIsolation',
  'endpointConfigName', 'executionRoleArn', 'explainerConfig', 'kmsKeyId',
  'metricsConfig', 'shadowProductionVariants', 'vpcConfig',
];

function applyNativeEndpointConfig(resource, endpointConfig, modelName) {
  if (!endpointConfig || !Array.isArray(endpointConfig.productionVariants) || endpointConfig.productionVariants.length < 1) {
    throw new Error('endpoint_config_requires_production_variants');
  }
  resource.productionVariants = endpointConfig.productionVariants.map(variant => ({ ...variant, modelName }));
  for (const field of ENDPOINT_CONFIG_FIELDS) {
    if (endpointConfig[field] !== undefined) resource[field] = endpointConfig[field];
  }
  if (endpointConfig.tags !== undefined) resource.tagsRaw = endpointConfig.tags;
}

function vpcConfiguration(vpc, scope, id) {
  if (!vpc) return undefined;
  if (!Array.isArray(vpc.privateSubnets) || vpc.privateSubnets.length === 0) {
    throw new Error('vpc_requires_private_subnets');
  }
  const securityGroup = new ec2.SecurityGroup(scope, `${id}EndpointSecurityGroup`, {
    vpc,
    allowAllOutbound: true,
    description: 'Security group for SageMaker model VPC attachment',
  });
  return { securityGroupIds: [securityGroup.securityGroupId], subnets: vpc.privateSubnets.map(subnet => subnet.subnetId) };
}

/** Native CDK API for a bundled JumpStart catalog key, an IVpc, and full
 * CfnEndpointConfigProps. Each production variant is linked to this model. */
export function createJumpStartEndpoint(scope, {
  modelId, endpointName, instanceType, role, vpc, endpointConfig, acceptEula = false,
}) {
  if (!/^[A-Za-z0-9-]{1,63}$/.test(endpointName || '') || !/^ml\.[a-z0-9.]+$/.test(instanceType || '')) {
    throw new Error('invalid_jumpstart_endpoint_configuration');
  }
  if (!role) throw new Error('jumpstart_execution_role_required');
  const model = deployment.JumpStartModel.of(modelId);
  if (!model.bind()) throw new Error('unknown_jumpstart_model_key');
  const hosted = new deployment.JumpStartSageMakerEndpoint(scope, 'JumpStartModelEndpoint', {
    model,
    endpointName,
    instanceType: deployment.SageMakerInstanceType.of(instanceType),
    role,
    vpcConfig: vpcConfiguration(vpc, scope, 'JumpStart'),
    instanceCount: endpointConfig.productionVariants?.[0]?.initialInstanceCount,
    acceptEula,
  });
  hosted.cfnEndpoint.endpointName = endpointName;
  applyNativeEndpointConfig(hosted.cfnEndpointConfig, endpointConfig, hosted.cfnModel.attrModelName);
  return { model: hosted.cfnModel, endpointConfig: hosted.cfnEndpointConfig, endpoint: hosted.cfnEndpoint, role: hosted.role };
}

/** Native CDK API for a custom SageMaker model resource and full
 * CfnEndpointConfigProps. Each production variant is linked to this model. */
export function createCustomModelEndpoint(scope, {
  modelId, endpointName, instanceType, executionRoleArn, imageUri, modelDataUrl,
  vpc, endpointConfig,
}) {
  if (!/^[A-Za-z0-9]([A-Za-z0-9-]{0,62})$/.test(modelId || '')) throw new Error('invalid_custom_sagemaker_model_name');
  if (!/^[A-Za-z0-9-]{1,63}$/.test(endpointName || '')
      || !executionRoleArn?.startsWith('arn:aws:iam::')
      || !/^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/.+/.test(imageUri || '')
      || !/^s3:\/\/[^/]+\/.+/.test(modelDataUrl || '')) throw new Error('invalid_custom_model_configuration');
  const model = new sagemaker.CfnModel(scope, 'CustomModel', {
    modelName: modelId,
    executionRoleArn,
    primaryContainer: { image: imageUri, modelDataUrl },
    vpcConfig: vpcConfiguration(vpc, scope, 'Custom'),
  });
  if (!endpointConfig || !Array.isArray(endpointConfig.productionVariants) || endpointConfig.productionVariants.length < 1) {
    throw new Error('endpoint_config_requires_production_variants');
  }
  const config = new sagemaker.CfnEndpointConfig(scope, 'EndpointConfig', {
    ...endpointConfig,
    productionVariants: endpointConfig.productionVariants.map(variant => ({ ...variant, modelName: model.attrModelName })),
  });
  const endpoint = new sagemaker.CfnEndpoint(scope, 'Endpoint', {
    endpointName,
    endpointConfigName: config.attrEndpointConfigName,
  });
  endpoint.addDependency(config);
  config.addDependency(model);
  return { model, endpointConfig: config, endpoint };
}

export function createStack(app, { configuration: c }) {
  validate(c);
  const stack = new Stack(app, 'SageMakerEndpointStack', { env: { account: c.account, region: c.region } });
  const vpcConfig = c.vpc_config ? {
    securityGroupIds: c.vpc_config.security_group_ids,
    subnets: c.vpc_config.subnets,
  } : undefined;
  const config = c.endpoint_config;

  if (c.mode === 'jumpstart') {
    const model = deployment.JumpStartModel.of(c.model_id);
    const spec = model.bind();
    if (!spec) throw new Error('unknown_jumpstart_model_key');
    if (config.production_variants.some(variant => !spec.instanceTypes.includes(variant.instance_type))) {
      throw new Error('jumpstart_model_does_not_support_instance_type');
    }
    const role = iam.Role.fromRoleArn(stack, 'ExecutionRole', c.execution_role_arn, { mutable: false });
    const hosted = new deployment.JumpStartSageMakerEndpoint(stack, 'JumpStartModelEndpoint', {
      model,
      endpointName: c.endpoint_name,
      instanceType: deployment.SageMakerInstanceType.of(c.instance_type),
      instanceCount: config.production_variants[0].initial_instance_count,
      role,
      vpcConfig,
      acceptEula: c.accept_eula === true,
    });
    hosted.cfnEndpoint.endpointName = c.endpoint_name;
    const endpointConfig = cloudFormationEndpointConfig(config, hosted.cfnModel.attrModelName);
    hosted.cfnEndpointConfig.productionVariants = endpointConfig.productionVariants;
    if (endpointConfig.kmsKeyId) hosted.cfnEndpointConfig.kmsKeyId = endpointConfig.kmsKeyId;
    if (endpointConfig.enableNetworkIsolation !== undefined) hosted.cfnEndpointConfig.enableNetworkIsolation = endpointConfig.enableNetworkIsolation;
    new CfnOutput(stack, 'SageMakerEndpointName', { value: hosted.cfnEndpoint.attrEndpointName });
    new CfnOutput(stack, 'SageMakerEndpointArn', { value: hosted.cfnEndpoint.attrEndpointArn });
    return stack;
  }
  const endpoint = createCustomModelEndpoint(stack, {
    modelId: c.model_id,
    endpointName: c.endpoint_name,
    instanceType: c.instance_type,
    executionRoleArn: c.execution_role_arn,
    imageUri: c.image_uri,
    modelDataUrl: c.model_data_url,
    endpointConfig: {
      productionVariants: config.production_variants.map(variant => ({
        instanceType: variant.instance_type,
        initialInstanceCount: variant.initial_instance_count,
        variantName: variant.variant_name,
        ...(variant.initial_variant_weight === undefined ? {} : { initialVariantWeight: variant.initial_variant_weight }),
        ...(variant.volume_size_in_gb === undefined ? {} : { volumeSizeInGb: variant.volume_size_in_gb }),
        ...(variant.model_data_download_timeout_seconds === undefined ? {} : { modelDataDownloadTimeoutInSeconds: variant.model_data_download_timeout_seconds }),
        ...(variant.container_startup_health_check_timeout_seconds === undefined ? {} : { containerStartupHealthCheckTimeoutInSeconds: variant.container_startup_health_check_timeout_seconds }),
      })),
      ...(config.kms_key_id ? { kmsKeyId: config.kms_key_id } : {}),
      ...(config.enable_network_isolation === undefined ? {} : { enableNetworkIsolation: config.enable_network_isolation }),
    },
  });
  if (vpcConfig) endpoint.model.vpcConfig = vpcConfig;
  new CfnOutput(stack, 'SageMakerEndpointName', { value: endpoint.endpoint.attrEndpointName });
  new CfnOutput(stack, 'SageMakerEndpointArn', { value: endpoint.endpoint.attrEndpointArn });
  return stack;
}

export function synthesize(configuration) {
  const app = new App({ analyticsReporting: false });
  createStack(app, { configuration });
  return app.synth();
}
