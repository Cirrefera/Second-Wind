import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {canonicalJson,sha256} from '../src/contracts.js';
import {resolveIntent,validateRoutingManifest} from '../src/routing.js';
import {searchCatalog} from '../src/catalog.js';
import {ProductService} from '../src/product-service.js';
import {createApp} from '../src/index.js';
import {RpcTarget,newHttpBatchRpcSession,newMessagePortRpcSession} from 'capnweb';
import {createJourneyContext} from '../src/telemetry.js';
import {loadRoutingEvaluation,evaluateRouting,cloudflareEvaluationAi} from '../scripts/evaluate-routing.mjs';
const routingResponse=(input,{choice='candidate_0',confidence=1,support,
 shape='single_task',shapeConfidence=1,shapeProbabilities}={})=>{
 const question=input.questions.request_shape?'request_shape':'candidate';
 const selected=question==='request_shape'?shape:choice;
 const answers={[question]:{type:'choice',choice:selected,confidence:question==='request_shape'?shapeConfidence:confidence,
  probabilities:question==='request_shape'&&shapeProbabilities?shapeProbabilities
   :Object.fromEntries(Object.keys(input.questions[question].criteria).map(key=>[key,key===selected?1:0]))}};
 if(question==='candidate') {
  assert.equal(support?.length,input.state.candidates.length,'each evaluated candidate needs an explicit individual fit');
  for(const [id,question] of Object.entries(input.questions).filter(([,question])=>question.type==='noul')) {
   const match=/^candidate_fit_(\d+)(?:_(single_task|multiple_tasks|topic_discovery))?$/.exec(id);
   assert.ok(match,'the fixture must recognize each support question');
   const value=support[Number(match[1])];
   answers[id]={type:'noul',noul:typeof value==='number'?value:value?.[match[2]||shape]};
  }
 }
 return {model:'clef-flash',answers};
};
const manifest=item=>({schema_version:'1',product_id:'lambda-retry',sku:item.sku,slug:item.slug,version:item.version,
 release_ref:'release:one',service:'lambda',product_kind:'artifact-product',route_summary:'Lambda duplicate processing idempotency',
 supported_boundary:'Duplicate event handling in Lambda',aliases:['retry-safety'],tags:['idempotency','duplicate-processing'],
 taxonomy_ids:['aws.lambda'],problem_family_ids:['duplicate-processing'],operations:['deduplicate'],environments:['lambda'],
 desired_outcomes:['retry-safety'],input_kinds:['event'],failure_signatures:['duplicate-event'],languages:['javascript'],runtimes:['nodejs22'],
 required_evidence:[],exclusions:['exactly-once-external-effects'],language_policy:'explicit'});
