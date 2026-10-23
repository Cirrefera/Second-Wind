import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readChoices,readInventoryKind,readJourneyPattern,readCandidateAlignment,inventoryQuestions,CLEF_MODEL,CLEF_REQUEST_SHAPE_MIN_CONFIDENCE} from '../src/clef.js';
import {canonicalJson,sha256} from '../src/contracts.js';
import {resolveIntent} from '../src/routing.js';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {EVENT_REGISTRY} from '../src/telemetry.js';
const keys=Object.keys(inventoryQuestions().advertised_kind.criteria);
const answer=()=>({model:'clef-flash',answers:{advertised_kind:{type:'choice',choice:'unknown',confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k==='unknown'?1:0]))}}});
const choiceResponse=(questions,values={})=>({model:'clef-flash',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
 const value=Object.hasOwn(values,id)?values[id]:q.type==='noul'?{noul:1}:{choice:'unknown',confidence:1};
 if(q.type==='noul') return [id,{type:'noul',...value}];
 return [id,{type:'choice',...value,probabilities:value.probabilities||Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===value.choice?1:0]))}];
}))});
const candidateResponse=(questions,values={})=>choiceResponse(questions,{request_shape:{choice:'single_task',confidence:1},...values});
test('reader bounds stalled inference and ignores late results',async()=>{
 let finish;
 const input={state:{},questions:inventoryQuestions(),snapshot_ref:'inventory:1'};
 const reading=readChoices({run:()=>new Promise(resolve=>{finish=resolve;})},input,{timeout_ms:10});
 await assert.rejects(reading,/clef_timeout/);
 finish(answer());
 await assert.rejects(reading,/clef_timeout/);
 assert.equal((await readChoices({run:async()=>answer()},input,{timeout_ms:100})).evidence_kind,'model_reading');
 let calls=0;
 for(const timeout_ms of [0,-1,Infinity,30001,1.5]) {
  await assert.rejects(readChoices({run:()=>{calls++;}},input,{timeout_ms}),/invalid_clef_timeout/);
 }
 assert.equal(calls,0);
});
test('Clef classifies only explicit options, binds snapshot and excludes unrelated private fields',async()=>{
 let request;
 const ai={run:async(model,input)=>{assert.equal(model,CLEF_MODEL);request=input;return answer();}};
 const result=await readInventoryKind(ai,{sku:'A',name:'A',recoveryToken:'private',payment_signature:'private'},'inventory:1');
 assert.equal(result.readings.advertised_kind.choice,'unknown');
 assert.equal(result.evidence_kind,'model_reading');
 assert.equal(result.snapshot_ref,'inventory:1');
 assert.match(result.request_hash,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(request).includes('private'));
 assert.equal(result.eligible,undefined);
});
test('journey analysis excludes private payloads and retains an unknown outcome',async()=>{
 let request;
 const ai={run:async(model,input)=>{
  request=input;const keys=Object.keys(input.questions.pattern.criteria);
  return {model:'clef-flash',answers:{pattern:{type:'choice',choice:'unknown',confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k==='unknown'?1:0]))}}};
 }};
 const result=await readJourneyPattern(ai,[{event_type:'trial.started',code:'private',buyer_id:'private',payload:'private'}],'journey-snapshot:1');
 assert.deepEqual(request.state,[{event_type:'trial.started'}]);
 assert.equal(result.readings.pattern.choice,'unknown');
 assert.throws(()=>readJourneyPattern(ai,[{event_type:'made.up'}],'s'),/invalid_journey_events/);
 assert.throws(()=>readCandidateAlignment(ai,{},[],'s'),/invalid_candidates/);
});
test('Clef rejects invented options, malformed probabilities and missing binding',async()=>{
 for(const mutate of [a=>a.choice='invented',a=>a.probabilities.unknown=0.2,a=>a.confidence=NaN,a=>a.probabilities.extra=0]) {
  const response=answer();mutate(response.answers.advertised_kind);
  await assert.rejects(readInventoryKind({run:async()=>response},{sku:'A'},'inventory:1'),/invalid_clef_response/);
 }
 await assert.rejects(readInventoryKind(null,{},'inventory:1'),/clef_not_configured/);
 await assert.rejects(readChoices({run:async()=>answer()},{state:{},questions:inventoryQuestions()}),/snapshot_required/);
});

