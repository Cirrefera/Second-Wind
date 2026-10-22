// Versioned commerce event contract. Only explicitly selected fields leave D1.
export const EVENT_CONTRACT_VERSION = '1';
export const EVENT_REGISTRY = Object.freeze({
  'journey.linked':'journey',
  'discovery.searched':'discovery',
  'discovery.resolved':'discovery',
  'discovery.described':'discovery',
  'clarification.requested':'clarification',
  'clarification.responded':'clarification',
  'configuration.checked':'clarification',
  'selection.product_selected':'scope',
  'trial.started':'trial',
  'trial.completed':'trial',
  'trial.failed':'trial',
  'trial.expired_while_running':'trial',
  'scope.selected':'scope',
  'scope.accepted':'scope',
  'quote.created': 'quote',
  'payment.settlement_started': 'payment',
  'payment.settlement_pending': 'payment',
  'payment.settled': 'payment',
  'payment.failed': 'payment',
  'receipt.issued': 'receipt',
  'entitlement.activated': 'entitlement',
  'delivery.prepared':'delivery',
  'delivery.failed':'delivery',
  'recovery.grant_recovered':'recovery',
  'recovery.challenge_created':'recovery',
  'recovery.credential_rotated':'recovery',
  'recovery.result_recovered':'recovery',
  'recovery.trial_recovered':'recovery',
  'recovery.purchase_replayed':'recovery',
});
const baseFields = new Set(['payment_id','quote_id','sku','product_version_ref',
  'artifact_hash','exact_amount_atomic','payment_network','trial_id','release_hash','scope_hash','selected_share_bps']);
const observationFields = new Set(['journey_id','observation_id','transport',
  'candidate_product_ids','selected_product_ids','public_intent','result_count',
  'resolution_status','configuration_status','missing_count','error_count',
  'clarification_count','response_status','delivery_id','challenge_id']);
const fields = new Set([...baseFields,...observationFields]);
// These describe recorded transitions, never buyer motives or external success.
export const EVENT_OBSERVATIONS = Object.freeze({
  'journey.linked':Object.freeze({stage:'correlation',outcome:'linked'}),
  'discovery.searched':Object.freeze({stage:'discovery',outcome:'searched'}),
  'discovery.resolved':Object.freeze({stage:'discovery',outcome:'resolved'}),
  'discovery.described':Object.freeze({stage:'discovery',outcome:'described'}),
  'clarification.requested':Object.freeze({stage:'clarification',outcome:'requested'}),
  'clarification.responded':Object.freeze({stage:'clarification',outcome:'responded'}),
  'configuration.checked':Object.freeze({stage:'clarification',outcome:'configuration_checked'}),
  'selection.product_selected':Object.freeze({stage:'selection',outcome:'product_selected'}),
  'trial.started':Object.freeze({stage:'testing',outcome:'started'}),
  'trial.completed':Object.freeze({stage:'testing',outcome:'completed'}),
  'trial.failed':Object.freeze({stage:'testing',outcome:'failed'}),
  'trial.expired_while_running':Object.freeze({stage:'testing',outcome:'expiry_observed_while_running'}),
  'scope.selected':Object.freeze({stage:'selection',outcome:'selected'}),
  'scope.accepted':Object.freeze({stage:'selection',outcome:'accepted'}),
  'quote.created':Object.freeze({stage:'selection',outcome:'quote_created'}),
  'payment.settlement_started':Object.freeze({stage:'payment',outcome:'settlement_started'}),
  'payment.settlement_pending':Object.freeze({stage:'payment',outcome:'settlement_pending'}),
  'payment.settled':Object.freeze({stage:'payment',outcome:'settled'}),
  'payment.failed':Object.freeze({stage:'payment',outcome:'failed'}),
  'receipt.issued':Object.freeze({stage:'payment',outcome:'receipt_issued'}),
  'entitlement.activated':Object.freeze({stage:'payment',outcome:'entitlement_activated'}),
  'delivery.prepared':Object.freeze({stage:'delivery',outcome:'response_prepared'}),
  'delivery.failed':Object.freeze({stage:'delivery',outcome:'preparation_failed'}),
  'recovery.grant_recovered':Object.freeze({stage:'recovery',outcome:'grant_recovered'}),
  'recovery.challenge_created':Object.freeze({stage:'recovery',outcome:'challenge_created'}),
  'recovery.credential_rotated':Object.freeze({stage:'recovery',outcome:'credential_rotated'}),
  'recovery.result_recovered':Object.freeze({stage:'recovery',outcome:'result_recovered'}),
  'recovery.trial_recovered':Object.freeze({stage:'recovery',outcome:'trial_recovered'}),
  'recovery.purchase_replayed':Object.freeze({stage:'recovery',outcome:'purchase_replayed'}),
});
const digest = /^[a-f0-9]{64}$/;
const isDigest = value => typeof value === 'string' && digest.test(value);
const componentId = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const componentIds = ids => Array.isArray(ids) && ids.length <= 100
  && ids.every(id => typeof id === 'string' && componentId.test(id))
  && new Set(ids).size === ids.length;