async function fixture(t,patch={}){
 const db=createFixtureDb();t.after(()=>db.close());const item=insertItem(db,{service:'lambda'}),m={...manifest(item),...patch};
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(item.sku,item.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 return {env:{SW_DB:db},item,m,db};
}
test('unregistered live releases retain literal legacy string search and empty browse without model calls',async t=>{
 const db=createFixtureDb();t.after(()=>db.close());
 insertItem(db,{service:'lambda',name:'Lambda idempotency'});
 insertItem(db,{sku:'SECOND',slug:'second',service:'lambda',name:'Second Lambda guide'});
 insertItem(db,{sku:'DRAFT',slug:'draft',service:'lambda',status:'draft'});
 let calls=0;const env={SW_DB:db,CLEF_ROUTING_ENABLED:'true',AI:{run:async()=>{calls++;throw new Error('must not run');}}};
 for(const query of ['lambda','','  ','%','_','no such product']) {
  const result=await resolveIntent(env,query,1),expected=await searchCatalog(db,query,1);
  assert.deepEqual(result.matches,expected);
  assert.equal(result.matched,expected.length>0);
  assert.equal(result.status,expected.length?'matches':'no_match');
  assert.equal(result.routing_ready,false);
  assert.equal(result.compatibility_scope,'legacy live catalog metadata; structured compatibility not evaluated');
  assert.equal(result.snapshot_ref,null);assert.deepEqual(result.clarifications,[]);
  assert.ok(result.matches.every(product=>!Object.hasOwn(product,'routing')&&!Object.hasOwn(product,'compatibility')));
 }
 await assert.rejects(resolveIntent(env,'x'.repeat(201)),error=>error.code==='invalid_search_query');
 await assert.rejects(resolveIntent(env,'lambda',51),error=>error.code==='invalid_search_limit');
 assert.equal(calls,0);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM product_routing_manifests').get().count,0);
});
test('structured intent reports unavailable routing instead of guessing constraints for an unregistered live release',async t=>{
 const db=createFixtureDb();t.after(()=>db.close());const item=insertItem(db,{service:'lambda'});
 const env={SW_DB:db};
 for(const intent of [{sku:item.sku},{goal:'lambda'},{sku:item.sku,target_language:'python',target_runtime:'nodejs22'}]) {
  await assert.rejects(resolveIntent(env,intent),error=>error.code==='routing_not_configured'&&error.status===503);
  await assert.rejects(new ProductService(env).searchIntent(intent),error=>error.code==='routing_not_configured'&&error.status===503);
 }
 const response=await createApp().fetch(new Request('https://secondwindai.com/api/resolve',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent:{sku:item.sku,target_language:'python'}})}),env,{waitUntil(){}});
 assert.equal(response.status,503);assert.equal((await response.json()).error,'routing_not_configured');
});
test('mixed routing coverage does not turn an unregistered requested live version into a no-match',async t=>{
 const {env,db,item}=await fixture(t);
 const unregistered=insertItem(db,{sku:'UNREGISTERED',slug:'unregistered',service:'lambda',version:2});
 let calls=0;env.CLEF_ROUTING_ENABLED='true';env.AI={run:async()=>{calls++;throw new Error('must not run');}};
 for(const stale of [false,true]) {
  if(stale) {
   const old={...manifest(unregistered),version:1};
   await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)')
    .bind(unregistered.sku,1,canonicalJson(old),await sha256(canonicalJson(old)),'fixture',new Date().toISOString()).run();
  }
  for(const identity of [{sku:unregistered.sku},{slug:unregistered.slug}]) {
   const intent={...identity,target_language:'javascript'};
   const unavailable=error=>error.code==='routing_not_configured'&&error.status===503
    &&error.details.reason==='version_matched_routing_manifest_missing';
   await assert.rejects(resolveIntent(env,intent),unavailable);
   await assert.rejects(new ProductService(env).searchIntent(intent),unavailable);
   const response=await createApp().fetch(new Request('https://secondwindai.com/api/resolve',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent})}),env,{waitUntil(){}});
   assert.equal(response.status,503);assert.equal((await response.json()).error,'routing_not_configured');
  }
 }
 assert.equal((await resolveIntent(env,{sku:item.sku,target_language:'javascript'})).status,'match');
 assert.equal((await resolveIntent(env,{sku:'UNKNOWN',target_language:'javascript'})).status,'no_match');
 assert.equal(calls,0);
});
test('HTTP and capability string search preserve legacy matching while observations omit private query text',async t=>{
 const db=createFixtureDb();t.after(()=>db.close());const item=insertItem(db,{service:'lambda'}),env={SW_DB:db};
 for(const body of [{query:'lambda'},{intent:'lambda'},{}]) {
  const response=await createApp().fetch(new Request('https://secondwindai.com/api/resolve',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env,{waitUntil(){}});
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.status,'matches');assert.equal(result.routing_ready,false);
  assert.deepEqual(result.matches.map(product=>product.sku),[item.sku]);
 }
 const rpc=await new ProductService(env).searchIntent('lambda');
 assert.equal(rpc.status,'matches');assert.equal(rpc.routing_ready,false);
 assert.equal((await rpc.candidates[0].product.info()).sku,item.sku);
 const journey=createJourneyContext();
 await resolveIntent(env,'private-buyer-query-secret',10,{journey});
 const rows=db.sqlite.prepare("SELECT event_type,payload FROM business_event_outbox WHERE event_type LIKE 'discovery.%' ORDER BY rowid").all();
 const privateOperation=rows.filter(row=>JSON.parse(row.payload).journey_id===journey.journey_id);
 assert.deepEqual(privateOperation.map(row=>row.event_type),['discovery.searched','discovery.resolved']);
 assert.equal(JSON.parse(privateOperation[1].payload).resolution_status,'no_match');
 assert.ok(!JSON.stringify(rows).includes('private-buyer-query-secret'));
});
test('a genuinely empty live catalog can report no match without routing registration',async t=>{
 const db=createFixtureDb();t.after(()=>db.close());const env={SW_DB:db};
 assert.equal((await resolveIntent(env,{sku:'missing'})).status,'no_match');
 assert.equal((await resolveIntent(env,'')).status,'no_match');
});
test('shared resolver observations record only reviewed public dimensions, including no-match operations',async t=>{
 const {env,db}=await fixture(t),journey=createJourneyContext({transport:'rpc'});
 const intent={goal:'quantum gardening private-payment-token',target_language:'javascript',
  taxonomy_id:'private.account-id',evidence:['private-evidence']};
 const baseline=await resolveIntent(env,intent);
 for(let index=0;index<2;index++) assert.deepEqual(await resolveIntent(env,intent,10,{journey}),baseline);
 const rows=db.sqlite.prepare("SELECT event_type,payload FROM business_event_outbox WHERE event_type LIKE 'discovery.%' ORDER BY rowid").all();
 assert.equal(rows.length,4);
 const observations=rows.map(row=>({type:row.event_type,...JSON.parse(row.payload)}));
 assert.deepEqual(observations.map(row=>row.type),['discovery.searched','discovery.resolved','discovery.searched','discovery.resolved']);
 assert.ok(observations.every(row=>row.journey_id===journey.journey_id&&row.transport==='rpc'));
 assert.ok(observations.every(row=>JSON.stringify(row.public_intent)==='{"target_language":"javascript"}'));
 assert.equal(observations[0].observation_id,observations[1].observation_id);
 assert.equal(observations[2].observation_id,observations[3].observation_id);
 assert.notEqual(observations[0].observation_id,observations[2].observation_id);
 assert.notEqual(observations[0].observation_id,journey.observation_id);
 for(const result of [observations[1],observations[3]]) {
  assert.deepEqual(result.candidate_product_ids,[]);assert.equal(result.result_count,0);assert.equal(result.resolution_status,'no_match');
 }
 assert.ok(!JSON.stringify(observations).includes('private'));
});

