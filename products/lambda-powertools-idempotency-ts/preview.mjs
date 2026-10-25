import { IdempotencyConfig, makeIdempotent } from '@aws-lambda-powertools/idempotency';
import { CachePersistenceLayer } from '@aws-lambda-powertools/idempotency/cache';

const SLUG = 'lambda-powertools-idempotency-ts';

/** Native Node preview: run real Powertools idempotency core against an isolated in-memory cache fixture. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.table_name !== 'string' || typeof configuration.event_key_jmespath !== 'string'
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  const values = new Map();
  const client = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options = {}) {
      if (options.NX || options.conditionalSet === 'onlyIfDoesNotExist') {
        if (values.has(key)) return null;
      }
      values.set(key, value); return 'OK';
    },
    async del(keys) { for (const key of keys) values.delete(key); return keys.length; },
  };
  try {
    const config = new IdempotencyConfig({ eventKeyJmesPath: configuration.event_key_jmespath, expiresAfterSeconds: 60 });
    const persistenceStore = new CachePersistenceLayer({ client, expiresAfterSeconds: 60 });
    let calls = 0;
    const handler = makeIdempotent(async record => { calls++; return { accepted: true, order_id: record.orderId }; }, { persistenceStore, config });
    const event = { orderId: 'protected-preview' };
    const context = { getRemainingTimeInMillis() { return 30000; } };
    const first = await handler(event, context);
    const second = await handler(event, context);
    if (calls !== 1 || first?.order_id !== second?.order_id) throw new Error('idempotency_fixture_failed');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: calls, verification_count: 1, diagnostic_codes: ['in_memory_fixture_not_dynamodb'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  }
}