test('invalid contracts are rejected before inference; supported structured Choice inputs are preserved',async()=>{
 let calls=0;
 const ai={run:async(model,input)=>{calls++;return choiceResponse(input.questions);}};
 const input={state:{listing:'Evidence'},questions:inventoryQuestions(),snapshot_ref:'contract:1'};
 await assert.rejects(readChoices(ai,{...input,state:undefined}),/invalid_clef_state/);
 for(const questions of [null,[],[inventoryQuestions().advertised_kind],{},Object.fromEntries(Array.from({length:65},(_,i)=>[`q${i}`,inventoryQuestions().advertised_kind]))]) {
  await assert.rejects(readChoices(ai,{...input,questions}),/invalid_questions/);
 }
 for(const question of [null,{type:'choice',instructions:' ',criteria:{unknown:'Unknown',other:'Other'}},
  {type:'choice',instructions:'Classify',criteria:{first:'First',second:'Second'}},
  {type:'choice',instructions:'Classify',criteria:{unknown:'Unknown','':'Empty ID'}},
  {type:'choice',instructions:'Classify',criteria:{unknown:'Unknown',...Object.fromEntries(Array.from({length:255},(_,i)=>[`option_${i}`,'Option']))}}]) {
  await assert.rejects(readChoices(ai,{...input,questions:{test:question}}),/invalid_choice_contract/);
 }
 await assert.rejects(readChoices(ai,{...input,state:'é'.repeat(24000)}),/clef_context_too_large/);
 assert.equal(calls,0);
 const questions={test:{type:'choice',instructions:{question:'What is supported?',evidence_fields:['listing']},
  criteria:{unknown:null,structured:{scope:'Files',excludes:['Execution']},examples:['A template','A manifest']}}};
 let sent;
 const result=await readChoices({run:async(model,request)=>{sent=request;return choiceResponse(request.questions);}},{...input,questions});
 assert.deepEqual(sent.questions,questions);
 assert.equal(result.readings.test.choice,'unknown');
 const maxOptions={test:{type:'choice',instructions:['Classify',{}],criteria:{unknown:null,
  ...Object.fromEntries(Array.from({length:254},(_,i)=>[`option_${i}`,null]))}}};
 assert.equal((await readChoices(ai,{...input,questions:maxOptions})).readings.test.choice,'unknown');
});

test('pending inference is bound to the JSON evidence and rubric sent, despite caller mutation',async()=>{
 const state={summary:'A written guide',nested:{claim:'No files included'}};
 const questions=inventoryQuestions(),original=structuredClone({state,questions});
 let sent,finish,begin;
 const started=new Promise(resolve=>{begin=resolve;});
 const reading=readChoices({run:(model,request)=>{
  sent=structuredClone(request);begin();return new Promise(resolve=>{finish=resolve;});
 }},{state,questions,snapshot_ref:'mutation:1'});
 state.summary='A runnable deployment';
 questions.advertised_kind.instructions='Classify changed evidence';
 await started;
 state.nested.claim='Files included';
 delete questions.advertised_kind.criteria.unknown;
 finish(choiceResponse(original.questions));
 const result=await reading;
 assert.deepEqual(sent,{model:'clef-flash',...original});
 assert.equal(result.request_hash,await sha256(canonicalJson(sent)));
 assert.equal(result.questions_hash,await sha256(canonicalJson(original.questions)));
 assert.equal(result.readings.advertised_kind.choice,'unknown');
});

test('Choice question ids supported by the provider survive as own reading keys',async()=>{
 const questions=Object.fromEntries([['__proto__',{type:'choice',instructions:'Classify',criteria:{unknown:'Unknown',other:'Other'}}]]);
 const result=await readChoices({run:async(model,input)=>choiceResponse(input.questions)},{state:'Evidence',questions,snapshot_ref:'question-id:1'});
 assert.equal(Object.hasOwn(result.readings,'__proto__'),true);
 assert.equal(result.readings.__proto__.choice,'unknown');
 assert.equal(Object.getPrototypeOf(result.readings),Object.prototype);
});

test('response maps, model identity, answer ownership and primitive choices are validated',async()=>{
 const input={state:{},questions:inventoryQuestions(),snapshot_ref:'response:1'};
 for(const mutate of [
  response=>{response.model='another-model';},
  response=>{response.answers=[response.answers.advertised_kind];},
  response=>{response.answers.extra=response.answers.advertised_kind;},
  response=>{response.answers.advertised_kind.choice={toString:()=> 'unknown'};},
  response=>{response.answers.advertised_kind.probabilities=Object.assign([],{...response.answers.advertised_kind.probabilities});},
  response=>{response.answers.advertised_kind.probabilities['guidance-product']=0.7;response.answers.advertised_kind.probabilities.unknown=0.3;},
  response=>{response.answers=Object.assign(Object.create({advertised_kind:response.answers.advertised_kind}),{extra:{}});},
 ]) {
  const response=answer();mutate(response);
  await assert.rejects(readChoices({run:async()=>response},input),/invalid_clef_response/);
 }
});

test('a pinned Jev reader preserves native model identity and questions across both candidate stages',async()=>{
 const candidates=[{sku:'RETRY',release_ref:'release:one',route_summary:'Duplicate event handling',
  supported_boundary:'Retry safety only',exclusions:['exactly-once-external-effects']}];
 const intent={goal:'Retry safety',target_language:'python'};
 const cloudflareRequests=[],jevRequests=[];
 await readCandidateAlignment({run:async(model,input)=>{
  assert.equal(model,CLEF_MODEL);cloudflareRequests.push(input);return candidateResponse(input.questions);
 }},intent,candidates,'same-snapshot');
 const model='jev-1.14.0';
 const reading=await readCandidateAlignment({provider:'typesafe-live',model,run:async(requested,input)=>{
  assert.equal(requested,model);jevRequests.push(input);
  return {...candidateResponse(input.questions,{candidate_fit_0:{noul:0.78}}),model};
 }},intent,candidates,'same-snapshot');
 assert.equal(jevRequests.length,2);
 assert.deepEqual(jevRequests,cloudflareRequests.map(request=>({...request,model})));
 assert.equal(reading.model,model);
 assert.equal(reading.request_shape.model,model);
 assert.equal(reading.request_hash,await sha256(canonicalJson(jevRequests[1])));
 assert.equal(reading.request_shape.request_hash,await sha256(canonicalJson(jevRequests[0])));
 assert.equal(reading.questions_hash,await sha256(canonicalJson(cloudflareRequests[1].questions)));
 assert.deepEqual(reading.readings.candidate_fit_0,{noul:0.78});
 assert.equal(reading.readings.candidate.choice,'unknown');
 assert.equal(reading.request_shape.readings.request_shape.choice,'single_task');
});

