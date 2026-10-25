import * as cdk from 'aws-cdk-lib';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as s3 from 'aws-cdk-lib/aws-s3';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-athena', { env: config.env });
  const results = new s3.Bucket(stack, 'QueryResults', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, lifecycleRules: [{ expiration: cdk.Duration.days(30) }] });
  new athena.CfnWorkGroup(stack, 'WorkGroup', { name: config.workGroupName ?? 'analytics', state: 'ENABLED', recursiveDeleteOption: false, workGroupConfiguration: { enforceWorkGroupConfiguration: true, publishCloudWatchMetricsEnabled: true, resultConfiguration: { outputLocation: `s3://${results.bucketName}/results/`, encryptionConfiguration: { encryptionOption: 'SSE_S3' } } } });
  return stack;
}