const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const opaqueId = (value,prefix) => typeof value==='string' && new RegExp(`^${prefix}_${uuid}$`).test(value);
const productId=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const publicToken=/^[a-z0-9]+(?:[._:+/-][a-z0-9]+)*$/;
const intentFields=Object.freeze({service:'service',product_kind:'product_kind',operation:'operations',
  environment:'environments',desired_outcome:'desired_outcomes',input_kind:'input_kinds',
  failure_signature:'failure_signatures',target_language:'languages',target_runtime:'runtimes',
  problem_family:'problem_family_ids',taxonomy_id:'taxonomy_ids'});
const publicValue=value=>typeof value==='string' && value.length<=96 && publicToken.test(value);
const publicIntent=value=>value && !Array.isArray(value) && typeof value==='object'
  && Object.entries(value).length<=Object.keys(intentFields).length
  && Object.entries(value).every(([key,v])=>Object.hasOwn(intentFields,key) && publicValue(v));
const productIds=value=>Array.isArray(value) && value.length<=50
  && value.every(id=>typeof id==='string' && productId.test(id)) && new Set(value).size===value.length;
const enums={transport:['http','rpc','sandbox','internal'],
  resolution_status:['match','multiple_candidates','missing_configuration','no_match'],
  configuration_status:['complete','incomplete'],response_status:['received','invalid','timeout','failed']};
const observationTypes=new Set(['journey.linked','discovery.searched','discovery.resolved','discovery.described',
  'clarification.requested','clarification.responded','configuration.checked','selection.product_selected','delivery.prepared','delivery.failed',
  'recovery.grant_recovered','recovery.challenge_created','recovery.credential_rotated',
  'recovery.result_recovered','recovery.trial_recovered','recovery.purchase_replayed','trial.expired_while_running']);

/** Correlation is public, opaque, and never an authentication credential.
 * Each observed operation needs its own observation_id; retain it on retries.
 */
export function createJourneyContext(input={}) {
  return Object.freeze({
    journey_id:opaqueId(input?.journey_id,'jrn')?input.journey_id:`jrn_${crypto.randomUUID()}`,
    observation_id:opaqueId(input?.observation_id,'obs')?input.observation_id:`obs_${crypto.randomUUID()}`,
    transport:enums.transport.includes(input?.transport)?input.transport:'internal',
  });
}

/** Copy typed values only when they occur in reviewed public routing metadata.
 * Raw goals, search strings, aliases, answers and configuration are never copied.
 * The caller supplies already validated manifests, not buyer-provided vocabulary.
 */
export function publicIntentDimensions(intent,manifests=[]) {
  const dimensions={};
  if(!intent || typeof intent!=='object' || Array.isArray(intent) || !Array.isArray(manifests)) return dimensions;
  for(const [key,field] of Object.entries(intentFields)) {
    const value=intent[key];
    if(publicValue(value) && manifests.slice(0,1000).some(manifest=>
      Array.isArray(manifest?.[field])?manifest[field].includes(value):manifest?.[field]===value)) dimensions[key]=value;
  }
  return dimensions;
}

