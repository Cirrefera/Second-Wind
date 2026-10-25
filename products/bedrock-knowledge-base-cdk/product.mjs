import { App, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BedrockFoundationModel, VectorKnowledgeBase } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock/index.js';
import { AmazonAuroraVectorStore } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/amazonaurora/index.js';
import { PineconeVectorStore } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/pinecone/index.js';

export function createStack(app, { configuration: c }) {
  if (!c || !['OpenSearchServerless', 'Pinecone', 'AuroraPostgres'].includes(c.vector_store)
      || typeof c.knowledge_base_name !== 'string' || typeof c.instruction !== 'string') {
    throw new Error('invalid_configuration');
  }
  const stack = new Stack(app, 'BedrockKnowledgeBaseStack');
  let vectorStore;
  if (c.vector_store === 'Pinecone') {
    vectorStore = new PineconeVectorStore({
      connectionString: c.connection_string,
      credentialsSecretArn: c.credentials_secret_arn,
      namespace: c.namespace,
      textField: c.text_field,
      metadataField: c.metadata_field,
    });
  } else if (c.vector_store === 'AuroraPostgres') {
    vectorStore = new AmazonAuroraVectorStore(stack, 'AuroraVectorStore', {
      embeddingsModelVectorDimension: 1024,
    });
  } else if (c.vector_store !== 'OpenSearchServerless') {
    throw new Error('unsupported_vector_store');
  }
  // Omitting vectorStore selects the upstream OpenSearch Serverless default.
  // Its index custom-resource asset requires Docker during CDK synthesis.
  const knowledgeBase = new VectorKnowledgeBase(stack, 'KnowledgeBase', {
    name: c.knowledge_base_name,
    instruction: c.instruction,
    embeddingsModel: BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
    ...(vectorStore ? { vectorStore } : {}),
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
