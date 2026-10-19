// Versioned commerce event contract. Only explicitly selected fields leave D1.
export const EVENT_CONTRACT_VERSION = '1';
export const EVENT_REGISTRY = Object.freeze({
  'trial.started':'trial',
  'trial.completed':'trial',
  'trial.failed':'trial',
  'scope.selected':'scope',
  'scope.accepted':'scope',
  'quote.created': 'quote',
  'payment.settlement_started': 'payment',
  'payment.settlement_pending': 'payment',
  'payment.settled': 'payment',
  'payment.failed': 'payment',
  'receipt.issued': 'receipt',
  'entitlement.activated': 'entitlement',
});
const fields = new Set(['payment_id','quote_id','sku','product_version_ref',
  'artifact_hash','exact_amount_atomic','payment_network','trial_id','release_hash','scope_hash','selected_share_bps']);

export function streamEvent(row) {
  if (!Object.hasOwn(EVENT_REGISTRY, row.event_type)) throw new Error('unknown_event_type');
  const payload = JSON.parse(row.payload);
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('invalid_event_payload');
  for (const [key,value] of Object.entries(payload)) {
    if (!fields.has(key) || !['string','number'].includes(typeof value)) throw new Error('invalid_event_field');
  }
  // Matches the existing stream's envelope; business dimensions live in payload.
  return {event_id:row.event_id, schema_version:'1', event_contract_version:EVENT_CONTRACT_VERSION,
    event_type:row.event_type, occurred_ts:row.occurred_ts,
    payload:{...payload,event_family:EVENT_REGISTRY[row.event_type],producer:'secondwind-gateway'}};
}

/** At-least-once dispatch. Downstream deduplicates by stable event_id.
 * A crash after send and before acknowledgement can resend the same event.
 */
export async function dispatchOutbox(env) {
  if (!env.BUSINESS_EVENTS) return {status:'not_configured',sent:0};
  const db=env.SW_DB;
  const {results}=await db.prepare('SELECT * FROM business_event_outbox WHERE sent_at IS NULL ORDER BY attempts,occurred_ts,event_id LIMIT 20').all();
  let sent=0,failed=0;
  for (const row of results) {
    try {
      const event=streamEvent(row);
      await env.BUSINESS_EVENTS.send([event]);
      await db.prepare('UPDATE business_event_outbox SET sent_at=?1,attempts=attempts+1,last_error=NULL WHERE event_id=?2 AND sent_at IS NULL')
        .bind(new Date().toISOString(),row.event_id).run();
      sent++;
    } catch {
      // Do not persist provider exceptions: they can contain private request data.
      await db.prepare("UPDATE business_event_outbox SET attempts=attempts+1,last_error='dispatch_failed' WHERE event_id=?1 AND sent_at IS NULL")
        .bind(row.event_id).run();
      failed++;
    }
  }
  return {status:failed?'retry_pending':'ok',sent,failed};
}
