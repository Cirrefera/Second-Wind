import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256} from '../src/contracts.js';
import {resolveIntent,validateRoutingManifest,CLEF_ROUTING_MIN_CONFIDENCE,CLEF_ROUTING_EXISTS_MIN,CLEF_ROUTING_EXISTS_ABSENT} from '../src/routing.js';
import {canonicalService} from '../src/publication.js';
import {CLEF_MODEL} from '../src/clef.js';
import {createJevAi} from '../src/jev.js';
import {createFixtureDb,insertItem} from '../tests/helpers/d1.mjs';

const gatewayRoot=fileURLToPath(new URL('../',import.meta.url));
const defaultCorpus=new URL('../tests/fixtures/routing-evaluation.json',import.meta.url);
const columns=['sku','slug','name','kind','service','summary','guidance','price_usd','invoke_kind','invoke_key',
  'input_schema','input_example','mime_type','source_repo','source_path','source_url','license_spdx','provenance',
  'content_hash','version','updated_at'];
const liveModes=new Set(['live','jev-live']);
const tokenCount=value=>Number.isFinite(value)&&value>=0?value:null;
const elapsed=start=>Math.round((performance.now()-start)*1000)/1000;

// Reports intentionally exclude credentials, headers, response bodies and raw
// exception messages. Typed answers are recorded separately by the evaluator.
function responseMetadata(value) {
  return Object.fromEntries(Object.entries({
    provider:value.provider,endpoint:value.endpoint,model:value.model,response_model:value.response_model,
    http_status:Number.isInteger(value.http_status)?value.http_status:null,ok:value.ok===true,
    latency_ms:tokenCount(value.latency_ms),request_hash:value.request_hash,response_hash:value.response_hash,
    request_ids:value.request_ids,
    usage:value.usage?{input_tokens:tokenCount(value.usage.input_tokens),output_tokens:tokenCount(value.usage.output_tokens)}:undefined,
    error:value.error,
  }).filter(([,value])=>value!==undefined));
}

