import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {canonicalJson,sha256} from '../src/contracts.js';
import {CLEF_MODEL} from '../src/clef.js';
import {JEV_MODEL} from '../src/jev.js';
import {loadRoutingEvaluation,evaluateRouting,jevEvaluationAi,cloudflareEvaluationAi} from '../scripts/evaluate-routing.mjs';

const gatewayRoot=fileURLToPath(new URL('../',import.meta.url));
const fakeKey='evaluation-test-only-private-token';

async function smallCorpus(t,ids) {
  const {corpus}=await loadRoutingEvaluation();
  const directory=await mkdtemp(join(tmpdir(),'secondwind-routing-evaluation-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const selected={...corpus,cases:corpus.cases.filter(example=>ids.includes(example.id))};
  assert.equal(selected.cases.length,ids.length);
  const corpusPath=join(directory,'corpus.json');
  await writeFile(corpusPath,JSON.stringify(selected));
  return {corpus:selected,corpusPath,directory};
}

function fixtureResponse(request,corpus,{model=request.model}={}) {
  const shape=Boolean(request.questions.request_shape);
  const example=corpus.cases.find(example=>shape?example.intent.goal===request.state.goal:
    canonicalJson(example.intent)===canonicalJson(request.state.intent));
  assert.ok(example,'the request must correspond to an explicit fixed label');
  const reading=example.fixture_reading;
  if(shape) {
    const {choice,confidence,probabilities}=reading.request_shape;
    return {model,answers:{request_shape:{type:'choice',choice,confidence,
      probabilities:probabilities??Object.fromEntries(Object.keys(request.questions.request_shape.criteria).map(key=>[key,key===choice?1:0]))}},
      usage:{input_tokens:101,output_tokens:7}};
  }
  const index=reading.sku?request.state.candidates.findIndex(candidate=>candidate.sku===reading.sku):-1;
  if(reading.sku) assert.notEqual(index,-1);
  const choice=index<0?'unknown':`candidate_${index}`;
  const keys=Object.keys(request.questions.candidate.criteria);
  const support=Object.fromEntries(Object.entries(request.questions).filter(([,question])=>question.type==='noul').map(([id])=>{
    const match=/^candidate_fit_(\d+)(?:_(single_task|multiple_tasks|topic_discovery))?$/.exec(id);
    assert.ok(match,'each mocked support reading needs an explicit candidate and shape');
    const value=reading.candidate_support[request.state.candidates[Number(match[1])].sku];
    return [id,{type:'noul',noul:typeof value==='number'?value:value?.[match[2]||reading.request_shape.choice]}];
  }));
  return {model,answers:{...support,
    candidate:{type:'choice',choice,confidence:reading.confidence,
      probabilities:Object.fromEntries(keys.map(key=>[key,reading.confidence===0?1/keys.length:key===choice?1:0]))}},
    usage:{input_tokens:101,output_tokens:7}};
}

test('Jev evaluation preserves pinned requests and raw readings, records HTTP usage, and excludes injected responses from model accuracy',async t=>{
  const {corpus,corpusPath}=await smallCorpus(t,['artifact-exact-python','guidance-paraphrase',
    'guide-external-exactly-once','artifact-ruby-conflict']);
  const requests=[],receipts=[];
  const ai=jevEvaluationAi({apiKey:fakeKey,onResponse:receipt=>receipts.push(receipt),fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.headers.Authorization,`Bearer ${fakeKey}`);
    const request=JSON.parse(options.body);requests.push(request);
    assert.equal(request.model,JEV_MODEL);
    return Response.json(fixtureResponse(request,corpus),{headers:{'x-request-id':`test-${requests.length}`}});
  }});
  const report=await evaluateRouting({mode:'jev-live',ai,corpusPath});
  assert.equal(report.completed,4);assert.equal(report.passed,4);
  assert.equal(report.provider,'typesafe-live');assert.equal(report.model,JEV_MODEL);
  assert.deepEqual(report.response_models,[JEV_MODEL]);
  assert.equal(report.response_provenance,'injected-transport');
  assert.equal(report.semantic_accuracy_measured,false);
  assert.equal(report.cohorts.model_called.accuracy,null);
  assert.ok(report.model_calls>0);assert.equal(report.model_calls,requests.length);
  assert.equal(report.http.requests,requests.length);assert.equal(report.http.successes,requests.length);
  assert.equal(report.http.errors,0);assert.equal(report.http.unobserved_provider_calls,0);
  assert.deepEqual(report.usage.input_tokens,{total:requests.length*101,reported_requests:requests.length});
  assert.deepEqual(report.usage.output_tokens,{total:requests.length*7,reported_requests:requests.length});
  assert.equal(report.latency_ms.reported_requests,requests.length);assert.ok(report.latency_ms.total>=0);
  assert.equal(report.cohorts.application_only.completed+report.cohorts.model_called.completed,report.completed);
  assert.ok(report.cohorts.application_only.case_ids.includes('artifact-ruby-conflict'));
  assert.ok(report.cohorts.model_called.case_ids.includes('guidance-paraphrase'));
  assert.equal(report.cohorts.model_called.valid_readings,report.cohorts.model_called.completed);
  assert.equal(receipts.length,requests.length);
  const calls=report.cases.flatMap(example=>example.provider_calls);
  for(let index=0;index<calls.length;index++) {
    const call=calls[index],example=report.cases.find(example=>example.provider_calls.includes(call));
    assert.equal(call.request_hash,await sha256(canonicalJson(requests[index])));
    const reading=call.stage==='request_shape'?example.alignment.request_shape:example.alignment;
    assert.equal(call.request_hash,reading.request_hash);
    assert.equal(call.questions_hash,reading.questions_hash);
    assert.deepEqual(call.raw_readings,fixtureResponse(requests[index],corpus).answers);
    assert.equal(call.http_responses[0].request_hash,call.request_hash);
    assert.match(call.http_responses[0].response_hash,/^[a-f0-9]{64}$/);
    assert.equal(call.status,'returned');assert.ok(call.latency_ms>=0);
  }
  assert.ok(!JSON.stringify(report).includes(fakeKey));
  assert.ok(!JSON.stringify(report).includes('Authorization'));
});