test('Jev pins are captured before inference and cannot accept Cloudflare aliases or another version',async()=>{
 const input={state:{},questions:inventoryQuestions(),snapshot_ref:'jev-pin:1'},model='jev-1.14.0';
 for(const returned of ['clef-flash',CLEF_MODEL,'jev-latest','jev-1.13.0']) {
  await assert.rejects(readChoices({model,run:async()=>({...answer(),model:returned})},input),/invalid_clef_response/);
 }
 let calls=0;
 for(const invalid of ['',null,{},'jev-latest','jev-1.14',CLEF_MODEL]) {
  await assert.rejects(readChoices({model:invalid,run:()=>{calls++;}},input),/invalid_clef_model/);
 }
 assert.equal(calls,0);
 let finish,begin;
 const started=new Promise(resolve=>{begin=resolve;});
 const ai={model,run:(requested,body)=>{
  assert.equal(requested,model);assert.equal(body.model,model);begin();
  return new Promise(resolve=>{finish=resolve;});
 }};
 const pending=readChoices(ai,input);
 await started;
 ai.model='jev-1.13.0';
 finish({...answer(),model});
 assert.equal((await pending).model,model);
});

// These fixtures evaluate local uncertainty/evidence handling with supplied
// distributions. They do not measure the live model's semantic accuracy.
test('ambiguous and contradictory listing evidence retains split probabilities and unknown readings',async t=>{
 const cases=[
  {name:'template tutorial with an unclear deliverable',item:{sku:'AMBIGUOUS',name:'Template tutorial',kind:'guidance-product',
    summary:'Learn from a deployable-template walkthrough; the listing does not say whether files are included.'},
   value:{choice:'artifact-product',confidence:0.3625,probabilities:{'guidance-product':0.49,'artifact-product':0.49,'executable-product':0,bundle:0,unknown:0.02}}},
  {name:'file promise conflicts with an explicit exclusion',item:{sku:'CONTRADICTORY',name:'Deployment package',kind:'artifact-product',
    summary:'Includes ready-to-deploy manifests.',guidance:'Written guidance only. No manifests, source files, or deployable assets are delivered.'},
   value:{choice:'unknown',confidence:0.75,probabilities:{'guidance-product':0.1,'artifact-product':0.1,'executable-product':0,bundle:0,unknown:0.8}}},
 ];
 for(const fixture of cases) await t.test(fixture.name,async()=>{
  let sent;
  const result=await readInventoryKind({run:async(model,input)=>{sent=input;return choiceResponse(input.questions,{advertised_kind:fixture.value});}},fixture.item,'eval:inventory');
  for(const [key,value] of Object.entries(fixture.item)) assert.deepEqual(sent.state[key],value);
  assert.match(sent.questions.advertised_kind.criteria.unknown,/contradictory/);
  assert.deepEqual(result.readings.advertised_kind,fixture.value);
  assert.equal(result.evidence_kind,'model_reading');
  assert.equal(fixture.item.kind,fixture.item.sku==='AMBIGUOUS'?'guidance-product':'artifact-product');
 });
});

test('contradictory and incomplete journey snapshots retain the recorded sequence and unknown',async()=>{
 for(const events of [
  [{event_type:'trial.started'}],
  [{event_type:'trial.failed'},{event_type:'trial.completed'}],
  [{event_type:'delivery.completed'},{event_type:'delivery.failed'}],
 ]) {
  let sent;
  const result=await readJourneyPattern({run:async(model,input)=>{sent=input;return choiceResponse(input.questions);}},events,'eval:journey');
  assert.deepEqual(sent.state,events);
  assert.equal(result.readings.pattern.choice,'unknown');
  assert.match(sent.questions.pattern.instructions,/Missing events are not proof/);
  assert.match(sent.questions.pattern.criteria['delivery-recorded'],/nothing about an external deployment/);
 }
});

test('journey diagnostics accept actual registry events and only typed public status fields',async()=>{
 const events=[
  {event_type:'discovery.resolved',payload:{resolution_status:'no_match',goal:'private',configuration:{token:'private'}}},
  {event_type:'clarification.responded',payload:{response_status:'received',answer:'private'}},
  {event_type:'configuration.checked',configuration_status:'incomplete',configuration:'private'},
  {event_type:'delivery.prepared',payload:{delivery_id:'private',body:'private'}},
  {event_type:'receipt.issued',payload:{receipt:'private'}},
  {event_type:'discovery.resolved',resolution_status:'private'},
 ];
 let sent;
 const result=await readJourneyPattern({run:async(model,input)=>{sent=input;return choiceResponse(input.questions);}},events,'eval:observed-journey');
 assert.deepEqual(sent.state,[
  {event_type:'discovery.resolved',resolution_status:'no_match'},
  {event_type:'clarification.responded',response_status:'received'},
  {event_type:'configuration.checked',configuration_status:'incomplete'},
  {event_type:'delivery.prepared'},{event_type:'receipt.issued'},{event_type:'discovery.resolved'},
 ]);
 assert.ok(!JSON.stringify(sent).includes('private'));
 assert.match(sent.questions.pattern.criteria['catalog-coverage-gap'],/discovery\.resolved with resolution_status no_match/);
 assert.match(sent.questions.pattern.criteria['clarification-open'],/clarification\.responded with response_status received/);
 assert.match(sent.questions.pattern.criteria['delivery-response-prepared'],/does not prove client receipt/);
 assert.match(sent.questions.pattern.criteria['receipt-issued'],/does not prove delivery preparation/);
 assert.equal(result.readings.pattern.choice,'unknown');
 const registryEvents=Object.keys(EVENT_REGISTRY).map(event_type=>({event_type,payload:{raw:'private'}}));
 await readJourneyPattern({run:async(model,input)=>{assert.deepEqual(input.state,registryEvents.map(({event_type})=>({event_type})));return choiceResponse(input.questions);}},registryEvents,'eval:registry');
});