test('optional discovery observation storage failure preserves routing results',async t=>{
 const {env,db,item}=await fixture(t),intent={sku:item.sku,target_language:'javascript'};
 const baseline=await resolveIntent(env,intent);
 db.sqlite.exec('DROP TABLE business_event_outbox');
 assert.deepEqual(await resolveIntent(env,intent,10,{journey:createJourneyContext()}),baseline);
});
test('fixed evaluation corpus accepts exact real draft metadata and preserves labeled deterministic and typed-fixture behavior',async()=>{
 const source=await loadRoutingEvaluation();
 assert.deepEqual(source.sources.map(({item})=>[item.sku,item.version,item.status]),[['AWS-0568',2,'draft'],['SW-PT-0006',2,'draft']]);
 assert.equal(source.corpus.cases.length,34);
 assert.deepEqual([...new Set(source.corpus.cases.map(example=>example.category))].sort(),
  ['ambiguous','exact-match','hard-conflict','hard-negative','identity-conflict','missing-language','multi-candidate','no-match','semantic-recall','structured-match']);
 let calls=0;
 const deterministic=await evaluateRouting({ai:{run:()=>{calls++;throw new Error('must not call');}}});
 assert.equal(calls,0);assert.equal(deterministic.model_calls,0);
 assert.equal(deterministic.completed,34);assert.equal(deterministic.passed,34);
 assert.equal(deterministic.semantic_accuracy_measured,false);assert.equal(deterministic.thresholds.calibrated,false);
 assert.equal(deterministic.target_comparison.false_match_cases,6);
 const scripted=await evaluateRouting({mode:'fixture'});
 assert.equal(scripted.completed,34);assert.equal(scripted.passed,34);assert.equal(scripted.model_calls,24);
 assert.equal(scripted.semantic_accuracy_measured,false);assert.equal(scripted.thresholds.calibrated,false);
 assert.equal(scripted.target_comparison.false_match_cases,0);
 assert.equal(scripted.target_comparison.missed_match_cases,0);
 for(const example of scripted.cases.filter(example=>['hard-conflict','identity-conflict'].includes(example.category)))
  assert.equal(example.model_calls,0,example.id);
 const negative=scripted.cases.find(example=>example.id==='guide-external-exactly-once');
 assert.equal(negative.observed.status,'no_match');assert.equal(negative.alignment.negative_scope,'evaluated_candidates_only');
 const pending=scripted.cases.find(example=>example.id==='guidance-semantic-missing-language');
 assert.deepEqual(pending.observed,{status:'missing_configuration',products:[{sku:'SW-PT-0006',version:2}],clarifications:['target_language']});
 assert.equal(scripted.cases.find(example=>example.id==='two-compatible-candidates').observed.status,'multiple_candidates');
 assert.equal(scripted.cases.find(example=>example.id==='ambiguous-language-only').model_calls,0);
 assert.equal(scripted.cases.find(example=>example.id==='ambiguous-language-only').alignment,undefined);
 assert.deepEqual((await loadRoutingEvaluation()).sources,source.sources);
 await assert.rejects(evaluateRouting({mode:'live'}),/live_evaluation_ai_required/);
 assert.throws(()=>cloudflareEvaluationAi({account:'',token:''}),/required for --live/);
});
test('unavailable Clef preserves deterministic candidates and status',async t=>{
 const {env,db}=await fixture(t);
 const item=insertItem(db,{sku:'SECOND',slug:'second',service:'lambda'}),m=manifest(item);
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(item.sku,item.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 const intent={goal:'Lambda idempotency',target_language:'javascript'};
 const baseline=await resolveIntent(env,intent);
 assert.equal(baseline.matches.length,2);
 let calls=0;
 env.CLEF_ROUTING_ENABLED='true';
 env.AI={run:async()=>{calls++;throw new Error('provider_unavailable');}};
 const result=await resolveIntent(env,intent);
 assert.equal(calls,1);
 assert.deepEqual(result.alignment,{status:'unavailable'});
 const {alignment,...unchanged}=result;
 assert.deepEqual(unchanged,baseline);
});
test('uncertain request shape makes one call and preserves fallback over HTTP and Cap\'n Web',async t=>{
 const {env}=await fixture(t),intent={goal:'Lambda idempotency',target_language:'javascript'};
 const baseline=await resolveIntent(env,intent),app=createApp(),realFetch=globalThis.fetch;
 env.CLEF_ROUTING_ENABLED='true';
 globalThis.fetch=async(input,init)=>app.fetch(new Request(input,init),env,{waitUntil(){}});
 try {
  for(const [shape,shapeConfidence] of [['unknown',1],['single_task',0.49]]) {
   let calls=0;
   env.AI={run:async(model,input)=>{
    calls++;assert.ok(input.questions.request_shape,'uncertain shape must not start candidate evaluation');
    return routingResponse(input,{shape,shapeConfidence,...(shape==='single_task'?{
     shapeProbabilities:{single_task:0.6,multiple_tasks:0,topic_discovery:0,unknown:0.4}}:{})});
   }};
   const response=await app.fetch(new Request('https://secondwindai.com/api/resolve',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent})}),env,{waitUntil(){}});
   assert.equal(response.status,200);const http=await response.json();
   const {alignment,...unchanged}=http;assert.deepEqual(unchanged,baseline);
   assert.equal(alignment.status,'uncertain_request_shape');
   assert.deepEqual(alignment.candidate_scope,{evaluated_count:0,eligible_count:1,complete:false});
   assert.equal(alignment.readings,undefined);assert.equal(alignment.negative_scope,undefined);
   assert.equal(calls,1);
   const {candidates,...rpc}=await newHttpBatchRpcSession('https://secondwindai.com/capnp').searchIntent(intent);
   assert.deepEqual(rpc,http);assert.equal(calls,2);
   for(const candidate of candidates) candidate.product[Symbol.dispose]();
  }
 } finally {globalThis.fetch=realFetch;}
});

