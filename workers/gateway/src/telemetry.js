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
// These describe recorded transitions, never buyer motives or external success.
export const EVENT_OBSERVATIONS = Object.freeze({
  'trial.started':Object.freeze({stage:'testing',outcome:'started'}),
  'trial.completed':Object.freeze({stage:'testing',outcome:'completed'}),
  'trial.failed':Object.freeze({stage:'testing',outcome:'failed'}),
  'scope.selected':Object.freeze({stage:'selection',outcome:'selected'}),
  'scope.accepted':Object.freeze({stage:'selection',outcome:'accepted'}),
  'quote.created':Object.freeze({stage:'selection',outcome:'quote_created'}),
  'payment.settlement_started':Object.freeze({stage:'payment',outcome:'settlement_started'}),
  'payment.settlement_pending':Object.freeze({stage:'payment',outcome:'settlement_pending'}),
  'payment.settled':Object.freeze({stage:'payment',outcome:'settled'}),
  'payment.failed':Object.freeze({stage:'payment',outcome:'failed'}),
  'receipt.issued':Object.freeze({stage:'payment',outcome:'receipt_issued'}),
  'entitlement.activated':Object.freeze({stage:'payment',outcome:'entitlement_activated'}),
});
const digest = /^[a-f0-9]{64}$/;
const isDigest = value => typeof value === 'string' && digest.test(value);
const componentId = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const componentIds = ids => Array.isArray(ids) && ids.length <= 100
  && ids.every(id => typeof id === 'string' && componentId.test(id))
  && new Set(ids).size === ids.length;

export function streamEvent(row) {
  if (!Object.hasOwn(EVENT_REGISTRY, row.event_type)) throw new Error('unknown_event_type');
  const payload = JSON.parse(row.payload);
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('invalid_event_payload');
  for (const [key,value] of Object.entries(payload)) {
    if (!fields.has(key) || !['string','number'].includes(typeof value)
      || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('invalid_event_field');
  }
  const observation=EVENT_OBSERVATIONS[row.event_type];
  // Matches the existing stream's envelope; business dimensions live in payload.
  return {event_id:row.event_id, schema_version:'1', event_contract_version:EVENT_CONTRACT_VERSION,
    event_type:row.event_type, occurred_ts:row.occurred_ts,
    payload:{...payload,event_family:EVENT_REGISTRY[row.event_type],producer:'secondwind-gateway',
      journey_stage:observation.stage,observed_outcome:observation.outcome}};
}

/** Optional, read-only correlation from the exact persisted selection and release.
 * Missing evidence must not invent scope or stop an otherwise valid base event.
 * At most three indexed/bounded reads per event; no buyer config or code is read.
 */
async function correlateScope(db,event) {
  const payload=event.payload;
  if (!payload.quote_id && event.event_type !== 'scope.selected') return event;
  const unavailable=()=>({...event,payload:{...payload,scope_correlation:'unavailable'}});
  try {
    let row;
    if (event.event_type === 'scope.selected') {
      row=await db.prepare(`SELECT s.scope_json,t.sku,t.version,t.release_hash
        FROM component_selections s JOIN component_trials t ON t.id=s.trial_id
        WHERE s.trial_id=?1 AND s.scope_hash=?2`)
        .bind(payload.trial_id,payload.scope_hash).first();
    } else {
      row=await db.prepare(`SELECT sku,version,json_extract(snapshot_json,'$.scope') AS scope_json
        FROM commerce_quotes WHERE id=?1`).bind(payload.quote_id).first();
      if (row && row.scope_json === null) {
        return event.event_type === 'scope.accepted' ? unavailable()
          : {...event,payload:{...payload,scope_correlation:'not_applicable'}};
      }
    }
    if (!row) return unavailable();
    const scope=JSON.parse(row.scope_json);
    if (!scope || Array.isArray(scope) || scope.schema_version !== '1'
      || scope.sku !== row.sku || scope.sku !== payload.sku
      || !Number.isSafeInteger(scope.version) || scope.version !== row.version
      || (payload.product_version_ref !== undefined && String(scope.version) !== String(payload.product_version_ref))
      || !isDigest(scope.release_hash) || !isDigest(scope.scope_hash)
      || (row.release_hash && scope.release_hash !== row.release_hash)
      || (payload.scope_hash !== undefined && scope.scope_hash !== payload.scope_hash)
      || !componentIds(scope.selected_components) || !scope.selected_components.length
      || !Number.isInteger(scope.selected_share_bps) || scope.selected_share_bps < 1 || scope.selected_share_bps > 10000
      || (payload.selected_share_bps !== undefined && payload.selected_share_bps !== scope.selected_share_bps)
      || typeof scope.amount_atomic !== 'string' || !/^[1-9][0-9]{0,15}$/.test(scope.amount_atomic)
      || (payload.exact_amount_atomic !== undefined && String(payload.exact_amount_atomic) !== scope.amount_atomic)) return unavailable();
    // The menu belongs to this version/hash, never the latest catalog release.
    const menu=await db.prepare(`SELECT json_group_array(component_id) AS component_ids FROM (
      SELECT json_extract(c.value,'$.id') AS component_id
      FROM component_releases r,json_each(r.manifest_json,'$.components') c
      WHERE r.sku=?1 AND r.version=?2 AND r.manifest_hash=?3
        AND json_extract(r.manifest_json,'$.sku')=?1 AND json_extract(r.manifest_json,'$.version')=?2 LIMIT 101)`)
      .bind(scope.sku,scope.version,scope.release_hash).first();
    const ids=JSON.parse(menu?.component_ids || 'null');
    if (!componentIds(ids) || !ids.length || scope.selected_components.some(id=>!ids.includes(id))) return unavailable();
    const selected=[...scope.selected_components].sort();
    const correlation={scope_correlation:'available',scope_hash:scope.scope_hash,
      release_hash:scope.release_hash,product_version_ref:scope.version,
      selected_share_bps:scope.selected_share_bps,
      selected_component_ids:selected,omitted_component_ids:ids.filter(id=>!selected.includes(id)).sort()};
    if (payload.quote_id) {
      const accepted=await db.prepare(`SELECT s.trial_id FROM component_acceptances a
        JOIN component_selections s ON s.trial_id=substr(a.acceptance_key,1,length(a.acceptance_key)-65)
          AND s.scope_hash=?2
        JOIN component_trials t ON t.id=s.trial_id
        WHERE a.quote_id=?1 AND a.acceptance_key=s.trial_id||':'||s.scope_hash
          AND t.sku=?3 AND t.version=?4 AND t.release_hash=?5 LIMIT 1`)
        .bind(payload.quote_id,scope.scope_hash,scope.sku,scope.version,scope.release_hash).first();
      if (accepted) correlation.trial_id=accepted.trial_id;
    }
    return {...event,payload:{...payload,...correlation}};
  } catch {
    // Optional correlation failure never includes database/provider diagnostics.
    return unavailable();
  }
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
      const event=await correlateScope(db,streamEvent(row));
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