test('receipt observations never fabricate a delivery preparation event for the diagnostic reader',async()=>{
 for(const event_type of ['receipt.issued','delivery.prepared']) {
  const choice=event_type==='receipt.issued'?'receipt-issued':'delivery-response-prepared';
  const reading=await readJourneyPattern({run:async(model,input)=>{
   assert.deepEqual(input.state,[{event_type}]);
   return choiceResponse(input.questions,{pattern:{choice,confidence:1}});
  }},[{event_type,body:'private'}],'eval:receipt-preparation');
  assert.equal(reading.readings.pattern.choice,choice);
 }
});

test('candidate evidence is supplied once and the two HTTP readings have separate provenance',async()=>{
 const candidates=[
  {sku:'RETRY-GUIDE',release_ref:'release:guide',product_kind:'guidance-product',route_summary:'Written guidance for duplicate Lambda events',
   supported_boundary:'Explains idempotency design',exclusions:['deployable-files'],operator_notes:'private'},
  {sku:'RETRY-FILES',release_ref:'release:files',product_kind:'artifact-product',route_summary:'JavaScript retry-safety implementation files',
   supported_boundary:'Duplicate Lambda events using a supplied idempotency store',exclusions:['exactly-once-external-effects'],payment_signature:'private'},
 ];
 const intent={goal:'Need JavaScript retry-safety files'};
 const requests=[];
 const result=await readCandidateAlignment({run:async(model,input)=>{requests.push(input);return candidateResponse(input.questions);}},intent,candidates,'eval:candidate-options');
 assert.equal(requests.length,2);
 const [shape,sent]=requests;
 assert.deepEqual(shape.state,{goal:intent.goal});
 assert.deepEqual(Object.keys(shape.questions),['request_shape']);
 assert.deepEqual(sent.state.intent,intent);
 assert.deepEqual(Object.keys(sent.questions.candidate.criteria),['candidate_0','candidate_1','unknown']);
 for(const [index,candidate] of candidates.entries()) {
  const evidence=Object.fromEntries(['sku','release_ref','product_kind','route_summary','supported_boundary','exclusions'].map(key=>[key,candidate[key]]));
  assert.deepEqual(sent.state.candidates[index],{id:`candidate_${index}`,...evidence});
  assert.deepEqual(sent.questions.candidate.criteria[`candidate_${index}`],{
   candidate_path:`candidates[${index}]`,sku:candidate.sku,release_ref:candidate.release_ref,
  });
  assert.equal(sent.questions[`candidate_fit_${index}`].type,'noul');
  assert.ok(sent.questions[`candidate_fit_${index}`].instructions.includes(`\`candidates[${index}]\``));
  assert.deepEqual(result.readings[`candidate_fit_${index}`],{noul:1});
  assert.deepEqual(result.support_questions[`candidate_${index}`],{single_task:`candidate_fit_${index}`});
 }
 assert.ok(!JSON.stringify(requests).includes('private'));
 assert.match(sent.questions.candidate.criteria.unknown,/evidence is insufficient/);
 assert.equal(result.readings.candidate.choice,'unknown');
 assert.equal(result.readings.answer_exists,undefined);
 assert.equal(result.readings.request_shape,undefined);
 assert.equal(result.request_hash,await sha256(canonicalJson(sent)));
 assert.equal(result.questions_hash,await sha256(canonicalJson(sent.questions)));
 assert.equal(result.request_shape.request_hash,await sha256(canonicalJson(shape)));
 assert.equal(result.request_shape.questions_hash,await sha256(canonicalJson(shape.questions)));
 assert.equal(result.request_shape.snapshot_ref,result.snapshot_ref);
 assert.equal(result.chain_hash,await sha256(canonicalJson({snapshot_ref:result.snapshot_ref,
  request_hashes:[result.request_shape.request_hash,result.request_hash]})));
});

