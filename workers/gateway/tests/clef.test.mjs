import test from 'node:test';
import assert from 'node:assert/strict';
import {readChoices,readInventoryKind,readJourneyPattern,readCandidateAlignment,inventoryQuestions,CLEF_MODEL} from '../src/clef.js';
const keys=Object.keys(inventoryQuestions().advertised_kind.criteria);
const answer=()=>({model:'clef-flash',answers:{advertised_kind:{type:'choice',choice:'unknown',confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k==='unknown'?1:0]))}}});
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
