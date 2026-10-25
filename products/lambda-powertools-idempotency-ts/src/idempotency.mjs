import { IdempotencyConfig, makeIdempotent } from '@aws-lambda-powertools/idempotency';
import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';

const TABLE = /^[A-Za-z0-9_.-]{3,255}$/;

export function makeDynamoIdempotent(handler, {
  table_name,
  event_key_jmespath,
  expires_after_seconds = 3600,
  payload_validation_jmespath,
} = {}) {
  if (typeof handler !== 'function') throw new Error('handler_required');
  if (typeof table_name !== 'string' || !TABLE.test(table_name)) throw new Error('invalid_table_name');
  if (typeof event_key_jmespath !== 'string' || !event_key_jmespath.trim()) throw new Error('event_key_jmespath_required');
  if (!Number.isSafeInteger(expires_after_seconds) || expires_after_seconds < 1 || expires_after_seconds > 31536000) {
    throw new Error('invalid_expiration');
  }
  const persistenceStore = new DynamoDBPersistenceLayer({ tableName: table_name });
  const config = new IdempotencyConfig({
    eventKeyJmesPath: event_key_jmespath,
    expiresAfterSeconds: expires_after_seconds,
    ...(payload_validation_jmespath ? { payloadValidationJmesPath: payload_validation_jmespath } : {}),
    throwOnNoIdempotencyKey: true,
  });
  return makeIdempotent(handler, { persistenceStore, config });
}