test('HTTP rejection remains provider unavailability with no invented usage or secret response content',async t=>{
  const {corpusPath}=await smallCorpus(t,['guidance-paraphrase','artifact-ruby-conflict']);
  const ai=jevEvaluationAi({apiKey:fakeKey,fetchImpl:async()=>new Response(fakeKey,{status:429,
    headers:{'x-request-id':fakeKey}})});
  const report=await evaluateRouting({mode:'jev-live',ai,corpusPath});
  assert.equal(report.model_calls,1);assert.equal(report.http.requests,1);
  assert.equal(report.http.successes,0);assert.equal(report.http.errors,1);
  assert.equal(report.http.provider_errors,1);assert.equal(report.unavailable_readings,1);
  assert.equal(report.semantic_accuracy_measured,false);
  assert.deepEqual(report.usage.input_tokens,{total:null,reported_requests:0});
  const failed=report.cases.find(example=>example.id==='guidance-paraphrase');
  assert.equal(failed.observed.status,'no_match');assert.equal(failed.passed,false);
  assert.equal(failed.provider_calls[0].http_responses[0].error,'typesafe_http_429');
  assert.ok(!JSON.stringify(report).includes(fakeKey));
});

test('transport errors are counted separately and raw exception messages never enter the report',async t=>{
  const {corpusPath}=await smallCorpus(t,['guidance-paraphrase']);
  const ai=jevEvaluationAi({apiKey:fakeKey,fetchImpl:async()=>{throw new Error(`private transport detail ${fakeKey}`);}});
  const report=await evaluateRouting({mode:'jev-live',ai,corpusPath});
  assert.equal(report.http.requests,1);assert.equal(report.http.transport_errors,1);
  assert.equal(report.http.errors,0);assert.equal(report.unavailable_readings,1);
  assert.equal(report.cases[0].provider_calls[0].http_responses[0].error,'typesafe_network_error');
  assert.ok(!JSON.stringify(report).includes(fakeKey));
  assert.ok(!JSON.stringify(report).includes('private transport detail'));
});

