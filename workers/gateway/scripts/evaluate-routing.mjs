import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256} from '../src/contracts.js';
import {resolveIntent,validateRoutingManifest,CLEF_ROUTING_MIN_CONFIDENCE,CLEF_ROUTING_EXISTS_MIN,CLEF_ROUTING_EXISTS_ABSENT} from '../src/routing.js';
import {canonicalService} from '../src/publication.js';
import {createFixtureDb,insertItem} from '../tests/helpers/d1.mjs';

const gatewayRoot=fileURLToPath(new URL('../',import.meta.url));
const defaultCorpus=new URL('../tests/fixtures/routing-evaluation.json',import.meta.url);
const columns=['sku','slug','name','kind','service','summary','guidance','price_usd','invoke_kind','invoke_key',
  'input_schema','input_example','mime_type','source_repo','source_path','source_url','license_spdx','provenance',
  'content_hash','version','updated_at'];

/** Read fixed labels and exact, reviewed source metadata. No catalog writes. */
export async function loadRoutingEvaluation(corpusPath=defaultCorpus) {
  const corpus=JSON.parse(await readFile(corpusPath,'utf8'));
  if(corpus.schema_version!=='1'||!Array.isArray(corpus.sources)||!corpus.sources.length
      ||!Array.isArray(corpus.cases)||!corpus.cases.length) throw new Error('invalid_evaluation_corpus');
  const sources=[];
  for(const source of corpus.sources) {
    const input=JSON.parse(await readFile(resolve(gatewayRoot,source.item_file),'utf8'));
    const item=Array.isArray(input)?input.find(item=>item.sku===source.sku):input.item||input;
    const routing=JSON.parse(await readFile(resolve(gatewayRoot,source.routing_file),'utf8'));
    if(!item||item.sku!==source.sku||item.version!==source.version||routing.sku!==item.sku
        ||routing.version!==item.version||routing.slug!==item.slug||validateRoutingManifest(routing).length)
      throw new Error('evaluation_source_identity_mismatch');
    const release=input.manifest||item.manifest,embedded=input.routing_manifest||item.routing_manifest;
    if(!release||!embedded||canonicalJson(embedded)!==canonicalJson(routing)
        ||routing.service!==canonicalService(item.service)
        ||['sku','slug','version','service','product_kind','release_ref'].some(key=>release[key]!==routing[key])
        ||(routing.language_policy==='explicit'&&(release.language_policy?.explicit_selection!==true
          ||!Array.isArray(release.language_policy?.adapters)
          ||canonicalJson([...release.language_policy.adapters].sort())!==canonicalJson([...routing.languages].sort()))))
      throw new Error('evaluation_release_routing_mismatch');
    const source_hash=await sha256(canonicalJson({item,routing}));
    if(source_hash!==source.source_hash) throw new Error('evaluation_source_snapshot_mismatch');
    sources.push({item,routing,source_hash});
  }
  if(new Set(sources.map(source=>source.item.sku)).size!==sources.length
      ||new Set(corpus.cases.map(item=>item.id)).size!==corpus.cases.length) throw new Error('evaluation_identity_duplicate');
  const identities=new Set(sources.map(source=>`${source.item.sku}:${source.item.version}`));
  for(const example of corpus.cases) {
    if(!example.id||!example.category||!example.rationale||!example.intent||!example.expected||!example.fallback_expected
        ||[example.expected,example.fallback_expected].some(label=>!['match','multiple_candidates','missing_configuration','no_match'].includes(label.status)
          ||!Array.isArray(label.products)||label.products.some(product=>!identities.has(`${product.sku}:${product.version}`))
          ||!Array.isArray(label.clarifications))) throw new Error('invalid_evaluation_label');
  }
  return {corpus,sources,corpus_ref:'sha256:'+await sha256(canonicalJson(corpus))};
}

/** Credentials are used only after an explicit --live invocation. */
export function cloudflareEvaluationAi({account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN}={}) {
  if(!account||!token) throw new Error('Cloudflare account ID and API token with Workers AI access are required for --live');
  return {provider:'cloudflare-live',run:async(model,body)=>{
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error(`clef_http_${response.status}`);
    const envelope=await response.json();
    if(envelope.success!==true) throw new Error('clef_provider_error');
    return envelope.result;
  }};
}

export const routingObservation=result=>({status:result.status,
  products:result.matches.map(({sku,version})=>({sku,version})).sort((a,b)=>a.sku.localeCompare(b.sku)||a.version-b.version),
  clarifications:result.clarifications.map(({field})=>field).sort()});

function fixtureAi(example) {
  const reading=example.fixture_reading;
  if(!reading) throw new Error('evaluation_fixture_reading_missing');
  return {provider:'scripted-contract-fixture',run:async(model,input)=>{
    if(reading.unavailable) throw new Error('fixture_provider_unavailable');
    const index=reading.sku?input.state.candidates.findIndex(candidate=>candidate.sku===reading.sku):-1;
    if(reading.sku&&index<0) throw new Error('fixture_choice_outside_candidate_pool');
    const choice=index<0?'unknown':`candidate_${index}`;
    const keys=Object.keys(input.questions.candidate.criteria);
    return {model:'clef-flash',answers:{answer_exists:{type:'noul',noul:reading.exists},
      candidate:{type:'choice',choice,confidence:reading.confidence,
        probabilities:Object.fromEntries(keys.map(key=>[key,reading.confidence===0?1/keys.length:key===choice?1:0]))}}};
  }};
}

