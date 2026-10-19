import test from 'node:test';
import assert from 'node:assert/strict';
import {readChoices,readInventoryKind,readJourneyPattern,readCandidateAlignment,inventoryQuestions,CLEF_MODEL} from '../src/clef.js';
import {canonicalJson,sha256} from '../src/contracts.js';
import {resolveIntent} from '../src/routing.js';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
const keys=Object.keys(inventoryQuestions().advertised_kind.criteria);
const answer=()=>({model:'clef-flash',answers:{advertised_kind:{type:'choice',choice:'unknown',confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k==='unknown'?1:0]))}}});
const choiceResponse=(questions,values={})=>({model:'clef-flash',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
 const value=Object.hasOwn(values,id)?values[id]:{choice:'unknown',confidence:1};
 return [id,{type:'choice',...value,probabilities:value.probabilities||Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===value.choice?1:0]))}];
}))});
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

test('candidate options describe their own supplied identity, scope and exclusions',async()=>{
 const candidates=[
  {sku:'RETRY-GUIDE',release_ref:'release:guide',route_summary:'Written guidance for duplicate Lambda events',
   supported_boundary:'Explains idempotency design',exclusions:['deployable-files'],operator_notes:'private'},
  {sku:'RETRY-FILES',release_ref:'release:files',route_summary:'JavaScript retry-safety implementation files',
   supported_boundary:'Duplicate Lambda events using a supplied idempotency store',exclusions:['exactly-once-external-effects'],payment_signature:'private'},
 ];
 const intent={goal:'Need JavaScript retry-safety files'};
 let sent;
 const result=await readCandidateAlignment({run:async(model,input)=>{sent=input;return choiceResponse(input.questions);}},intent,candidates,'eval:candidate-options');
 assert.deepEqual(sent.state.intent,intent);
 assert.deepEqual(Object.keys(sent.questions.candidate.criteria),['candidate_0','candidate_1','unknown']);
 for(const [index,candidate] of candidates.entries()) {
  const evidence=Object.fromEntries(['sku','release_ref','route_summary','supported_boundary','exclusions'].map(key=>[key,candidate[key]]));
  assert.deepEqual(sent.state.candidates[index],{id:`candidate_${index}`,...evidence});
  const {instructions,...description}=sent.questions.candidate.criteria[`candidate_${index}`];
  assert.match(instructions,/within its supported boundary and exclusions/);
  assert.deepEqual(description,evidence);
 }
 assert.ok(!JSON.stringify(sent).includes('private'));
 assert.match(sent.questions.candidate.criteria.unknown,/evidence is insufficient/);
 assert.equal(result.readings.candidate.choice,'unknown');
 assert.equal(result.request_hash,await sha256(canonicalJson(sent)));
 assert.equal(result.questions_hash,await sha256(canonicalJson(sent.questions)));
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
   return choiceResponse(input.questions,mode==='split'?{candidate:{choice:'candidate_1',confidence:0.235,
    probabilities:{candidate_0:0.49,candidate_1:0.49,unknown:0.02}}}:{});
  }};
  const result=await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI},intent);
  const {alignment,...unchanged}=result;
  assert.deepEqual(unchanged,baseline,mode);
  assert.deepEqual(sent.state.candidates.map(candidate=>candidate.exclusions),[['exactly-once-external-effects'],['exactly-once-external-effects']]);
  if(['provider-error','malformed'].includes(mode)) assert.deepEqual(alignment,{status:'unavailable'});
  else {
   assert.equal(alignment.readings.candidate.choice,mode==='unknown'?'unknown':'candidate_1');
   if(mode==='split') {
    assert.equal(alignment.readings.candidate.confidence,0.235);
    assert.deepEqual(alignment.readings.candidate.probabilities,{candidate_0:0.49,candidate_1:0.49,unknown:0.02});
   }
  }
 }
 assert.equal(calls,4);
 const incompatible={goal:'Lambda idempotency',target_language:'python'};
 assert.equal((await resolveIntent({...env,CLEF_ROUTING_ENABLED:'true',AI:{run:()=>{throw new Error('must not run');}}},incompatible)).status,'no_match');
});