test('request shape selects the exact frozen probe question without mixing independent and combined tasks',async()=>{
 const corpus=JSON.parse(await readFile(new URL('./fixtures/routing-evaluation.json',import.meta.url),'utf8'));
 const cases=[['exact-identity-wrong-goal','single_task'],['prompt-text-cannot-grant-execution','single_task'],
  ['two-compatible-candidates','multiple_tasks'],['two-pending-candidates','topic_discovery']];
 // Hashes of the independently frozen probe plan's question objects, not the
 // reader implementation: plan sha256:7e9a77ccb3379522374431c76877f2830bc3ed82caebb12b9775da95a0be0feb.
 const frozenQuestionHashes={
  request_shape:'b0b69e1ea31063680edb0364beefc7a742c72117e5ed4f020d0ddc266b44a4db',
  single_task:'089490d9c69c53ecc45220b033a1798d05766aa4a894c6de2170c605a4149341',
  multiple_tasks:'f93eaee6954d2325e6b7742ec30f8fa8af685486e301733a9bfb3c7501c56315',
  topic_discovery:'f5255d7ed44bba1604316fc8dd1b5177b9c8723846f17a8d8b8aafdc69eede76',
 };
 const candidates=[{sku:'SW-PT-0006',release_ref:'release:guide',product_kind:'guidance-product',route_summary:'Lambda idempotency guidance',
  supported_boundary:'Written guidance for duplicate events',exclusions:['aws-deployment','payment-processing']},
  {sku:'AWS-0568',release_ref:'release:plan',product_kind:'artifact-product',route_summary:'DynamoDB state planning',
   supported_boundary:'Offline table request planning',exclusions:['aws-deployment']}];
 let calls=0;
 for(const [id,shape] of cases) {
  const example=corpus.cases.find(example=>example.id===id);
  assert.ok(example,id);
  const result=await readCandidateAlignment({model:'jev-1.14.0',run:async(model,input)=>{
   calls++;
   if(input.questions.request_shape) {
    assert.deepEqual(input.state,{goal:example.intent.goal});
    assert.equal(await sha256(canonicalJson(input.questions.request_shape)),frozenQuestionHashes.request_shape);
    return {...candidateResponse(input.questions,{request_shape:{choice:shape,confidence:1}}),model};
   }
   assert.deepEqual(input.state.intent,example.intent);
   assert.equal(await sha256(canonicalJson(input.questions.candidate_fit_0)),frozenQuestionHashes[shape]);
   assert.deepEqual(input.questions.candidate_fit_1,{...input.questions.candidate_fit_0,
    instructions:input.questions.candidate_fit_0.instructions.replace('`candidates[0]`','`candidates[1]`')});
   return {...candidateResponse(input.questions,{candidate_fit_0:{noul:0.5},candidate_fit_1:{noul:0.8}}),model};
  }},example.intent,candidates,`regression:${id}`);
  // The scripted shape verifies dispatch and the frozen question contract;
  // these tests do not measure the model's request-shape or fit accuracy.
  assert.equal(result.request_shape.readings.request_shape.choice,shape);
  assert.equal(result.readings.candidate.choice,'unknown');
  assert.equal(result.readings.candidate_fit_0.noul,0.5);
  assert.equal(result.readings.candidate_fit_1.noul,0.8);
 }
 assert.equal(calls,cases.length*2);
});

test('candidate alignment validates every independent Noul in the support call',async()=>{
 const candidates=[{sku:'RETRY',release_ref:'release:one',route_summary:'Duplicate Lambda event handling',
  supported_boundary:'Retry safety only',exclusions:['exactly-once-external-effects']}];
 let calls=0;
 for(const noul of [0,0.2,0.5,1]) {
  const result=await readCandidateAlignment({run:async(model,input)=>{
   calls++;assert.equal(model,CLEF_MODEL);
   assert.deepEqual(Object.keys(input.questions),input.questions.request_shape?['request_shape']:['candidate','candidate_fit_0']);
   return candidateResponse(input.questions,{candidate_fit_0:{noul}});
  }},{goal:'Exactly-once Lambda external effects'},candidates,'eval:noul');
  assert.deepEqual(result.readings.candidate_fit_0,{noul});
 }
 assert.equal(calls,8);
 for(const noul of [-0.01,1.01,NaN,Infinity,'0',null,undefined]) {
  await assert.rejects(readCandidateAlignment({run:async(model,input)=>candidateResponse(input.questions,{candidate_fit_0:{noul}})},
   {goal:'Retry safety'},candidates,'eval:noul-invalid'),/invalid_clef_response/);
 }
 for(const change of [answer=>delete answer.type,answer=>{answer.type='choice';},answer=>delete answer.noul]) {
  await assert.rejects(readCandidateAlignment({run:async(model,input)=>{
   const response=candidateResponse(input.questions);
   if(response.answers.candidate_fit_0) change(response.answers.candidate_fit_0);
   return response;
  }},{goal:'Retry safety'},candidates,'eval:noul-invalid'),/invalid_clef_response/);
 }
 for(const change of [answers=>delete answers.candidate_fit_1,answers=>{answers.candidate_fit_2={type:'noul',noul:1};},
  answers=>{answers.candidate_fit_1={type:'noul',noul:1.01};},answers=>{answers.candidate_fit_1={type:'choice',choice:'candidate_1'};}]) {
  await assert.rejects(readCandidateAlignment({run:async(model,input)=>{
   const response=candidateResponse(input.questions);
   if(response.answers.candidate_fit_1) change(response.answers);
   return response;
  }},{goal:'Retry safety'},[...candidates,{...candidates[0],sku:'SECOND'}],'eval:noul-invalid-second'),/invalid_clef_response/);
 }
 await assert.rejects(readChoices({run:()=>{throw new Error('must not run');}},
  {state:{},questions:{exists:{type:'noul',instructions:'Exists?'}},snapshot_ref:'choice-only'}),/invalid_choice_contract/);
});