function responseCapture(onResponse) {
  const responses=[];
  return {responses,onResponse:value=>{
    const metadata=responseMetadata(value);responses.push(metadata);
    try {onResponse?.(metadata);} catch { /* Observation must not change inference. */ }
  }};
}

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
export function cloudflareEvaluationAi({account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,fetchImpl,onResponse}={}) {
  if(!account||!token) throw new Error('Cloudflare account ID and API token with Workers AI access are required for --live');
  const capture=responseCapture(onResponse),send=fetchImpl||fetch;
  return {provider:'cloudflare-live',response_provenance:fetchImpl?'injected-transport':'live-http',responses:capture.responses,run:async(model,body)=>{
    const start=performance.now(),request_hash=await sha256(canonicalJson(body));
    let response,result,error;
    try {
      response=await send(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`,{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      if(!response.ok) {error='clef_http_error';throw new Error(`clef_http_${response.status}`);}
      let envelope;
      try {envelope=await response.json();} catch {error='clef_invalid_json';throw new Error(error);}
      if(envelope?.success!==true) {error='clef_provider_error';throw new Error(error);}
      result=envelope.result;
      return result;
    } catch(caught) {error||='clef_transport_error';throw caught;}
    finally {
      capture.onResponse({provider:'cloudflare-live',model,response_model:result?.model,http_status:response?.status??null,
        ok:!error,latency_ms:elapsed(start),request_hash,error,
        usage:result?.usage?{input_tokens:result.usage.input_tokens??result.usage.prompt_tokens,
          output_tokens:result.usage.output_tokens??result.usage.completion_tokens}:undefined});
    }
  }};
}

/** The Jev key comes only from this explicit option or TYPESAFE_API_KEY. */
export function jevEvaluationAi({apiKey=process.env.TYPESAFE_API_KEY,model='jev-1.14.0',fetchImpl,timeout_ms=5000,onResponse}={}) {
  if(typeof apiKey!=='string'||!apiKey.trim()) throw new Error('TYPESAFE_API_KEY is required for --jev-live');
  const capture=responseCapture(onResponse);
  const ai=createJevAi({apiKey,model,timeout_ms,...(fetchImpl?{fetchImpl}:{}),onResponse:capture.onResponse});
  return {...ai,response_provenance:fetchImpl?'injected-transport':'live-http',responses:capture.responses};
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
  if(!['deterministic','fixture',...liveModes].includes(mode)) throw new Error('invalid_evaluation_mode');
  const {corpus,sources,corpus_ref}=await loadRoutingEvaluation(corpusPath);
  if(liveModes.has(mode)&&!ai) throw new Error('live_evaluation_ai_required');
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
      const callsBefore=model_calls,callDetails=[],pendingCalls=[];
      const provider=mode==='fixture'?fixtureAi(example):ai;
      const env={SW_DB:db,...(mode!=='deterministic'?{CLEF_ROUTING_ENABLED:'true',AI:{
        provider:provider.provider,...(provider.model?{model:provider.model}:{}),run:async(model,request)=>{
        model_calls++;
        let finished;
        pendingCalls.push(new Promise(resolve=>{finished=resolve;}));
        const start=performance.now(),responseStart=provider.responses?.length||0;
        const call={provider:provider.provider||'custom',requested_model:model,status:'pending',http_responses:[]};
        callDetails.push(call);
        try {
          call.request_hash=await sha256(canonicalJson(request));
          call.questions_hash=await sha256(canonicalJson(request.questions));
          const response=await provider.run(model,request);
          call.status='returned';
          if(typeof response?.model==='string') call.response_model=response.model;
          if(response?.answers&&typeof response.answers==='object') call.raw_readings=structuredClone(response.answers);
          return response;
        } catch(error) {
          call.status='error';call.error='provider_call_failed';throw error;
        } finally {
          call.latency_ms=elapsed(start);
          call.http_responses=(provider.responses||[]).slice(responseStart)
            .filter(response=>!response.request_hash||response.request_hash===call.request_hash);
          finished();
        }
      }}}:{})};
      const result=await resolveIntent(env,example.intent,example.limit||50);
      // The reader can time out just before a transport's own bounded timeout.
      // Keep its fallback decision, but finish collecting that attempt's receipt
      // before the next case. Otherwise a late HTTP result could be lost or
      // attributed to a different case. Both built-in HTTP adapters are bounded.
      if(liveModes.has(mode)&&Array.isArray(provider.responses)) await Promise.all(pendingCalls);
      const observed=routingObservation(result);
      const expected=mode==='deterministic'?example.fallback_expected:example.expected;
      cases.push({id:example.id,category:example.category,expected,observed,
        model_calls:model_calls-callsBefore,evaluation_scope:callDetails.length?'model-called':'application-only',
        provider_calls:callDetails,
        passed:canonicalJson(observed)===canonicalJson(expected),target:example.expected,
        snapshot_ref:result.snapshot_ref,...(result.alignment?{alignment:result.alignment}:{})});
      if(onCheckpoint) await onCheckpoint(report());
    }
    return report();
  } finally {db.close();}

  function report() {
    const unavailable=cases.filter(example=>example.alignment?.status==='unavailable').length;
    const provider=mode==='deterministic'?'none':mode==='fixture'?'scripted-contract-fixture':ai?.provider||'custom';
    const response_provenance=mode==='deterministic'?'none':mode==='fixture'?'scripted-contract-fixture':ai?.response_provenance||'unverified';
    const calls=cases.flatMap(example=>example.provider_calls),http=calls.flatMap(call=>call.http_responses);
    const live=liveModes.has(mode)&&['cloudflare-live','typesafe-live'].includes(provider)&&response_provenance==='live-http'&&model_calls>0;
    const complete=cases.length===corpus.cases.length;
    const observedHttp=http.length===model_calls&&http.every(response=>response.ok&&response.http_status>=200&&response.http_status<300);
    const measured=live&&complete&&unavailable===0&&observedHttp;
    const cohort=selected=>({completed:selected.length,passed:selected.filter(example=>example.passed).length,
      target_agreement:selected.filter(example=>canonicalJson(example.observed)===canonicalJson(example.target)).length,
      case_ids:selected.map(example=>example.id)});
    const tokenTotals=key=>{
      const values=http.map(response=>tokenCount(response.usage?.[key])).filter(value=>value!==null);
      return {total:values.length?values.reduce((sum,value)=>sum+value,0):null,reported_requests:values.length};
    };
    const latencies=http.map(response=>tokenCount(response.latency_ms)).filter(value=>value!==null);
    return {schema_version:'1',mode,provider,model:mode==='deterministic'?null:mode==='fixture'?CLEF_MODEL:ai?.model||CLEF_MODEL,
      response_models:[...new Set(calls.map(call=>call.response_model).filter(Boolean))].sort(),response_provenance,corpus_ref,model_calls,
      http:{requests:http.length,successes:http.filter(response=>response.http_status>=200&&response.http_status<300).length,
        errors:http.filter(response=>response.http_status!==null&&(response.http_status<200||response.http_status>=300)).length,
        transport_errors:http.filter(response=>response.http_status===null&&response.error).length,
        provider_errors:http.filter(response=>response.error).length,
        unobserved_provider_calls:liveModes.has(mode)?Math.max(0,model_calls-http.length):0},
      usage:{input_tokens:tokenTotals('input_tokens'),output_tokens:tokenTotals('output_tokens')},
      latency_ms:{reported_requests:latencies.length,total:latencies.length?latencies.reduce((sum,value)=>sum+value,0):null,
        mean:latencies.length?latencies.reduce((sum,value)=>sum+value,0)/latencies.length:null,
        max:latencies.length?Math.max(...latencies):null},
      source_scope:'isolated local projection of reviewed draft releases; no publication or deployed-serving claim',
      sources:sources.map(({item,source_hash})=>({sku:item.sku,version:item.version,status_in_source:item.status,source_hash})),
      thresholds:{choice_confidence:CLEF_ROUTING_MIN_CONFIDENCE,exists_present:CLEF_ROUTING_EXISTS_MIN,exists_absent_below:CLEF_ROUTING_EXISTS_ABSENT,calibrated:false},
      semantic_accuracy_measured:measured,
      semantic_measurement_scope:'model-called cases only; application-only cases are excluded from model accuracy',
      semantic_quality:live?(!complete?'incomplete live evaluation checkpoint':unavailable||!observedHttp?'incomplete live evaluation; provider readings or HTTP evidence unavailable':'measured only on model-called cases in this fixed source-reviewed corpus; no held-out calibration'):'unverified; deterministic, scripted, injected or unverified provider decisions only',
      completed:cases.length,total:corpus.cases.length,passed:cases.filter(example=>example.passed).length,
      cohorts:{application_only:cohort(cases.filter(example=>example.model_calls===0)),
        model_called:{...cohort(cases.filter(example=>example.model_calls>0)),
          valid_readings:cases.filter(example=>example.model_calls>0&&example.alignment?.readings).length,
          accuracy:measured?cases.filter(example=>example.model_calls>0&&example.passed).length/cases.filter(example=>example.model_calls>0).length:null}},
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
  if(!['deterministic','fixture',...liveModes].includes(mode)||!output||args.length>2)
    throw new Error('Usage: node scripts/evaluate-routing.mjs [--deterministic|--fixture|--live|--jev-live] report.json [corpus.json]');
  const result=await evaluateRouting({mode,...(corpusPath?{corpusPath}:{}),
    ...(mode==='live'?{ai:cloudflareEvaluationAi()}:{}),
    ...(mode==='jev-live'?{ai:jevEvaluationAi()}:{}),
    onCheckpoint:report=>writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600})});
  console.log(JSON.stringify({mode,provider:result.provider,model:result.model,completed:result.completed,total:result.total,passed:result.passed,
    model_calls:result.model_calls,http:result.http,usage:result.usage,latency_ms:result.latency_ms,
    semantic_accuracy_measured:result.semantic_accuracy_measured}));
  if(result.passed!==result.total||(liveModes.has(mode)&&result.unavailable_readings)) process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
