import { App, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BedrockFoundationModel, VectorKnowledgeBase } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock';

export function createStack(app, { configuration: c }) {
  if (!c || typeof c.knowledge_base_name !== 'string' || typeof c.instruction !== 'string') {
    throw new Error('invalid_configuration');
  }
  const stack = new Stack(app, 'BedrockKnowledgeBaseStack');
  const knowledgeBase = new VectorKnowledgeBase(stack, 'KnowledgeBase', {
    name: c.knowledge_base_name,
    instruction: c.instruction,
    embeddingsModel: BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
  });
  if (c.s3_bucket_arn) {
    knowledgeBase.addS3DataSource({ bucket: s3.Bucket.fromBucketArn(stack, 'SourceBucket', c.s3_bucket_arn) });
  }
  return stack;
}

export function synthesize(configuration) {
  const app = new App({ analyticsReporting: false });
  createStack(app, { configuration });
  return app.synth();
}