test('unknown or low-confidence request shape with unknown mass retains first-stage provenance only',async()=>{
 const candidates=[{sku:'ONE',release_ref:'one',route_summary:'A guide',supported_boundary:'Guidance',exclusions:[]}];
 assert.equal(CLEF_REQUEST_SHAPE_MIN_CONFIDENCE,0.5);
 for(const [choice,confidence,expectedCalls] of [['unknown',1,1],['single_task',0.499999,1],['single_task',0.5,2]]) {
  const requests=[];
  const probabilities=choice==='unknown'?{single_task:0,multiple_tasks:0,topic_discovery:0,unknown:1}
   :{single_task:0.59,multiple_tasks:0.4,topic_discovery:0,unknown:0.01};
  const result=await readCandidateAlignment({run:async(model,input)=>{
   requests.push(input);return candidateResponse(input.questions,{request_shape:{choice,confidence,probabilities}});
  }},{goal:'Explain retries'},candidates,'shape:uncertain');
  assert.equal(requests.length,expectedCalls);
  assert.equal(result.request_shape.readings.request_shape.choice,choice);
  assert.equal(result.request_shape.readings.request_shape.confidence,confidence);
  assert.equal(result.request_shape.request_hash,await sha256(canonicalJson(requests[0])));
  if(expectedCalls===1) {
   assert.equal(result.status,'uncertain_request_shape');
   for(const absent of ['readings','request_hash','questions_hash','support_questions']) assert.equal(Object.hasOwn(result,absent),false);
   assert.equal(result.chain_hash,await sha256(canonicalJson({snapshot_ref:result.snapshot_ref,
    request_hashes:[result.request_shape.request_hash]})));
  } else assert.equal(result.status,undefined);
 }
 let calls=0;
 await assert.rejects(readCandidateAlignment({run:async(model,input)=>{
  calls++;return candidateResponse(input.questions,{request_shape:{choice:'invented',confidence:1}});
 }},{goal:'Explain retries'},candidates,'shape:invalid'),/invalid_clef_response/);
 assert.equal(calls,1);
});

test('ambiguity between known request shapes asks all live interpretations in one bounded support call',async()=>{
 const candidates=[{sku:'GUIDE',release_ref:'one',product_kind:'guidance-product',route_summary:'A guide',supported_boundary:'Guidance',exclusions:[]},
  {sku:'PLAN',release_ref:'two',product_kind:'artifact-product',route_summary:'A plan',supported_boundary:'Planning',exclusions:[]}];
 const probabilities={single_task:0.59,multiple_tasks:0.41,topic_discovery:0,unknown:0};
 const readings={candidate_fit_0_single_task:{noul:0.08},candidate_fit_0_multiple_tasks:{noul:0.21},
  candidate_fit_1_single_task:{noul:0.2},candidate_fit_1_multiple_tasks:{noul:0.82}};
 const requests=[];
 const result=await readCandidateAlignment({run:async(model,input)=>{
  requests.push(input);
  return candidateResponse(input.questions,{request_shape:{choice:'single_task',confidence:0.45,probabilities},...readings});
 }},{goal:'Prepare the plan and deploy it for me.'},candidates,'chain:ambiguous');
 assert.equal(requests.length,2);
 assert.equal(result.status,undefined);
 assert.deepEqual(result.request_shape.readings.request_shape,{choice:'single_task',confidence:0.45,probabilities});
 assert.deepEqual(result.support_questions,{
  candidate_0:{single_task:'candidate_fit_0_single_task',multiple_tasks:'candidate_fit_0_multiple_tasks'},
  candidate_1:{single_task:'candidate_fit_1_single_task',multiple_tasks:'candidate_fit_1_multiple_tasks'},
 });
 assert.equal(Object.keys(result.readings).length,5);
 for(const [id,reading] of Object.entries(readings)) assert.deepEqual(result.readings[id],reading);
 assert.match(requests[1].questions.candidate_fit_0_single_task.instructions,/satisfy the requested task/);
 assert.match(requests[1].questions.candidate_fit_0_multiple_tasks.instructions,/satisfy at least one task/);
 assert.equal(Object.keys(requests[1].questions).some(id=>id.includes('topic_discovery')),false);
 assert.equal(result.request_hash,await sha256(canonicalJson(requests[1])));
 assert.equal(result.questions_hash,await sha256(canonicalJson(requests[1].questions)));
 assert.equal(result.chain_hash,await sha256(canonicalJson({snapshot_ref:result.snapshot_ref,
  request_hashes:[result.request_shape.request_hash,result.request_hash]})));
 // Failure in any interpretation rejects the whole response; no branch may be
 // silently dropped to manufacture consensus from the remaining answers.
 for(const mutate of [answers=>delete answers.candidate_fit_1_multiple_tasks,
  answers=>{answers.candidate_fit_0_multiple_tasks.noul=1.1;}]) {
  await assert.rejects(readCandidateAlignment({run:async(model,input)=>{
   const response=candidateResponse(input.questions,{request_shape:{choice:'single_task',confidence:0.45,probabilities},...readings});
   if(input.questions.candidate) mutate(response.answers);
   return response;
  }},{goal:'Prepare the plan and deploy it for me.'},candidates,'chain:invalid-branch'),/invalid_clef_response/);
 }
});