/** Runs the real resolver over a local projection of reviewed draft releases.
 * Fixture decisions verify code paths; only successful live calls measure the
 * model against these labels. Neither is independent threshold calibration. */
export async function evaluateRouting({mode='deterministic',corpusPath=defaultCorpus,ai,onCheckpoint}={}) {
  if(!['deterministic','fixture','live'].includes(mode)) throw new Error('invalid_evaluation_mode');
  const {corpus,sources,corpus_ref}=await loadRoutingEvaluation(corpusPath);
  if(mode==='live'&&!ai) throw new Error('live_evaluation_ai_required');
  const db=createFixtureDb(),cases=[];
  let model_calls=0;
  try {
    for(const {item,routing} of sources) {
      // These draft candidates are visible only in this throwaway local DB.
      insertItem(db,{...Object.fromEntries(columns.filter(key=>Object.hasOwn(item,key)).map(key=>[key,
        typeof item[key]==='object'?JSON.stringify(item[key]):item[key]])),status:'live'});
      await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)')
        .bind(item.sku,item.version,canonicalJson(routing),await sha256(canonicalJson(routing)),'local-source-review','2026-10-19T00:00:00Z').run();
    }
    for(const example of corpus.cases) {
      const callsBefore=model_calls;
      const provider=mode==='fixture'?fixtureAi(example):ai;
      const env={SW_DB:db,...(mode!=='deterministic'?{CLEF_ROUTING_ENABLED:'true',AI:{run:async(...args)=>{
        model_calls++;return provider.run(...args);
      }}}:{})};
      const result=await resolveIntent(env,example.intent,example.limit||50),observed=routingObservation(result);
      const expected=mode==='deterministic'?example.fallback_expected:example.expected;
      cases.push({id:example.id,category:example.category,expected,observed,
        model_calls:model_calls-callsBefore,
        passed:canonicalJson(observed)===canonicalJson(expected),target:example.expected,
        snapshot_ref:result.snapshot_ref,...(result.alignment?{alignment:result.alignment}:{})});
      if(onCheckpoint) await onCheckpoint(report());
    }
    return report();
  } finally {db.close();}

  function report() {
    const unavailable=cases.filter(example=>example.alignment?.status==='unavailable').length;
    const live=mode==='live'&&ai?.provider==='cloudflare-live'&&model_calls>0;
    const complete=cases.length===corpus.cases.length;
    return {schema_version:'1',mode,corpus_ref,model_calls,
      source_scope:'isolated local projection of reviewed draft releases; no publication or deployed-serving claim',
      sources:sources.map(({item,source_hash})=>({sku:item.sku,version:item.version,status_in_source:item.status,source_hash})),
      thresholds:{choice_confidence:CLEF_ROUTING_MIN_CONFIDENCE,exists_present:CLEF_ROUTING_EXISTS_MIN,exists_absent_below:CLEF_ROUTING_EXISTS_ABSENT,calibrated:false},
      semantic_accuracy_measured:live&&complete&&unavailable===0,
      semantic_quality:live?(!complete?'incomplete live evaluation checkpoint':unavailable?'incomplete live evaluation; provider readings unavailable':'measured only on this fixed source-reviewed corpus; no held-out calibration'):'unverified; local deterministic or scripted decisions only',
      completed:cases.length,total:corpus.cases.length,passed:cases.filter(example=>example.passed).length,
      categories:Object.fromEntries([...new Set(corpus.cases.map(example=>example.category))].sort().map(category=>[category,{
        total:corpus.cases.filter(example=>example.category===category).length,
        completed:cases.filter(example=>example.category===category).length,
        passed:cases.filter(example=>example.category===category&&example.passed).length,
      }])),
      target_comparison:{status_agreement:cases.filter(example=>example.observed.status===example.target.status).length,
        false_match_cases:cases.filter(example=>example.target.status==='no_match'&&example.observed.products.length).length,
        missed_match_cases:cases.filter(example=>example.target.products.length&&!example.observed.products.length).length},
      unavailable_readings:unavailable,cases};
  }
}

async function main() {
  const args=process.argv.slice(2),flag=args[0]?.startsWith('--')?args.shift():'--deterministic';
  const mode=flag.slice(2),[output,corpusPath]=args;
  if(!['deterministic','fixture','live'].includes(mode)||!output||args.length>2)
    throw new Error('Usage: node scripts/evaluate-routing.mjs [--deterministic|--fixture|--live] report.json [corpus.json]');
  const result=await evaluateRouting({mode,...(corpusPath?{corpusPath}:{}),
    ...(mode==='live'?{ai:cloudflareEvaluationAi()}:{}),
    onCheckpoint:report=>writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600})});
  console.log(JSON.stringify({mode,completed:result.completed,total:result.total,passed:result.passed,
    model_calls:result.model_calls,semantic_accuracy_measured:result.semantic_accuracy_measured}));
  if(result.passed!==result.total||(mode==='live'&&result.unavailable_readings)) process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
