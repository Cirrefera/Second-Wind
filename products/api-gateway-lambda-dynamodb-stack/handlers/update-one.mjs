import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { reply } from './response.mjs';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event) => {
  const id = event.pathParameters?.id;
  const body = JSON.parse(event.body || '{}');
  if (!id || typeof body.name !== 'string' || !body.name.trim()) return reply(400, { error: 'id_and_name_required' });
  try {
    const result = await db.send(new UpdateCommand({ TableName: process.env.TABLE_NAME, Key: { id }, UpdateExpression: 'SET #n = :n, updatedAt = :t', ConditionExpression: 'attribute_exists(id)', ExpressionAttributeNames: { '#n': 'name' }, ExpressionAttributeValues: { ':n': body.name.trim(), ':t': new Date().toISOString() }, ReturnValues: 'ALL_NEW' }));
    return reply(200, result.Attributes);
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return reply(404, { error: 'not_found' });
    throw error;
  }
};