test('known-shape expansion keeps every nonzero branch and cannot exceed the existing context limit',async()=>{
 const candidate={sku:'GUIDE',release_ref:'one',product_kind:'guidance-product',route_summary:'A guide',supported_boundary:'Guidance',exclusions:[]};
 const shape={choice:'single_task',confidence:0.1,
  probabilities:{single_task:0.5,multiple_tasks:0.499999,topic_discovery:0.000001,unknown:0}};
 let calls=0;
 const ai={run:async(model,input)=>{calls++;return candidateResponse(input.questions,{request_shape:shape});}};
 const result=await readCandidateAlignment(ai,{goal:'Find retry information'},[candidate],'chain:all-known');
 assert.equal(calls,2);
 assert.deepEqual(Object.keys(result.support_questions.candidate_0),['single_task','multiple_tasks','topic_discovery']);
 assert.equal(Object.keys(result.readings).length,4);
 const expanded=await readCandidateAlignment(ai,{goal:'Find retry information'},
  Array.from({length:20},(_,index)=>({...candidate,sku:`SKU-${index}`})),'chain:all-known-max');
 assert.equal(calls,4);
 assert.equal(Object.keys(expanded.readings).length,61);
 assert.deepEqual(Object.keys(expanded.support_questions.candidate_19),['single_task','multiple_tasks','topic_discovery']);
 calls=0;
 // Each individual branch fits, but three branches for twenty candidates do
 // not. The first reading is allowed; no oversized support call is sent.
 await assert.rejects(readCandidateAlignment(ai,{goal:'Find retry information'},
  Array.from({length:20},(_,index)=>({...candidate,sku:`SKU-${index}`,supported_boundary:'Guidance '+ 'evidence '.repeat(120)})),'chain:expanded-size'),
  /clef_context_too_large/);
 assert.equal(calls,1);
 calls=0;
 const uncertain=await readCandidateAlignment({run:async(model,input)=>{
  calls++;return candidateResponse(input.questions,{request_shape:{...shape,
   probabilities:{single_task:0.5,multiple_tasks:0.499999,topic_discovery:0,unknown:0.000001}}});
 }},{goal:'Find retry information'},[candidate],'chain:unknown-mass');
 assert.equal(calls,1);
 assert.equal(uncertain.status,'uncertain_request_shape');
});

test('both stages retain the original intent, candidates and model despite mutation during the first call',async()=>{
 const model='jev-1.14.0';
 const intent={goal:'Explain retry safety',constraints:{desired_outcomes:['idempotency']}};
 const candidates=[{sku:'ONE',release_ref:'release:one',product_kind:'guidance-product',route_summary:'A written guide',
  supported_boundary:'Retry safety',exclusions:['deployment']}];
 const original=structuredClone({intent,candidates});
 const requests=[];
 let finishShape,begin;
 const started=new Promise(resolve=>{begin=resolve;});
 const ai={model,run:(requested,input)=>{
  assert.equal(requested,model);assert.equal(input.model,model);requests.push(input);
  if(input.questions.request_shape) {begin();return new Promise(resolve=>{finishShape=resolve;});}
  return {...candidateResponse(input.questions),model};
 }};
 const pending=readCandidateAlignment(ai,intent,candidates,'chain:mutation');
 intent.goal='Deploy production';candidates[0].route_summary='An executable';
 await started;
 intent.constraints.desired_outcomes.push('deployment');
 candidates[0].sku='REPLACED';candidates[0].exclusions.length=0;
 candidates.push({...candidates[0],sku:'EXTRA'});
 ai.model='jev-1.13.0';ai.run=()=>{throw new Error('changed provider must not run');};
 finishShape({...candidateResponse(requests[0].questions),model});
 const result=await pending;
 assert.equal(requests.length,2);
 assert.deepEqual(requests[0].state,{goal:original.intent.goal});
 assert.deepEqual(requests[1].state,{intent:original.intent,candidates:original.candidates.map((candidate,i)=>({id:`candidate_${i}`,...candidate}))});
 assert.equal(result.request_shape.model,model);assert.equal(result.model,model);
 assert.equal(result.request_shape.request_hash,await sha256(canonicalJson(requests[0])));
 assert.equal(result.request_hash,await sha256(canonicalJson(requests[1])));
 for(const badStage of [1,2]) {
  let count=0;
  await assert.rejects(readCandidateAlignment({model,run:async(requested,input)=>{
   count++;return {...candidateResponse(input.questions),model:count===badStage?'jev-1.13.0':model};
  }},original.intent,original.candidates,'chain:wrong-model'),/invalid_clef_response/);
  assert.equal(count,badStage);
 }
});

test('candidate chain bounds candidate count and the entire support context before inference',async()=>{
 const candidate={sku:'ONE',release_ref:'one',product_kind:'guidance-product',route_summary:'A guide',supported_boundary:'Guidance',exclusions:[]};
 const intent={goal:'Explain retries'};
 let calls=0;
 const ai={run:async(model,input)=>{calls++;return candidateResponse(input.questions);}};
 for(const candidates of [[],Array.from({length:21},()=>candidate)]) {
  assert.throws(()=>readCandidateAlignment(ai,intent,candidates,'chain:count'),/invalid_candidates/);
 }
 await assert.rejects(readCandidateAlignment(ai,intent,[{...candidate,supported_boundary:'é'.repeat(24000)}],'chain:size'),/clef_context_too_large/);
 const cyclic={...candidate};cyclic.exclusions=[cyclic];
 await assert.rejects(readCandidateAlignment(ai,intent,[cyclic],'chain:cycle'),/invalid_clef_request/);
 for(const timeout_ms of [0,-1,Infinity,30001,1.5]) {
  await assert.rejects(readCandidateAlignment(ai,intent,[candidate],'chain:timeout',{timeout_ms}),/invalid_clef_timeout/);
 }
 await assert.rejects(readCandidateAlignment(ai,{},[candidate],'chain:goal'),/invalid_clef_state/);
 assert.equal(calls,0);
 const result=await readCandidateAlignment(ai,intent,Array.from({length:20},(_,index)=>({...candidate,sku:`SKU-${index}`})),'chain:max-count');
 assert.equal(calls,2);
 assert.equal(Object.keys(result.readings).length,21);
 assert.equal(result.readings.candidate_fit_19.noul,1);
});

