import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { reply } from './response.mjs';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event) => {
  const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit) || 50, 1), 100);
  const result = await db.send(new ScanCommand({ TableName: process.env.TABLE_NAME, Limit: limit }));
  return reply(200, { items: result.Items || [], lastEvaluatedKey: result.LastEvaluatedKey || null });
};
