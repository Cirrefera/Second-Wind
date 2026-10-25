import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { reply } from './response.mjs';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) return reply(400, { error: 'id_required' });
  try {
    await db.send(new DeleteCommand({ TableName: process.env.TABLE_NAME, Key: { id }, ConditionExpression: 'attribute_exists(id)' }));
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN, 'Vary': 'Origin' }, body: '' };
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return reply(404, { error: 'not_found' });
    throw error;
  }
};
