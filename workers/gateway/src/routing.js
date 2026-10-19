import {canonicalJson,sha256,CommerceError} from './contracts.js';
import {canonicalService} from './publication.js';
import {listCatalog} from './catalog.js';
import {readCandidateAlignment} from './clef.js';

export const ROUTING_VERSION='1';
// Provisional local policy; this is not a calibrated confidence guarantee.
export const CLEF_ROUTING_MIN_CONFIDENCE=0.5;
const dimensions=['aliases','tags','taxonomy_ids','problem_family_ids','operations','environments','desired_outcomes','input_kinds','failure_signatures','languages','runtimes','required_evidence','exclusions'];
const positiveDimensions=dimensions.filter(field=>field!=='required_evidence'&&field!=='exclusions');
const constraints={operation:'operations',environment:'environments',desired_outcome:'desired_outcomes',input_kind:'input_kinds',failure_signature:'failure_signatures',target_language:'languages',target_runtime:'runtimes',problem_family:'problem_family_ids',taxonomy_id:'taxonomy_ids'};
const token=/^[a-z0-9]+(?:[._:+/-][a-z0-9]+)*$/;
const fail=code=>{throw new CommerceError(code,400);};
export function validateRoutingManifest(m) {
  const errors=[];
  if(!m || typeof m!=='object') return ['routing_manifest_missing'];
  const allowed=new Set(['schema_version','product_id','sku','slug','version','release_ref','service','product_kind','route_summary','supported_boundary','language_policy',...dimensions]);
  if(Object.keys(m).some(key=>!allowed.has(key))) errors.push('unexpected_routing_field');
  if(m.schema_version!==ROUTING_VERSION) errors.push('routing_schema_unsupported');
  for(const key of ['product_id','sku','slug','release_ref','service','route_summary','supported_boundary'])
    if(typeof m[key]!=='string'||!m[key].trim()) errors.push(`${key}_missing`);
  if(!Number.isInteger(m.version)||m.version<1) errors.push('version_invalid');
  if(m.service!==canonicalService(m.service)) errors.push('service_not_canonical');
  if(!['guidance-product','artifact-product','executable-product','bundle'].includes(m.product_kind)) errors.push('product_kind_invalid');
  for(const field of dimensions) {
    if(!Array.isArray(m[field])||m[field].length>100||new Set(m[field]).size!==m[field].length||m[field].some(v=>typeof v!=='string'||!token.test(v))) errors.push(`${field}_invalid`);
  }
  if(!m.tags?.length) errors.push('tags_missing');
  if(!['not-applicable','explicit'].includes(m.language_policy)) errors.push('language_policy_invalid');
  if(m.language_policy==='explicit'&&!m.languages?.length) errors.push('languages_missing');
  return errors;
}
function intentValue(value) {
  if(typeof value==='string') value={goal:value};
  if(!value||Array.isArray(value)||typeof value!=='object') fail('invalid_intent');
  const allowed=new Set(['goal','sku','slug','alias','service','product_kind','evidence',...Object.keys(constraints)]);
  for(const [key,v] of Object.entries(value)) {
    if(!allowed.has(key)) fail('unsupported_intent_field');
    if(key==='evidence') {
      if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'||!token.test(x))) fail('invalid_intent_evidence');
    } else if(typeof v!=='string'||!v.trim()||v.length>2000) fail('invalid_intent_value');
  }
  if(!Object.keys(value).length) fail('intent_required');
  return {...value,...(value.service?{service:canonicalService(value.service)}:{})};
}

/** Unknown required constraints cannot pass through lexical similarity or Clef. */
export function evaluateCompatibility(manifest,input) {
  const intent=intentValue(input),conflicts=[],missing=[];
  if(intent.service&&manifest.service!==intent.service) conflicts.push('service');
  if(intent.product_kind&&manifest.product_kind!==intent.product_kind) conflicts.push('product_kind');
  for(const [key,field] of Object.entries(constraints)) if(intent[key]&&!manifest[field].includes(intent[key])) conflicts.push(key);
  for(const value of Object.values(intent).filter(v=>typeof v==='string')) if(manifest.exclusions.includes(value)) conflicts.push('explicit_exclusion');
  for(const field of manifest.required_evidence) if(!intent.evidence?.includes(field)) missing.push(`evidence:${field}`);
  if(manifest.language_policy==='explicit'&&!intent.target_language) missing.push('target_language');
  return {compatible:!conflicts.length&&!missing.length,conflicts:[...new Set(conflicts)],missing};
}

