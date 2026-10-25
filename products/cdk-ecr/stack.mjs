import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-ecr', { env: config.env });
  new ecr.Repository(stack, 'Repository', { repositoryName: config.repositoryName ?? 'application', imageTagMutability: ecr.TagMutability.IMMUTABLE, imageScanOnPush: true, encryption: ecr.RepositoryEncryption.AES_256, removalPolicy: cdk.RemovalPolicy.RETAIN, lifecycleRules: [{ maxImageCount: 30, description: 'Retain the most recent 30 images' }] });
  return stack;
}