test('a malformed second response preserves the whole fallback instead of applying partial negatives',async t=>{
 const {env,db}=await fixture(t),second=insertItem(db,{sku:'SECOND',slug:'second',service:'lambda'}),m=manifest(second);
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)')
  .bind(second.sku,second.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 const intent={goal:'Lambda idempotency',target_language:'javascript'},baseline=await resolveIntent(env,intent);
 assert.equal(baseline.matches.length,2);
 for(const defect of ['missing-fit','invalid-fit','provider-failure']) {
  let calls=0;
  const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:async(model,input)=>{
   calls++;
   if(input.questions.request_shape) return routingResponse(input);
   if(defect==='provider-failure') throw new Error('second_request_failed');
   const response=routingResponse(input,{support:[0.01,0.01]});
   if(defect==='missing-fit') delete response.answers.candidate_fit_1;
   else response.answers.candidate_fit_1.noul=1.01;
   return response;
  }}},intent);
  const {alignment,...unchanged}=result;
  assert.equal(calls,2);assert.deepEqual(alignment,{status:'unavailable'});
  assert.deepEqual(unchanged,baseline);
 }
});
test('individual fit boundaries remove only confident negatives and preserve uncertain lexical membership',async t=>{
 const {env}=await fixture(t),intent={goal:'Lambda idempotency exactly once external effects',target_language:'javascript'};
 const baseline=await resolveIntent(env,intent);assert.equal(baseline.status,'match');
 let calls=0;
 for(const choice of ['unknown','candidate_0']) for(const fit of [0,0.349,0.35,0.699,0.7]) {
  const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:async(model,input)=>{
   calls++;return routingResponse(input,{choice,support:[fit]});
  }}},intent);
  if(fit<0.35) {
   assert.equal(result.status,'no_match');assert.equal(result.matched,false);
   assert.deepEqual(result.matches,[]);assert.deepEqual(result.clarifications,[]);
   assert.equal(result.alignment.negative_scope,'evaluated_candidates_only');
  } else {
   const {alignment,...fallback}=result;assert.deepEqual(fallback,baseline);
   assert.equal(alignment.negative_scope,undefined);
  }
  assert.equal(result.alignment.readings.candidate_fit_0.noul,fit);
 }
 assert.equal(calls,20);
});

test('individual support promotes at .7 independently of Choice while middle readings cannot create matches',async t=>{
 const {env}=await fixture(t),intent={goal:'avoid repeated work',target_language:'javascript'};
 assert.equal((await resolveIntent(env,intent)).status,'no_match');
 for(const fit of [0.349,0.35,0.699,0.7]) for(const [choice,confidence] of [['candidate_0',1],['candidate_0',0.49],['unknown',1]]) {
  const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:async(model,input)=>routingResponse(input,{support:[fit],choice,confidence})}},intent);
  assert.equal(result.status,fit>=0.7?'match':'no_match',`${fit}/${choice}/${confidence}`);
 }
});

test('topic discovery preserves lexical browse membership while positive readings can promote a result',async t=>{
 const {env}=await fixture(t);
 for(const goal of ['Lambda idempotency','avoid repeated work']) {
  const intent={goal,target_language:'javascript'},baseline=await resolveIntent(env,intent);
  for(const fit of [0.01,0.349,0.35,0.699,0.7]) {
   const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:async(model,input)=>
    routingResponse(input,{shape:'topic_discovery',support:[fit]})}},intent);
   assert.equal(result.status,fit>=0.7?'match':baseline.status,`${goal}/${fit}`);
   assert.equal(result.alignment.negative_scope,undefined);
   assert.deepEqual(result.alignment.support_questions,{candidate_0:{topic_discovery:'candidate_fit_0'}});
   assert.equal(result.alignment.readings.candidate_fit_0.noul,fit);
  }
 }
});

test('ambiguous task shapes require branch consensus for promotion or removal without averaging readings',async t=>{
 const {env}=await fixture(t);
 for(const goal of ['Lambda idempotency','avoid repeated work']) {
  const intent={goal,target_language:'javascript'},baseline=await resolveIntent(env,intent);
  for(const [support,decision] of [
   [{single_task:0.01,multiple_tasks:0.02},'absent'],
   [{single_task:0.99,multiple_tasks:0.01},'unchanged'],
   [{single_task:0.9,multiple_tasks:0.5},'unchanged'],
   [{single_task:0.7,multiple_tasks:0.91},'present'],
  ]) {
   let calls=0;
   const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:async(model,input)=>{
    calls++;return routingResponse(input,{support:[support],choice:'unknown',shapeConfidence:0.45,
     shapeProbabilities:{single_task:0.59,multiple_tasks:0.41,topic_discovery:0,unknown:0}});
   }}},intent);
   assert.equal(calls,2);
   assert.equal(result.status,decision==='present'?'match':decision==='absent'?'no_match':baseline.status);
   assert.deepEqual(result.alignment.support_questions,{candidate_0:{
    single_task:'candidate_fit_0_single_task',multiple_tasks:'candidate_fit_0_multiple_tasks'}});
   assert.equal(result.alignment.readings.candidate_fit_0_single_task.noul,support.single_task);
   assert.equal(result.alignment.readings.candidate_fit_0_multiple_tasks.noul,support.multiple_tasks);
   assert.equal(result.alignment.readings.candidate_fit_0,undefined,'no aggregate fit is invented');
   assert.deepEqual(result.alignment.candidate_scope,{evaluated_count:1,eligible_count:1,complete:true});
   assert.equal(result.alignment.negative_scope,decision==='absent'?'evaluated_candidates_only':undefined);
  }
 }
});

test('an ambiguous branch that includes topic discovery cannot veto lexical browsing',async t=>{
 const {env}=await fixture(t);
 for(const goal of ['Lambda idempotency','avoid repeated work']) {
  const intent={goal,target_language:'javascript'},baseline=await resolveIntent(env,intent);
  for(const fit of [0.01,0.7]) {
   const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:async(model,input)=>
    routingResponse(input,{support:[{single_task:fit,multiple_tasks:fit,topic_discovery:fit}],shapeConfidence:0.3,
     shapeProbabilities:{single_task:0.4,multiple_tasks:0.35,topic_discovery:0.25,unknown:0}})}},intent);
   assert.equal(result.status,fit>=0.7?'match':baseline.status);
   assert.equal(result.alignment.negative_scope,undefined);
   assert.equal(Object.keys(result.alignment.support_questions.candidate_0).length,3);
  }
 }
});