test('successful HTTP with an invalid typed reading is not a successful model measurement',async t=>{
  const {corpus,corpusPath}=await smallCorpus(t,['guidance-paraphrase']);
  const ai=jevEvaluationAi({apiKey:fakeKey,fetchImpl:async(_url,options)=>{
    const response=fixtureResponse(JSON.parse(options.body),corpus);
    if(response.answers.candidate) response.answers.candidate.choice='outside-supplied-candidates';
    return Response.json(response);
  }});
  const report=await evaluateRouting({mode:'jev-live',ai,corpusPath});
  assert.equal(report.http.successes,2);assert.equal(report.http.provider_errors,0);
  assert.equal(report.unavailable_readings,1);assert.equal(report.cohorts.model_called.valid_readings,0);
  assert.equal(report.semantic_accuracy_measured,false);
  assert.equal(report.cases[0].provider_calls[1].raw_readings.candidate.choice,'outside-supplied-candidates');
  assert.deepEqual(report.usage.output_tokens,{total:14,reported_requests:2});
});

test('uncertain shape receipts remain one-call model cases without inventing candidate readings',async t=>{
  const {corpus,corpusPath}=await smallCorpus(t,['guidance-paraphrase','artifact-ruby-conflict']);
  const ai=jevEvaluationAi({apiKey:fakeKey,fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);
    assert.ok(request.questions.request_shape);
    const response=fixtureResponse(request,corpus);
    response.answers.request_shape.choice='unknown';
    response.answers.request_shape.probabilities=Object.fromEntries(Object.keys(request.questions.request_shape.criteria)
      .map(key=>[key,key==='unknown'?1:0]));
    return Response.json(response);
  }});
  const report=await evaluateRouting({mode:'jev-live',ai,corpusPath});
  assert.equal(report.model_calls,1);assert.equal(report.http.successes,1);
  assert.equal(report.unavailable_readings,0);assert.equal(report.uncertain_request_shapes,1);
  assert.equal(report.cohorts.model_called.completed,1);assert.equal(report.cohorts.model_called.valid_readings,0);
  assert.equal(report.cohorts.model_called.uncertain_request_shapes,1);
  assert.equal(report.cohorts.application_only.completed,1);
  const example=report.cases.find(example=>example.id==='guidance-paraphrase');
  assert.equal(example.observed.status,'no_match');assert.equal(example.passed,false);
  assert.equal(example.provider_calls[0].stage,'request_shape');
  assert.equal(example.provider_calls[0].request_hash,example.alignment.request_shape.request_hash);
  assert.equal(example.alignment.readings,undefined);
  assert.equal(report.semantic_accuracy_measured,false);
});

test('ambiguous known shapes preserve each actual support reading in both fixture and HTTP evidence',async t=>{
  const {corpus,corpusPath}=await smallCorpus(t,['guidance-paraphrase']);
  const reading=corpus.cases[0].fixture_reading;
  reading.request_shape={choice:'single_task',confidence:0.45,
    probabilities:{single_task:0.59,multiple_tasks:0.41,topic_discovery:0,unknown:0}};
  reading.candidate_support=Object.fromEntries(Object.entries(reading.candidate_support)
    .map(([sku,value])=>[sku,{single_task:value,multiple_tasks:value}]));
  await writeFile(corpusPath,JSON.stringify(corpus));
  const fixture=await evaluateRouting({mode:'fixture',corpusPath});
  const ai=jevEvaluationAi({apiKey:fakeKey,fetchImpl:async(_url,options)=>
    Response.json(fixtureResponse(JSON.parse(options.body),corpus))});
  const http=await evaluateRouting({mode:'jev-live',ai,corpusPath});
  for(const report of [fixture,http]) {
    assert.equal(report.passed,1);assert.equal(report.model_calls,2);
    assert.equal(report.uncertain_request_shapes,0);assert.equal(report.unavailable_readings,0);
    const example=report.cases[0],support=example.provider_calls[1];
    assert.equal(support.stage,'candidate_alignment');
    const map=example.alignment.support_questions;
    assert.ok(Object.keys(map).length>0);
    for(const mapping of Object.values(map)) {
      assert.deepEqual(Object.keys(mapping),['single_task','multiple_tasks']);
      for(const id of Object.values(mapping)) {
        assert.equal(example.alignment.readings[id].noul,support.raw_readings[id].noul);
        assert.equal(support.raw_readings[id].type,'noul');
      }
    }
    assert.equal(example.alignment.readings.candidate_fit_0,undefined);
    assert.equal(report.semantic_accuracy_measured,false,'scripted and injected readings are not live accuracy');
  }
  assert.equal(http.http.requests,2);assert.equal(http.http.successes,2);
  assert.deepEqual(http.usage.input_tokens,{total:202,reported_requests:2});
});

