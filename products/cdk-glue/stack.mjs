import * as cdk from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-glue', { env: config.env });
  const data = new s3.Bucket(stack, 'Data', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true });
  const database = new glue.CfnDatabase(stack, 'Database', { catalogId: cdk.Aws.ACCOUNT_ID, databaseInput: { name: config.databaseName ?? 'lake' } });
  const role = new iam.Role(stack, 'CrawlerRole', { assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'), managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole')] });
  data.grantRead(role);
  new glue.CfnCrawler(stack, 'Crawler', { name: 'data-catalog-crawler', role: role.roleArn, databaseName: database.ref, targets: { s3Targets: [{ path: data.s3UrlForObject() }] }, schemaChangePolicy: { updateBehavior: 'UPDATE_IN_DATABASE', deleteBehavior: 'LOG' } });
  return stack;
}