test('a missing or malformed ambiguous support branch cannot partially promote or reject a candidate',async t=>{
 const {env}=await fixture(t);
 for(const goal of ['Lambda idempotency','avoid repeated work']) for(const defect of ['missing','malformed']) {
  const intent={goal,target_language:'javascript'},baseline=await resolveIntent(env,intent);
  let calls=0;
  const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:async(model,input)=>{
   calls++;
   const response=routingResponse(input,{support:[{single_task:goal.startsWith('Lambda')?0.01:0.99,multiple_tasks:0.99}],
    shapeConfidence:0.45,shapeProbabilities:{single_task:0.59,multiple_tasks:0.41,topic_discovery:0,unknown:0}});
   if(!input.questions.request_shape) {
    if(defect==='missing') delete response.answers.candidate_fit_0_multiple_tasks;
    else response.answers.candidate_fit_0_multiple_tasks.noul=-0.1;
   }
   return response;
  }}},intent);
  assert.equal(calls,2);
  const {alignment,...unchanged}=result;
  assert.deepEqual(alignment,{status:'unavailable'});assert.deepEqual(unchanged,baseline);
 }
});

test('HTTP and Cap\'n Web distinguish explicit no-match from provider unavailability',async t=>{
 const {env}=await fixture(t),intent={goal:'Lambda duplicate processing external effects',target_language:'javascript'};
 const baseline=await resolveIntent(env,intent);assert.equal(baseline.status,'match');
 const app=createApp(),realFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>app.fetch(new Request(input,init),env,{waitUntil(){}});
 env.CLEF_ROUTING_ENABLED='true';
 try {
  for(const available of [true,false]) {
   env.AI={run:async(model,input)=>{if(!available) throw new Error('unavailable');return routingResponse(input,{choice:'unknown',support:[0.01]});}};
   const response=await app.fetch(new Request('https://secondwindai.com/api/resolve',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent})}),env,{waitUntil(){}});
   assert.equal(response.status,200);const http=await response.json();
   const rpc=await newHttpBatchRpcSession('https://secondwindai.com/capnp').searchIntent(intent);
   const {candidates,...rpcResult}=rpc;assert.deepEqual(rpcResult,http);
   assert.equal(http.status,available?'no_match':'match');assert.equal(candidates.length,available?0:1);
   if(!available) assert.deepEqual(http.alignment,{status:'unavailable'});
   for(const candidate of candidates) candidate.product[Symbol.dispose]();
  }
 } finally {globalThis.fetch=realFetch;}
});
test('supported Choice ranks complete products and cannot put a pending product ahead of compatible results',async t=>{
 const {env,db}=await fixture(t);
 for(const [sku,patch] of [['SECOND',{}],['PYTHON',{languages:['python']}],['MISSING',{required_evidence:['event-sample']}]]) {
  const item=insertItem(db,{sku,slug:sku.toLowerCase(),service:'lambda'}),m={...manifest(item),...patch};
  await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(item.sku,item.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 }
 const intent={goal:'idempotency',target_language:'javascript'},baseline=await resolveIntent(env,intent);
 let request,chosenSku=baseline.matches[1].sku,pendingOnly=false;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  if(input.questions.request_shape) return routingResponse(input);
  request=input;
  const index=input.state.candidates.findIndex(candidate=>candidate.sku===chosenSku);
  return routingResponse(input,{choice:`candidate_${index}`,support:input.state.candidates.map(candidate=>
   pendingOnly&&candidate.sku!=='MISSING'?0.01:candidate.sku==='MISSING'?0.9:0.95)});
 }};
 const result=await resolveIntent(env,intent),{alignment,...unchanged}=result;
 assert.equal(alignment.readings.candidate.choice,'candidate_2');
 assert.equal(alignment.snapshot_ref,baseline.snapshot_ref);
 assert.deepEqual(unchanged,{...baseline,matches:[baseline.matches[1],baseline.matches[0]]});
 assert.equal(result.status,'multiple_candidates');
 assert.deepEqual(request.state.candidates.map(candidate=>candidate.sku),['MISSING',...baseline.matches.map(product=>product.sku)]);
 assert.ok(!request.state.candidates.some(candidate=>candidate.sku==='PYTHON'));
 chosenSku='MISSING';
 const complete=await resolveIntent(env,intent);
 assert.equal(complete.status,'multiple_candidates');
 assert.deepEqual(complete.matches,baseline.matches);
 pendingOnly=true;
 const pending=await resolveIntent(env,intent);
 assert.equal(pending.status,'missing_configuration');assert.equal(pending.matched,false);
 assert.deepEqual(pending.matches.map(product=>product.sku),['MISSING']);
 assert.deepEqual(pending.clarifications,[{field:'evidence:event-sample',question:'Please supply evidence:event-sample.'}]);
});

