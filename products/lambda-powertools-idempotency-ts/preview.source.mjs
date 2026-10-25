import { makeDynamoIdempotent } from './src/idempotency.mjs';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const SLUG = 'lambda-powertools-idempotency-ts';

/**
 * Runs the purchased DynamoDB-backed helper with a local AWS SDK command fixture.
 * The fixture keeps table state in memory and never sends a request to AWS.
 */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.table_name !== 'string'
      || typeof configuration.event_key_jmespath !== 'string'
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  const records = new Map();
  const keyFor = key => JSON.stringify(Object.fromEntries(Object.entries(key ?? {}).map(([name, value]) => [name, value.S ?? value.N ?? ''])));
  const client = new DynamoDBClient({ region: 'us-east-1', credentials: { accessKeyId: 'local-preview', secretAccessKey: 'local-preview' } });
  client.send = async command => {
    const input = command.input;
    if (command instanceof GetItemCommand) return { Item: records.get(keyFor(input.Key)) };
    if (command instanceof PutItemCommand) { const keyName = input.ExpressionAttributeNames['#id']; const key = keyFor({ [keyName]: input.Item[keyName] }); if (records.has(key)) { const error = new Error('ConditionalCheckFailedException'); error.name = 'ConditionalCheckFailedException'; error.Item = records.get(key); throw error; } records.set(key, input.Item); return {}; }
    if (command instanceof UpdateItemCommand) {
      const key = keyFor(input.Key), item = { ...(records.get(key) ?? input.Key) };
      for (const [, name, value] of input.UpdateExpression.matchAll(/#([A-Za-z0-9_]+)\s*=\s*:([A-Za-z0-9_]+)/g)) {
        const attribute = input.ExpressionAttributeNames[`#${name}`];
        item[attribute] = input.ExpressionAttributeValues[`:${value}`];
      }
      records.set(key, item); return {};
    }
    if (command instanceof DeleteItemCommand) { records.delete(keyFor(input.Key)); return {}; }
    throw new Error('preview_command_unsupported');
  };
  try {
    let calls = 0;
    const wrapped = makeDynamoIdempotent(async event => { calls++; return { order_id: event.body.orderId, accepted: true }; }, configuration, { awsSdkV3Client: client });
    const event = { body: { orderId: 'protected-preview' } };
    const context = { getRemainingTimeInMillis() { return 30000; } };
    const first = await wrapped(event, context);
    const second = await wrapped(event, context);
    if (calls !== 1 || first?.order_id !== second?.order_id) throw new Error('idempotency_fixture_failed');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: calls, verification_count: 1, diagnostic_codes: ['local_fixture_only'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  } finally {
    client.destroy();
  }
}