function validField(key,value) {
  if(!fields.has(key)) return false;
  if(['payment_id','quote_id','trial_id'].includes(key))
    return typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
  if(key==='sku') return typeof value==='string' && productId.test(value);
  if(key==='product_version_ref') return Number.isSafeInteger(value) && value>=1
    || typeof value==='string' && /^[1-9][0-9]{0,8}$/.test(value);
  if(key==='payment_network') return typeof value==='string' && /^eip155:[1-9][0-9]{0,15}$/.test(value);
  if(key==='journey_id') return opaqueId(value,'jrn');
  if(key==='observation_id') return opaqueId(value,'obs');
  if(key==='delivery_id') return opaqueId(value,'del');
  if(key==='challenge_id') return opaqueId(value,'rc');
  if(key==='candidate_product_ids'||key==='selected_product_ids') return productIds(value);
  if(key==='public_intent') return publicIntent(value);
  if(Object.hasOwn(enums,key)) return enums[key].includes(value);
  if(['result_count','missing_count','error_count','clarification_count'].includes(key))
    return Number.isInteger(value) && value>=0 && value<=5000;
  if(key==='artifact_hash' && value==='') return true;
  if(['artifact_hash','release_hash','scope_hash'].includes(key)) return isDigest(value);
  if(key==='exact_amount_atomic') return typeof value==='string' && /^[1-9][0-9]{0,15}$/.test(value);
  if(key==='selected_share_bps') return Number.isInteger(value) && value>=1 && value<=10000;
  return ['string','number'].includes(typeof value)
    && (typeof value==='number'?Number.isFinite(value):value.length<=200);
}

/** Best-effort observations use the existing outbox. Core commerce transitions
 * remain transactional triggers. Never include request bodies or caught errors.
 * A stable explicit observationId (or context.observation_id) gives idempotency.
 */
export function observationStatement(db,eventType,{journey,observationId,occurredTs,payload={}}={}) {
  if(!observationTypes.has(eventType) || !payload || Array.isArray(payload) || typeof payload!=='object')
    throw new Error('invalid_observation');
  if(journey && (!opaqueId(journey.journey_id,'jrn') || !opaqueId(journey.observation_id,'obs')
    || !enums.transport.includes(journey.transport))) throw new Error('invalid_observation');
  let id=observationId ?? journey?.observation_id;
  if(eventType==='journey.linked') {
    const keys=Object.keys(payload);
    if(!journey || keys.length!==1 || !['quote_id','trial_id'].includes(keys[0])) throw new Error('invalid_observation');
    const kind=keys[0]==='quote_id'?'quote':'trial',recordId=payload[keys[0]];
    if(!opaqueId(recordId,kind==='quote'?'q':'trial')) throw new Error('invalid_observation');
    id=`${kind}:${recordId}`;
    if(observationId!==undefined && observationId!==id) throw new Error('invalid_observation');
  } else if(typeof id!=='string' || !new RegExp(`^(?:obs|del|rc|trial|q|pay)_${uuid}$`).test(id)) {
    throw new Error('invalid_observation');
  }
  const stamp=occurredTs ?? new Date().toISOString();
  if(typeof stamp!=='string' || stamp.length>32 || !Number.isFinite(Date.parse(stamp))) throw new Error('invalid_observation');
  const context=journey?{journey_id:journey.journey_id,observation_id:journey.observation_id,transport:journey.transport}:{};
  if(Object.keys(payload).some(key=>['journey_id','observation_id','transport'].includes(key))) throw new Error('invalid_observation');
  for(const [key,value] of Object.entries(payload)) if(!validField(key,value)) throw new Error('invalid_event_field');
  const eventId=`${eventType}:${id}`,encoded=JSON.stringify({...payload,...context});
  streamEvent({event_id:eventId,event_type:eventType,occurred_ts:stamp,payload:encoded});
  if(encoded.length>8192) throw new Error('invalid_observation');
  return db.prepare(`INSERT INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
    VALUES (?1,?2,?3,?4) ON CONFLICT(event_id) DO NOTHING`).bind(eventId,eventType,stamp,encoded);
}

export async function enqueueObservation(env,eventType,options={}) {
  if(!env?.SW_DB) return {status:'not_configured'};
  let statement;
  try { statement=observationStatement(env.SW_DB,eventType,options); }
  catch(error) { return {status:['invalid_observation','invalid_event_field','unknown_event_type'].includes(error?.message)
    ?'invalid_observation':'unavailable'}; }
  try {
    const result=await statement.run();
    return {status:result.meta?.changes===0?'duplicate':'queued'};
  } catch {
    // Logging is optional. A privacy/DB/provider failure cannot change commerce.
    return {status:'unavailable'};
  }
}

/** Call after trial authentication when the recorded expiry is encountered.
 * Expiry of a still-running row proves no terminal execution outcome.
 */