test('HTTP and actual Cap\'n Web routing apply supported ranking before the requested limit',async t=>{
 const {env,db,item}=await fixture(t),second=insertItem(db,{sku:'SECOND',slug:'second',service:'lambda'}),m=manifest(second);
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(second.sku,second.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 const intent={goal:'idempotency',target_language:'javascript'},baseline=await resolveIntent(env,intent,1);
 assert.equal(baseline.matches[0].sku,second.sku);
 env.CLEF_ROUTING_ENABLED='true';
 const app=createApp(),realFetch=globalThis.fetch;
 let requests=[];
 globalThis.fetch=async(input,init)=>app.fetch(new Request(input,init),env,{waitUntil(){}});
 try {
  for(const [mode,goal] of [['selected','idempotency'],['unknown','idempotency'],['low-confidence','idempotency'],
   ['provider-failure','idempotency'],['semantic-selected','avoid repeated work'],['semantic-unknown','interstellar gardening']]) {
   const requestIntent={...intent,goal},fallback=await resolveIntent({SW_DB:db},requestIntent,1);
   const selected=mode==='selected'||mode==='semantic-selected';
   requests=[];
   env.AI={run:async(model,input)=>{
    requests.push(input);
    if(mode==='provider-failure') throw new Error('provider_unavailable');
    const choice=selected||mode==='low-confidence'?'candidate_1':'unknown';
    const support=mode==='semantic-selected'?[0.02,0.98]:mode==='semantic-unknown'?[0.5,0.5]:[0.91,0.96];
    return routingResponse(input,{choice,confidence:mode==='low-confidence'?0.49:1,support});
   }};
   const response=await app.fetch(new Request('https://secondwindai.com/api/resolve',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent:requestIntent,limit:1})}),env,{waitUntil(){}});
   assert.equal(response.status,200);
   const http=await response.json(),client=newHttpBatchRpcSession('https://secondwindai.com/capnp');
   const rpc=await client.searchIntent(requestIntent,1);
   const {candidates,...rpcResult}=rpc;
   assert.deepEqual(rpcResult,http);
   assert.equal(requests.length,mode==='provider-failure'?2:4);
   assert.ok(requests.filter(request=>request.questions.candidate).every(request=>request.state.candidates.length===2));
   assert.deepEqual(http.matches.map(product=>product.sku),selected?[item.sku]:fallback.matches.map(product=>product.sku),mode);
   assert.equal(candidates.length,http.matches.length);
   if(candidates.length) assert.equal(typeof candidates[0].product.info,'function');
   assert.equal(http.status,mode==='semantic-selected'?'match':fallback.status);
   assert.equal(http.snapshot_ref,fallback.snapshot_ref);
   assert.deepEqual(http.clarifications,fallback.clarifications);
   if(mode==='provider-failure') assert.deepEqual(http.alignment,{status:'unavailable'});
   else {
    assert.equal(http.alignment.readings.candidate.choice,selected||mode==='low-confidence'?'candidate_1':'unknown');
    assert.match(http.alignment.request_hash,/^[a-f0-9]{64}$/);
    assert.match(http.alignment.request_shape.request_hash,/^[a-f0-9]{64}$/);
   }
   for(const candidate of candidates) candidate.product[Symbol.dispose]();
  }
 } finally {globalThis.fetch=realFetch;}
});

test('multiple supported candidates survive low Choice confidence and a selected negative never returns',async t=>{
 const {env,db,item}=await fixture(t),second=insertItem(db,{sku:'SECOND',slug:'second',service:'lambda'}),m=manifest(second);
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)')
  .bind(second.sku,second.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 const intent={goal:'avoid repeated work',target_language:'javascript'};
 assert.equal((await resolveIntent(env,intent)).status,'no_match');
 env.CLEF_ROUTING_ENABLED='true';
 for(const [support,choice,confidence,expected] of [
  [[0.91,0.94],'candidate_1',0.49,[second.sku,item.sku]],
  [[0.91,0.94],'unknown',1,[second.sku,item.sku]],
  [[0.01,0.94],'candidate_0',1,[item.sku]],
  [[0.91,0.01],'candidate_1',1,[second.sku]],
 ]) {
  let calls=0;env.AI={run:async(model,input)=>{calls++;return routingResponse(input,{support,choice,confidence});}};
  const result=await resolveIntent(env,intent);
  assert.equal(calls,2);assert.deepEqual(result.matches.map(product=>product.sku),expected);
  assert.equal(result.status,expected.length>1?'multiple_candidates':'match');
  const limited=await resolveIntent(env,intent,1);
  assert.equal(limited.matches.length,1);assert.equal(limited.status,result.status);
 }
});

test('exact identities and typed constraints preserve missing language without model calls',async t=>{
 const {env,item}=await fixture(t);let calls=0;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  calls++;if(input.questions.candidate) assert.equal(input.state.candidates.length,1);
  return routingResponse(input,{support:[0.98]});
 }};
 assert.equal((await resolveIntent(env,{sku:item.sku,target_language:'javascript'})).status,'match');
 assert.equal(calls,0);
 for(const identity of [{slug:item.slug},{alias:'retry-safety'},{service:'lambda',operation:'deduplicate'},
  {target_language:'javascript'}]) {
  assert.equal((await resolveIntent(env,{...identity,target_language:'javascript'})).status,'match');
 }
 const missing=await resolveIntent(env,{sku:item.sku});
 assert.equal(missing.status,'missing_configuration');
 assert.equal(missing.matched,false);
 assert.equal(missing.clarifications[0].question,'What programming language do you want the product delivered in?');
 assert.equal((await resolveIntent(env,{sku:item.sku,target_language:'python'})).status,'no_match');
 assert.equal((await resolveIntent(env,{sku:'wrong',target_language:'javascript'})).status,'no_match');
 assert.equal(calls,0);
 assert.equal((await resolveIntent(env,{sku:item.sku,goal:'avoid repeated work',target_language:'javascript'})).status,'match');
 assert.equal(calls,2);
});

test('a semantic preference ranks all pending candidates without discarding the other possible products',async t=>{
 const {env,db,item}=await fixture(t);
 const second=insertItem(db,{sku:'SECOND',slug:'second',service:'lambda'}),m=manifest(second);
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)')
  .bind(second.sku,second.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 const intent={goal:'Lambda duplicate processing'},baseline=await resolveIntent(env,intent);
 assert.equal(baseline.status,'missing_configuration');assert.equal(baseline.matches.length,2);
 const chosenSku=baseline.matches[1].sku;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  if(input.questions.request_shape) return routingResponse(input);
  const index=input.state.candidates.findIndex(candidate=>candidate.sku===chosenSku);
  return routingResponse(input,{choice:`candidate_${index}`,support:[0.95,0.91]});
 }};
 const result=await resolveIntent(env,intent);
 assert.equal(result.status,'missing_configuration');assert.equal(result.matched,false);
 assert.equal(result.matches[0].sku,chosenSku);
 assert.deepEqual(result.matches.map(product=>product.sku).sort(),[item.sku,second.sku].sort());
 assert.ok(result.matches.every(product=>product.compatibility.missing.includes('target_language')));
 assert.deepEqual(result.clarifications,[{field:'target_language',question:'What programming language do you want the product delivered in?'}]);
 assert.equal((await resolveIntent(env,intent,1)).matches.length,1);
 env.AI={run:async(model,input)=>routingResponse(input,{choice:'candidate_1',support:[0.41,0.95]})};
 const mixed=await resolveIntent(env,intent);
 assert.equal(mixed.status,'missing_configuration');
 assert.deepEqual(mixed.matches.map(product=>product.sku),[chosenSku,baseline.matches[0].sku]);
 assert.equal(mixed.alignment.readings.candidate_fit_0.noul,0.41);
 assert.equal(mixed.alignment.negative_scope,undefined);
});