export async function resolveIntent(env,input,limit=10) {
  const intent=intentValue(input);
  if(!Number.isInteger(limit)||limit<1||limit>50) fail('invalid_search_limit');
  const products=await listCatalog(env.SW_DB),bySku=new Map(products.map(p=>[p.sku,p]));
  const {results}=await env.SW_DB.prepare('SELECT sku,version,manifest_json,manifest_hash FROM product_routing_manifests ORDER BY sku,version').all();
  const manifests=[];
  for(const row of results) {
    const product=bySku.get(row.sku);
    if(!product||product.version!==row.version) continue;
    const m=JSON.parse(row.manifest_json);
    if(validateRoutingManifest(m).length || await sha256(canonicalJson(m))!==row.manifest_hash
      || m.sku!==product.sku||m.version!==product.version||m.slug!==product.slug||m.service!==canonicalService(product.service))
      throw new CommerceError('routing_manifest_invalid',503);
    manifests.push({m,product,hash:row.manifest_hash});
  }
  const snapshot_ref='sha256:'+await sha256(canonicalJson(manifests.map(x=>[x.m.sku,x.m.version,x.hash])));
  const words=(intent.goal||'').toLowerCase().match(/[a-z0-9]+/g)||[];
  const candidates=[],eligible=[];
  for(const entry of manifests) {
    const {m,product}=entry;
    const identity=Boolean(intent.sku||intent.slug||intent.alias);
    if((intent.sku&&intent.sku!==m.sku)||(intent.slug&&intent.slug!==m.slug)
      ||(intent.alias&&!m.aliases.includes(intent.alias))) continue;
    const comparison=evaluateCompatibility(m,intent);
    if(comparison.conflicts.length) continue;
    const text=new Set([m.route_summary,m.slug,m.service,...positiveDimensions.flatMap(field=>m[field])]
      .join(' ').toLowerCase().match(/[a-z0-9]+/g)||[]);
    const meaningful=words.filter(w=>w.length>2&&!['the','this','that','and','for','with','want','make','need','aws','help','product'].includes(w));
    const score=identity?1000:new Set(meaningful.filter(w=>text.has(w))).size;
    const structured=Object.keys(intent).some(k=>k==='service'||k==='product_kind'||Object.hasOwn(constraints,k));
    const candidate={...entry,score,comparison};
    if(identity||meaningful.length||structured) eligible.push(candidate);
    if(!identity && ((meaningful.length && !score) || (!meaningful.length && !structured))) continue;
    candidates.push(candidate);
  }
  const order=(a,b)=>b.score-a.score||a.m.sku.localeCompare(b.m.sku);
  candidates.sort(order);eligible.sort(order);
  let compatible=candidates.filter(x=>x.comparison.compatible);
  let ranked=compatible.length?compatible:candidates,alignment;
  // Read at most 20 candidates without hard conflicts before lexical pruning
  // and the result limit. Missing configuration still blocks a complete match.
  if(env.CLEF_ROUTING_ENABLED==='true'&&eligible.length) {
    const pool=eligible.slice(0,20);
    try {
      alignment=await readCandidateAlignment(env.AI,intent,pool.map(x=>x.m),snapshot_ref);
      const reading=alignment.readings.candidate;
      const chosen=reading.confidence>=CLEF_ROUTING_MIN_CONFIDENCE
        ?pool.find((entry,index)=>reading.choice===`candidate_${index}`):undefined;
      if(chosen) {
        compatible=chosen.comparison.compatible?[chosen,...compatible.filter(entry=>entry!==chosen)]:[];
        ranked=chosen.comparison.compatible?compatible:[chosen];
      }
    } catch { alignment={status:'unavailable'}; }
  }
  const selected=ranked.slice(0,limit);
  const status=!ranked.length?'no_match':!compatible.length?'missing_configuration':compatible.length===1?'match':'multiple_candidates';
  const result={status,matched:compatible.length>0,snapshot_ref,compatibility_scope:'declared structured requirements',matches:selected.map(({product,m,comparison,score})=>({...product,routing:m,compatibility:comparison,score})),clarifications:[]};
  if(status==='missing_configuration') {
    const missing=[...new Set(selected.flatMap(x=>x.comparison.missing))];
    result.clarifications=missing.map(field=>({field,question:field==='target_language'?'What programming language do you want the product delivered in?':`Please supply ${field}.`}));
  }
  if(alignment) result.alignment=alignment;
  return result;
}
