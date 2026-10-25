import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-codebuild', { env: config.env });
  const artifacts = new s3.Bucket(stack, 'Artifacts', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, lifecycleRules: [{ expiration: cdk.Duration.days(14) }] });
  new codebuild.Project(stack, 'Build', { projectName: config.projectName ?? 'application-build', source: codebuild.Source.gitHub({ owner: 'example', repo: 'application', webhook: false }), environment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0, computeType: codebuild.ComputeType.SMALL }, artifacts: codebuild.Artifacts.s3({ bucket: artifacts, includeBuildId: true, packageZip: true, path: 'builds', name: 'artifact' }), encryptionKey: new kms.Key(stack, 'BuildKey', { enableKeyRotation: true }), logging: { cloudWatch: { logGroup: new logs.LogGroup(stack, 'BuildLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.RETAIN }) } } });
  return stack;
}