test('semantic pending choice asks exact language over HTTP and Cap\'n Web before an explicit callback answer matches',async t=>{
 const {env,item}=await fixture(t),intent={goal:'avoid repeated work'};
 assert.equal((await resolveIntent(env,intent)).status,'no_match');
 const seen=[];
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  if(input.questions.candidate) seen.push(input.state.intent);
  return routingResponse(input,{support:[0.98]});
 }};
 const app=createApp(),response=await app.fetch(new Request('https://secondwindai.com/api/resolve',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent})}),env,{waitUntil(){}});
 assert.equal(response.status,200);
 const http=await response.json();
 assert.equal(http.status,'missing_configuration');assert.equal(http.matched,false);
 assert.equal(http.matches.length,1);assert.equal(http.matches[0].sku,item.sku);
 assert.equal(http.matches[0].compatibility.compatible,false);
 assert.deepEqual(http.clarifications,[{field:'target_language',question:'What programming language do you want the product delivered in?'}]);
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>app.fetch(new Request(input,init),env,{waitUntil(){}});
 try {
  const batch=newHttpBatchRpcSession('https://secondwindai.com/capnp'),result=await batch.searchIntent(intent);
  const {candidates,...rpc}=result;
  assert.deepEqual(rpc,http);
  for(const candidate of candidates) candidate.product[Symbol.dispose]();
 } finally {globalThis.fetch=realFetch;}
 const channel=new MessageChannel(),server=newMessagePortRpcSession(channel.port1,new ProductService(env));
 const client=newMessagePortRpcSession(channel.port2);
 t.after(()=>{client[Symbol.dispose]();server[Symbol.dispose]();channel.port1.close();channel.port2.close();});
 const pending=await client.searchIntent(intent);
 assert.equal((await pending.candidates[0].product.configuration()).ok,false);
 pending.candidates[0].product[Symbol.dispose]();
 let asked=false;
 class Buyer extends RpcTarget {clarify(questions){asked=true;assert.deepEqual(questions,http.clarifications);return {target_language:'javascript'};}}
 const result=await client.searchIntent(intent,10,new Buyer());
 assert.equal(asked,true);assert.equal(result.status,'match');assert.equal(result.matched,true);
 assert.equal(result.matches[0].sku,item.sku);assert.equal(result.matches[0].version,item.version);
 assert.equal(result.matches[0].compatibility.compatible,true);
 assert.equal((await result.candidates[0].product.info()).sku,item.sku);
 assert.equal(seen.at(-1).target_language,'javascript');
 assert.ok(seen.slice(0,-1).every(value=>value.target_language===undefined));
 result.candidates[0].product[Symbol.dispose]();
});
test('uninformative evidence-only and stopword intents remain model-free no matches',async t=>{
 const {env}=await fixture(t,{language_policy:'not-applicable',languages:[]});let calls=0;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async()=>{
  calls++;throw new Error('must remain model-free');
 }};
 for(const intent of [{evidence:[]},{evidence:['event-sample']},{goal:'help with the product'}]) {
  const result=await resolveIntent(env,intent);
  assert.equal(result.status,'no_match');assert.deepEqual(result.matches,[]);
 }
 assert.equal(calls,0);
});

