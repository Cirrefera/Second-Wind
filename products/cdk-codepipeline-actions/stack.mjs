import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-codepipeline-actions', { env: config.env });
  const artifacts = new s3.Bucket(stack, 'Artifacts', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.KMS, enforceSSL: true });
  const source = new s3.Bucket(stack, 'Source', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true });
  const project = new codebuild.PipelineProject(stack, 'BuildProject', { environment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0, computeType: codebuild.ComputeType.SMALL } });
  const pipeline = new codepipeline.Pipeline(stack, 'Pipeline', { artifactBucket: artifacts });
  const output = new codepipeline.Artifact();
  pipeline.addStage({ stageName: 'Source', actions: [new actions.S3SourceAction({ actionName: 'Source', bucket: source, bucketKey: 'source.zip', output, trigger: actions.S3Trigger.NONE })] });
  const buildOutput = new codepipeline.Artifact();
  pipeline.addStage({ stageName: 'Build', actions: [new actions.CodeBuildAction({ actionName: 'Build', project, input: output, outputs: [buildOutput] })] });
  pipeline.addStage({ stageName: 'Approval', actions: [new actions.ManualApprovalAction({ actionName: 'PromoteToProduction' })] });
  return stack;
}
