import { randomUUID } from 'node:crypto';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { reply } from './response.mjs';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.name !== 'string' || !body.name.trim()) {
    return reply(400, { error: 'name_required' });
  }
  const item = { id: randomUUID(), name: body.name.trim(), createdAt: new Date().toISOString() };
  await db.send(new PutCommand({ TableName: process.env.TABLE_NAME, Item: item, ConditionExpression: 'attribute_not_exists(id)' }));
  return reply(201, item);
};