export async function observeExpiredTrial(env,trialId,journey,{now=Date.now()}={}) {
  if(!opaqueId(trialId,'trial') || !Number.isSafeInteger(now)) return {status:'invalid_observation'};
  if(!env?.SW_DB) return {status:'not_configured'};
  try {
    const row=await env.SW_DB.prepare(`SELECT id,sku,version,release_hash FROM component_trials
      WHERE id=?1 AND status='running' AND expires_at<=?2`).bind(trialId,now).first();
    if(!row) return {status:'not_observed'};
    return enqueueObservation(env,'trial.expired_while_running',{journey,observationId:row.id,
      occurredTs:new Date(now).toISOString(),payload:{trial_id:row.id,sku:row.sku,
        product_version_ref:row.version,release_hash:row.release_hash}});
  } catch { return {status:'unavailable'}; }
}

export function streamEvent(row) {
  if (!Object.hasOwn(EVENT_REGISTRY, row.event_type)) throw new Error('unknown_event_type');
  const payload = JSON.parse(row.payload);
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('invalid_event_payload');
  for (const [key,value] of Object.entries(payload)) {
    if (!validField(key,value)) throw new Error('invalid_event_field');
  }
  // An execution quote has no artifact before execution. Existing triggers copy
  // its empty hash; absence is honest and must not poison otherwise valid events.
  if(payload.artifact_hash==='') delete payload.artifact_hash;
  const observation=EVENT_OBSERVATIONS[row.event_type];
  // Matches the existing stream's envelope; business dimensions live in payload.
  return {event_id:row.event_id, schema_version:'1', event_contract_version:EVENT_CONTRACT_VERSION,
    event_type:row.event_type, occurred_ts:row.occurred_ts,
    payload:{...payload,event_family:EVENT_REGISTRY[row.event_type],producer:'secondwind-gateway',
      journey_stage:observation.stage,observed_outcome:observation.outcome}};
}

/** Only exact primary-key link lookups; never correlate by time, buyer, or text.
 * The first durable link wins. A later request's correlation cannot rewrite it.
 */
async function correlateJourney(db,event) {
  if(event.payload.journey_id) return {...event,payload:{...event.payload,journey_correlation:'available'}};
  const keys=[];
  if(opaqueId(event.payload.quote_id,'q')) keys.push(['quote',event.payload.quote_id,'quote_id']);
  if(opaqueId(event.payload.trial_id,'trial')) keys.push(['trial',event.payload.trial_id,'trial_id']);
  if(!keys.length) return event;
  for(const [kind,id,field] of keys) {
    try {
      const row=await db.prepare("SELECT event_type,payload FROM business_event_outbox WHERE event_id=?1")
        .bind(`journey.linked:${kind}:${id}`).first();
      if(!row || row.event_type!=='journey.linked') continue;
      const link=JSON.parse(row.payload);
      if(link[field]!==id || !opaqueId(link.journey_id,'jrn') || !enums.transport.includes(link.transport)) continue;
      return {...event,payload:{...event.payload,journey_id:link.journey_id,
        transport:link.transport,journey_correlation:'available'}};
    } catch { /* Optional correlation must not block the valid base event. */ }
  }
  return {...event,payload:{...event.payload,journey_correlation:'unavailable'}};
}

/** Optional, read-only correlation from the exact persisted selection and release.
 * Missing evidence must not invent scope or stop an otherwise valid base event.
 * At most three indexed/bounded reads per event; no buyer config or code is read.
 */
async function correlateScope(db,event) {
  const payload=event.payload;
  if(event.event_type==='journey.linked') return event;
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
      selected_share_bps:scope.selected_share_bps,exact_amount_atomic:scope.amount_atomic,
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
      const event=await correlateJourney(db,await correlateScope(db,streamEvent(row)));
      await env.BUSINESS_EVENTS.send([event]);
      await db.prepare('UPDATE business_event_outbox SET sent_at=?1,attempts=attempts+1,last_error=NULL WHERE event_id=?2 AND sent_at IS NULL')
        .bind(new Date().toISOString(),row.event_id).run();
      sent++;
    } catch {
      // Do not persist provider exceptions: they can contain private request data.
      try {
        await db.prepare("UPDATE business_event_outbox SET attempts=attempts+1,last_error='dispatch_failed' WHERE event_id=?1 AND sent_at IS NULL")
          .bind(row.event_id).run();
      } catch { /* A failed diagnostic write cannot disclose errors or stop the batch. */ }
      failed++;
    }
  }
  return {status:failed?'retry_pending':'ok',sent,failed};
}