test('candidate chain shares one deadline across both calls and ignores late support',async()=>{
 const candidates=[{sku:'ONE',release_ref:'one',route_summary:'A guide',supported_boundary:'Guidance',exclusions:[]}];
 let calls=0,finishLate;
 const late=new Promise(resolve=>{finishLate=resolve;});
 const pending=readCandidateAlignment({run:async(model,input)=>{
  calls++;
  await new Promise(resolve=>setTimeout(resolve,input.questions.request_shape?50:80));
  const response=candidateResponse(input.questions);
  if(input.questions.candidate) finishLate();
  return response;
 }},{goal:'Explain retries'},candidates,'chain:deadline',{timeout_ms:100});
 // Each individual response is faster than 100ms, but their chain is not.
 await assert.rejects(pending,/clef_timeout/);
 assert.equal(calls,2);
 await late;
 await assert.rejects(pending,/clef_timeout/);
 assert.equal(calls,2);
});

test('a shape response arriving after the whole deadline never starts support inference',async()=>{
 const candidates=[{sku:'ONE',release_ref:'one',route_summary:'A guide',supported_boundary:'Guidance',exclusions:[]}];
 let finish,calls=0,first;
 const pending=readCandidateAlignment({run:(model,input)=>{
  calls++;first=input;return new Promise(resolve=>{finish=resolve;});
 }},{goal:'Explain retries'},candidates,'chain:late-shape',{timeout_ms:10});
 await assert.rejects(pending,/clef_timeout/);
 finish(candidateResponse(first.questions));
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(calls,1);
});

test('unknown, low-confidence and failed candidate readings preserve deterministic fallback',async t=>{
 const db=createFixtureDb();t.after(()=>db.close());
 for(const sku of ['FIRST','SECOND']) {
  const item=insertItem(db,{sku,slug:sku.toLowerCase(),service:'lambda'});
  const manifest={schema_version:'1',product_id:`lambda-${sku.toLowerCase()}`,sku,slug:item.slug,version:item.version,
   release_ref:`release:${sku}`,service:'lambda',product_kind:'artifact-product',route_summary:'Lambda duplicate processing idempotency',
   supported_boundary:'Duplicate event handling in Lambda',aliases:[],tags:['idempotency'],taxonomy_ids:['aws.lambda'],problem_family_ids:[],
   operations:['deduplicate'],environments:['lambda'],desired_outcomes:[],input_kinds:['event'],failure_signatures:[],languages:['javascript'],
   runtimes:['nodejs22'],required_evidence:[],exclusions:['exactly-once-external-effects'],language_policy:'explicit'};
  await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(sku,item.version,canonicalJson(manifest),await sha256(canonicalJson(manifest)),'fixture',new Date().toISOString()).run();
 }
 const env={SW_DB:db},intent={goal:'Lambda idempotency',target_language:'javascript'},baseline=await resolveIntent(env,intent);
 assert.equal(baseline.status,'multiple_candidates');
 let calls=0;
 for(const mode of ['unknown','split','provider-error','malformed']) {
  let sent;
  const AI={run:async(model,input)=>{
   calls++;sent=input;
   if(mode==='provider-error') throw new Error('provider_unavailable');
   if(mode==='malformed') return {model:'clef-flash',answers:{}};
   return candidateResponse(input.questions,{candidate_fit_0:{noul:0.5},candidate_fit_1:{noul:0.5},
    ...(mode==='split'?{candidate:{choice:'candidate_1',confidence:0.235,
     probabilities:{candidate_0:0.49,candidate_1:0.49,unknown:0.02}}}:{})});
  }};
  const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI},intent);
  const {alignment,...unchanged}=result;
  assert.deepEqual(unchanged,baseline,mode);
  if(['provider-error','malformed'].includes(mode)) {
   assert.deepEqual(sent.state,{goal:intent.goal});
   assert.deepEqual(alignment,{status:'unavailable'});
  }
  else {
   assert.deepEqual(sent.state.candidates.map(candidate=>candidate.exclusions),[['exactly-once-external-effects'],['exactly-once-external-effects']]);
   assert.equal(alignment.readings.candidate.choice,mode==='unknown'?'unknown':'candidate_1');
   if(mode==='split') {
    assert.equal(alignment.readings.candidate.confidence,0.235);
    assert.deepEqual(alignment.readings.candidate.probabilities,{candidate_0:0.49,candidate_1:0.49,unknown:0.02});
   }
  }
 }
 assert.equal(calls,6);
 const incompatible={goal:'Lambda idempotency',target_language:'python'};
 assert.equal((await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:()=>{throw new Error('must not run');}}},incompatible)).status,'no_match');
});
