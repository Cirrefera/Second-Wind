import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-cloudfront', { env: config.env });
  const bucket = new s3.Bucket(stack, 'Origin', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true });
  new cloudfront.Distribution(stack, 'Distribution', { defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(bucket), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS, cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED }, defaultRootObject: 'index.html', minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021 });
  return stack;
}
