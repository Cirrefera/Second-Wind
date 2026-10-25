import { App, Stack } from 'aws-cdk-lib';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';

export function createStack(app, { configuration: c }) {
  if (!c || !/^s3:\/\/.+/.test(c.model_data_url) || !/^\d{12}$/.test(c.account)
      || !c.execution_role_arn?.startsWith(`arn:aws:iam::${c.account}:role/`)
      || !c.image_uri || !c.endpoint_name || !c.instance_type || !c.region) {
    throw new Error('invalid_configuration');
  }
  const stack = new Stack(app, 'SageMakerEndpointStack', { env: { account: c.account, region: c.region } });
  const model = new sagemaker.CfnModel(stack, 'Model', {
    executionRoleArn: c.execution_role_arn,
    primaryContainer: { image: c.image_uri, modelDataUrl: c.model_data_url },
  });
  const endpointConfig = new sagemaker.CfnEndpointConfig(stack, 'EndpointConfig', {
    productionVariants: [{
      initialInstanceCount: c.initial_instance_count ?? 1,
      instanceType: c.instance_type,
      modelName: model.attrModelName,
      variantName: c.variant_name ?? 'AllTraffic',
    }],
  });
  const endpoint = new sagemaker.CfnEndpoint(stack, 'Endpoint', {
    endpointName: c.endpoint_name,
    endpointConfigName: endpointConfig.attrEndpointConfigName,
  });
  endpoint.addDependency(endpointConfig);
  endpointConfig.addDependency(model);
  return stack;
}

export function synthesize(configuration) {
  const app = new App({ analyticsReporting: false });
  createStack(app, { configuration });
  return app.synth();
}
