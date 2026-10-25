import * as cdk from 'aws-cdk-lib';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as s3 from 'aws-cdk-lib/aws-s3';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-cloudtrail', { env: config.env });
  const bucket = new s3.Bucket(stack, 'TrailLogs', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED });
  new cloudtrail.Trail(stack, 'Trail', { bucket, isMultiRegionTrail: true, includeGlobalServiceEvents: true, managementEvents: cloudtrail.ReadWriteType.ALL, sendToCloudWatchLogs: true });
  return stack;
}