test('a transport timeout after the reader deadline stays attached to its original case',async t=>{
  const {corpusPath}=await smallCorpus(t,['guidance-paraphrase','artifact-ruby-conflict']);
  let aborted=0;
  const ai=jevEvaluationAi({apiKey:fakeKey,timeout_ms:5005,fetchImpl:async(_url,options)=>new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{aborted++;reject(new Error('aborted mock transport'));},{once:true});
  })});
  const report=await evaluateRouting({mode:'jev-live',ai,corpusPath});
  assert.equal(aborted,1);assert.equal(report.http.requests,1);
  assert.equal(report.http.transport_errors,1);assert.equal(report.http.unobserved_provider_calls,0);
  const timedOut=report.cases.find(example=>example.id==='guidance-paraphrase');
  const policyOnly=report.cases.find(example=>example.id==='artifact-ruby-conflict');
  assert.deepEqual(timedOut.alignment,{status:'unavailable'});
  assert.equal(timedOut.observed.status,'no_match');
  assert.equal(timedOut.provider_calls[0].http_responses.length,1);
  assert.equal(timedOut.provider_calls[0].http_responses[0].error,'typesafe_timeout');
  assert.equal(policyOnly.model_calls,0);assert.deepEqual(policyOnly.provider_calls,[]);
  assert.equal(report.semantic_accuracy_measured,false);
});

test('Cloudflare live mode retains its transport identifier and request model while reporting injected transport honestly',async t=>{
  const {corpus,corpusPath}=await smallCorpus(t,['guidance-paraphrase']);
  const ai=cloudflareEvaluationAi({account:'test-account',token:fakeKey,fetchImpl:async(url,options)=>{
    assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/${CLEF_MODEL}`);
    const request=JSON.parse(options.body);assert.equal(request.model,'clef-flash');
    return Response.json({success:true,result:fixtureResponse(request,corpus)});
  }});
  const report=await evaluateRouting({mode:'live',ai,corpusPath});
  assert.equal(report.passed,1);assert.equal(report.http.successes,2);assert.equal(report.unavailable_readings,0);
  assert.equal(report.provider,'cloudflare-live');assert.equal(report.model,CLEF_MODEL);
  assert.equal(report.cases[0].provider_calls[0].requested_model,CLEF_MODEL);
  assert.deepEqual(report.response_models,['clef-flash']);
  assert.equal(report.response_provenance,'injected-transport');assert.equal(report.semantic_accuracy_measured,false);
});

test('deterministic and scripted modes report separate cohorts without claiming measured semantic accuracy',async t=>{
  const {corpusPath}=await smallCorpus(t,['guidance-paraphrase','artifact-ruby-conflict']);
  let calls=0;
  const ai={provider:'typesafe-live',model:JEV_MODEL,response_provenance:'live-http',run:async()=>{calls++;throw new Error('must not call');}};
  const deterministic=await evaluateRouting({corpusPath,ai});
  assert.equal(deterministic.passed,2);assert.equal(deterministic.cohorts.application_only.completed,2);
  assert.equal(deterministic.cohorts.model_called.completed,0);assert.equal(deterministic.model,null);
  assert.equal(deterministic.semantic_accuracy_measured,false);
  const fixture=await evaluateRouting({mode:'fixture',corpusPath,ai});
  assert.equal(fixture.passed,2);assert.equal(fixture.cohorts.model_called.completed,1);
  assert.equal(fixture.provider,'scripted-contract-fixture');assert.equal(fixture.model,CLEF_MODEL);
  assert.equal(fixture.http.requests,0);assert.equal(fixture.semantic_accuracy_measured,false);
  assert.equal(calls,0);
});

test('jev-live CLI requires an environment key and never falls back to a credential file',async t=>{
  const {corpusPath,directory}=await smallCorpus(t,['guidance-paraphrase']);
  assert.throws(()=>jevEvaluationAi({apiKey:''}),/TYPESAFE_API_KEY is required for --jev-live/);
  const keyFile=join(directory,'test-key');await writeFile(keyFile,fakeKey);
  const env={...process.env,TYPESAFE_API_KEY_FILE:keyFile};delete env.TYPESAFE_API_KEY;
  const result=spawnSync(process.execPath,['scripts/evaluate-routing.mjs','--jev-live',join(directory,'report.json'),corpusPath],
    {cwd:gatewayRoot,env,encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.match(result.stderr,/TYPESAFE_API_KEY is required for --jev-live/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(fakeKey));
});
