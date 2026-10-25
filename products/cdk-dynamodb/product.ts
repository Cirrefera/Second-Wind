import { Stack, aws_dynamodb as ddb } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'DynamoStack'): Stack {
  const stack = new Stack(scope, id);
  const table = new ddb.Table(stack, 'Records', {
    partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
    sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
    billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    encryption: ddb.TableEncryption.AWS_MANAGED,
    pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  });
  table.addGlobalSecondaryIndex({
    indexName: 'byStatus',
    partitionKey: { name: 'status', type: ddb.AttributeType.STRING },
    sortKey: { name: 'pk', type: ddb.AttributeType.STRING },
    projectionType: ddb.ProjectionType.KEYS_ONLY,
  });
  return stack;
}
