import { Stack, aws_lambda as lambda, aws_sqs as sqs, aws_dynamodb as ddb } from 'aws-cdk-lib';
import { SqsEventSource, DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'EventSourcesStack'): Stack {
  const stack = new Stack(scope, id);
  const consumer = new lambda.Function(stack, 'Consumer', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler=async()=>{}'),
  });
  const queue = new sqs.Queue(stack, 'Queue');
  consumer.addEventSource(new SqsEventSource(queue, { batchSize: 5 }));
  const table = new ddb.Table(stack, 'StreamTable', {
    partitionKey: { name: 'id', type: ddb.AttributeType.STRING },
    stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
  });
  consumer.addEventSource(new DynamoEventSource(table, {
    startingPosition: lambda.StartingPosition.TRIM_HORIZON,
    batchSize: 10,
  }));
  return stack;
}
