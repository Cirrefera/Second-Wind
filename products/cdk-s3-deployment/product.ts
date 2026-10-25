import { Stack, aws_s3 as s3 } from 'aws-cdk-lib';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function buildStack(scope: Construct, id = 'DeploymentStack'): Stack {
  const stack = new Stack(scope, id);
  const bucket = new s3.Bucket(stack, 'Website', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
  });
  const assetDirectory = fileURLToPath(new URL('./site/', import.meta.url));
  new BucketDeployment(stack, 'DeploySite', {
    destinationBucket: bucket,
    sources: [Source.asset(path.resolve(assetDirectory))],
    prune: true,
  });
  return stack;
}