test('Clef input is bounded to twenty eligible candidates before result limiting',async t=>{
 const {env,db}=await fixture(t);
 for(let index=0;index<21;index++) {
  const item=insertItem(db,{sku:`C-${String(index).padStart(2,'0')}`,slug:`candidate-${index}`,service:'lambda'}),m=manifest(item);
  await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(item.sku,item.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 }
 const intent={goal:'idempotency',target_language:'javascript'},baseline=await resolveIntent(env,intent,50);
 assert.equal(baseline.matches.length,22);
 let request;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  if(input.questions.request_shape) return routingResponse(input);
  request=input;
  return routingResponse(input,{choice:'candidate_19',support:input.state.candidates.map((candidate,index)=>0.8+index/100)});
 }};
 const result=await resolveIntent(env,intent,1);
 assert.equal(request.state.candidates.length,20);
 assert.deepEqual(request.state.candidates.map(candidate=>candidate.sku),baseline.matches.slice(0,20).map(product=>product.sku));
 assert.equal(result.matches.length,1);assert.equal(result.matches[0].sku,baseline.matches[19].sku);
 assert.equal(result.matches[0].version,baseline.matches[19].version);
 assert.deepEqual(result.alignment.candidate_scope,{evaluated_count:20,eligible_count:22,complete:false});
 env.AI={run:async(model,input)=>routingResponse(input,{choice:'unknown',support:Array(20).fill(0)})};
 const absent=await resolveIntent(env,intent,50);
 assert.equal(absent.status,'multiple_candidates');
 assert.deepEqual(absent.matches.map(product=>product.sku),baseline.matches.slice(20).map(product=>product.sku));
 assert.equal(absent.alignment.negative_scope,'evaluated_candidates_only');
 const partial=await resolveIntent(env,{goal:'avoid repeated work',target_language:'javascript'},50);
 assert.equal(partial.status,'no_match');
 assert.equal(partial.alignment.candidate_scope.complete,false);
 assert.equal(partial.alignment.negative_scope,'evaluated_candidates_only');
});
test('structured constraints beat exact identity and lexical similarity',async t=>{
 const {env,item}=await fixture(t);
 for(const fields of [{target_language:'python'},{service:'s3'},{input_kind:'csv'},{target_runtime:'python3'},
  {operation:'delete'},{environment:'ecs'},{desired_outcome:'exactly-once-external-effects'},
  {failure_signature:'timeout'},{problem_family:'throttling'},{taxonomy_id:'aws.s3'},{product_kind:'guidance-product'}]) {
  const r=await resolveIntent(env,{sku:item.sku,goal:'Lambda idempotency duplicate processing',...fields});
  assert.equal(r.status,'no_match');assert.equal(r.matches.length,0);
 }
 await assert.rejects(resolveIntent(env,{goal:'idempotency',invented_constraint:'value'}),/unsupported_intent_field/);
});
test('explicit JavaScript and Python runtime choices must agree without inferring missing language',async t=>{
 const {env,item}=await fixture(t,{languages:['javascript','python'],runtimes:['nodejs24','python3.12','custom-runtime']});
 let calls=0;env.CLEF_ROUTING_ENABLED='true';
 env.AI={run:async(model,input)=>{calls++;return routingResponse(input);}};
 for(const [target_language,target_runtime] of [['javascript','python3.12'],['python','nodejs24']])
  assert.equal((await resolveIntent(env,{sku:item.sku,target_language,target_runtime})).status,'no_match');
 assert.equal(calls,0);
 for(const [target_language,target_runtime] of [['javascript','nodejs24'],['python','python3.12'],['python','custom-runtime']])
  assert.equal((await resolveIntent(env,{sku:item.sku,target_language,target_runtime})).status,'match');
 for(const target_runtime of ['nodejs24','python3.12']) {
  const result=await resolveIntent(env,{sku:item.sku,target_runtime});
  assert.equal(result.status,'missing_configuration');
  assert.deepEqual(result.clarifications,[{field:'target_language',question:'What programming language do you want the product delivered in?'}]);
 }
});
test('every supplied identity must match its own namespace',async t=>{
 const {env,item}=await fixture(t);
 for(const identity of [{sku:'retry-safety'},{sku:item.slug},{slug:item.sku},{alias:item.sku},
  {sku:item.sku,slug:'different'},{sku:item.sku,alias:'different'}]) {
  assert.equal((await resolveIntent(env,{...identity,target_language:'javascript'})).status,'no_match',JSON.stringify(identity));
 }
 const result=await resolveIntent(env,{sku:item.sku,slug:item.slug,alias:'retry-safety',target_language:'javascript'});
 assert.equal(result.status,'match');assert.equal(result.matches[0].sku,item.sku);
});

test('lexical routing uses whole words from positive declared dimensions',async t=>{
 const {env}=await fixture(t);
 for(const goal of ['potency','gardening','exactly-once-external-effects']) {
  assert.equal((await resolveIntent(env,{goal,target_language:'javascript'})).status,'no_match',goal);
 }
 for(const goal of ['deduplicate','event','nodejs22']) {
  assert.equal((await resolveIntent(env,{goal,target_language:'javascript'})).status,'match',goal);
 }
});

test('missing required evidence remains distinct from an incompatible requirement',async t=>{
 const {env,item}=await fixture(t,{required_evidence:['event-sample']});
 const intent={sku:item.sku,target_language:'javascript'};
 const missing=await resolveIntent(env,intent);
 assert.equal(missing.status,'missing_configuration');assert.equal(missing.matched,false);
 assert.deepEqual(missing.matches[0].compatibility.missing,['evidence:event-sample']);
 assert.deepEqual(missing.clarifications,[{field:'evidence:event-sample',question:'Please supply evidence:event-sample.'}]);
 assert.equal((await resolveIntent(env,{...intent,evidence:['event-sample']})).status,'match');
 assert.equal((await resolveIntent(env,{...intent,target_language:'python'})).status,'no_match');
});
test('language is requested explicitly and not inferred from runtime',async t=>{
 const {env}=await fixture(t);
 const r=await resolveIntent(env,{alias:'retry-safety',target_runtime:'nodejs22'});
 assert.equal(r.status,'missing_configuration');
 assert.equal(r.clarifications[0].question,'What programming language do you want the product delivered in?');
 const service=new ProductService(env);let asked=false;
 const found=await service.searchIntent({alias:'retry-safety'},10,{clarify:async()=>{asked=true;return {target_language:'javascript'};}});
 assert.ok(asked);assert.equal(found.status,'match');assert.equal(found.candidates.length,1);
 assert.equal((await found.candidates[0].product.info()).sku,r.matches[0].sku);
 await found.candidates[0].product.configure({});
});
test('manifest identities are immutable and unrelated goals return no match',async t=>{
 const {env,db,item,m}=await fixture(t);
 assert.deepEqual(validateRoutingManifest(m),[]);
 assert.equal((await resolveIntent(env,{goal:'quantum gardening',target_language:'javascript'})).status,'no_match');
 assert.throws(()=>db.sqlite.exec("UPDATE product_routing_manifests SET reviewed_by='changed'"),/routing_release_immutable/);
 db.sqlite.prepare('UPDATE items SET version=version+1 WHERE sku=?').run(item.sku);
 await assert.rejects(resolveIntent(env,{sku:item.sku}),error=>error.code==='routing_not_configured'&&error.status===503);
 const legacy=await resolveIntent(env,item.sku);
 assert.equal(legacy.routing_ready,false);assert.equal(legacy.matches[0].version,item.version+1);
});
test('HTTP and capability search use the same compatibility results; Clef cannot rescue a mismatch',async t=>{
 const {env,item}=await fixture(t);let calls=0;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async()=>{calls++;throw new Error('should not run');}};
 const intent={sku:item.sku,target_language:'python'};
 const response=await createApp().fetch(new Request('https://secondwindai.com/api/resolve',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent})}),env,{waitUntil(){}});
 assert.equal(response.status,200);
 const http=await response.json(),rpc=await new ProductService(env).search(intent);
 assert.equal(http.status,'no_match');assert.deepEqual(http.matches,rpc.matches);assert.equal(calls,0);
});
