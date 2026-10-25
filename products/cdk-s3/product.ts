import { Stack, Duration, aws_s3 as s3 } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'BucketStack'): Stack {
  const stack = new Stack(scope, id);
  new s3.Bucket(stack, 'Assets', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    versioned: true,
    lifecycleRules: [{ enabled: true, expiration: Duration.days(90) }],
  });
  return stack;
}
