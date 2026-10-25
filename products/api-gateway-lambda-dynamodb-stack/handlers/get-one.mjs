import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { reply } from './response.mjs';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) return reply(400, { error: 'id_required' });
  const result = await db.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { id } }));
  return result.Item ? reply(200, result.Item) : reply(404, { error: 'not_found' });
};
