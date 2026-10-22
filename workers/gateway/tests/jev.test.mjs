import test from 'node:test';
import assert from 'node:assert/strict';
import {createJevAi,JEV_MODEL,JEV_ENDPOINT} from '../src/jev.js';
import {readCandidateAlignment} from '../src/clef.js';
import {canonicalJson,sha256} from '../src/contracts.js';

const apiKey='offline-test-credential-never-live';
const request=()=>({model:JEV_MODEL,state:{summary:'A private buyer question'},questions:{exists:{type:'noul',instructions:'Does it fit?'}}});
const envelope=()=>({model:JEV_MODEL,answers:{exists:{type:'noul',noul:0.83}},usage:{input_tokens:321,output_tokens:14}});
const response=(body=envelope(),options={})=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'},...options});
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));

test('TypeSafe sends native typed questions to the fixed endpoint and records only safe response evidence',async()=>{
 const events=[];let sent,rawResponse,calls=0;
 const ai=createJevAi({apiKey,onResponse:event=>events.push(event),fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,JEV_ENDPOINT);assert.equal(options.method,'POST');
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  assert.deepEqual(options.headers,{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'});
  assert.equal(options.signal.aborted,false);
  sent=JSON.parse(options.body);
  assert.equal(sent.model,JEV_MODEL);
  rawResponse=JSON.stringify({model:JEV_MODEL,answers:{
   candidate:{type:'choice',choice:'candidate_0',confidence:0.64,probabilities:{candidate_0:0.82,unknown:0.18}},
   answer_exists:{type:'noul',noul:0.91},
  },usage:{input_tokens:321,output_tokens:14}});
  return new Response(rawResponse,{status:200,headers:{
   'x-request-id':'req_offline_123','cf-ray':'abc123-IAD','x-typesafe-request-id':apiKey,
   'x-private-debug':apiKey,'set-cookie':`session=${apiKey}`,
  }});
 }});
 assert.equal(ai.provider,'typesafe-live');assert.equal(ai.model,JEV_MODEL);
 const result=await readCandidateAlignment(ai,{goal:'A private buyer question'},[{
  sku:'RETRY',release_ref:'sha256:fixture',route_summary:'Retry handling',supported_boundary:'Duplicate events',exclusions:['payment-processing'],
 }],'snapshot:fixture');
 assert.equal(calls,1);assert.equal(result.model,JEV_MODEL);
 assert.deepEqual(result.readings.candidate,{choice:'candidate_0',confidence:0.64,probabilities:{candidate_0:0.82,unknown:0.18}});
 assert.deepEqual(result.readings.answer_exists,{noul:0.91});
 assert.equal(events.length,1);
 assert.deepEqual(events[0],{provider:'typesafe-live',endpoint:JEV_ENDPOINT,model:JEV_MODEL,http_status:200,ok:true,
  request_hash:await sha256(canonicalJson(sent)),request_ids:{'x-request-id':'req_offline_123','cf-ray':'abc123-IAD'},
  response_hash:await sha256(rawResponse),response_model:JEV_MODEL,usage:{input_tokens:321,output_tokens:14},latency_ms:events[0].latency_ms});
 assert.ok(Number.isInteger(events[0].latency_ms)&&events[0].latency_ms>=0);
 assert.equal(result.request_hash,events[0].request_hash);
 assert.ok(!JSON.stringify({ai,events,result,sent}).includes(apiKey));
 assert.ok(!JSON.stringify(events).includes('private buyer'));
});

test('TypeSafe rejects invalid configuration and model aliases without starting a request',()=>{
 const fetchImpl=()=>{throw new Error('must not fetch');};
 for(const value of ['',undefined,null,42,'contains space','contains\nnewline'])
  assert.throws(()=>createJevAi({apiKey:value,fetchImpl}),/typesafe_api_key_required/);
 for(const model of ['jev-latest','clef-flash','jev-1.14','jev-1.14.0/extra','',null])
  assert.throws(()=>createJevAi({apiKey,model,fetchImpl}),/typesafe_model_must_be_pinned/);
 for(const timeout_ms of [0,-1,1.5,Infinity,30001])
  assert.throws(()=>createJevAi({apiKey,timeout_ms,fetchImpl}),/invalid_typesafe_timeout/);
 assert.throws(()=>createJevAi({apiKey,fetchImpl:null}),/typesafe_fetch_required/);
 assert.throws(()=>createJevAi({apiKey,fetchImpl,onResponse:{}}),/invalid_typesafe_observer/);
});

test('TypeSafe rejects mismatched, invalid, or oversized requests before fetch or observation',async()=>{
 let calls=0,observations=0;
 const ai=createJevAi({apiKey,fetchImpl:()=>{calls++;},onResponse:()=>{observations++;}});
 await assert.rejects(ai.run('jev-1.13.0',request()),/typesafe_invalid_request/);
 for(const body of [null,[],{...request(),model:'jev-latest'},{...request(),endpoint:'https://other.invalid'},
  {...request(),state:null},{...request(),state:1},{...request(),questions:{}},{...request(),questions:[]}])
  await assert.rejects(ai.run(JEV_MODEL,body),/typesafe_invalid_request/);
 const circular=request();circular.state.self=circular.state;
 await assert.rejects(ai.run(JEV_MODEL,circular),/typesafe_invalid_request/);
 await assert.rejects(ai.run(JEV_MODEL,{...request(),state:'é'.repeat(24000)}),/typesafe_context_too_large/);
 assert.equal(calls,0);assert.equal(observations,0);
});

test('TypeSafe hashes and sends the request snapshot before caller mutation',async()=>{
 const body=request(),original=structuredClone(body),events=[];let sent;
 const ai=createJevAi({apiKey,onResponse:event=>events.push(event),fetchImpl:async(url,options)=>{
  sent=options.body;return response();
 }});
 const pending=ai.run(JEV_MODEL,body);
 body.state.summary='Changed evidence';body.questions.exists.instructions='Changed question';body.model='jev-1.13.0';
 assert.deepEqual(await pending,envelope());
 assert.equal(sent,canonicalJson(original));
 assert.equal(events[0].request_hash,await sha256(sent));
});

test('HTTP failures and redirects never expose provider error bodies or follow another destination',async()=>{
 for(const status of [302,401,429,500]) {
  const events=[];let calls=0;
  const ai=createJevAi({apiKey,onResponse:event=>events.push(event),fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,JEV_ENDPOINT);assert.equal(options.redirect,'error');
   return new Response(`secret error body ${apiKey}`,{status,headers:{location:`https://other.invalid/${apiKey}`,'x-request-id':'safe_id'}});
  }});
  const code=status===302?'typesafe_redirect_rejected':`typesafe_http_${status}`;
  await assert.rejects(ai.run(JEV_MODEL,request()),error=>{
   assert.equal(error.message,code);assert.ok(!JSON.stringify(error).includes(apiKey));return true;
  });
  assert.equal(calls,1);assert.equal(events.length,1);assert.equal(events[0].http_status,status);
  assert.equal(events[0].ok,false);assert.equal(events[0].error,code);
  assert.equal(events[0].response_hash,undefined);assert.equal(events[0].usage,undefined);
  assert.ok(!JSON.stringify(events).includes(apiKey));
 }
 const ai=createJevAi({apiKey,fetchImpl:async()=>{
  const result=response();Object.defineProperty(result,'redirected',{value:true});return result;
 }});
 await assert.rejects(ai.run(JEV_MODEL,request()),/typesafe_redirect_rejected/);
});

test('network and JSON errors report safe codes without credential-bearing exception text',async()=>{
 for(const [fetchImpl,code,status] of [
  [async()=>{throw new Error(`Bearer ${apiKey}`);},'typesafe_network_error',null],
  [async()=>new Response(`not JSON: ${apiKey}`),'typesafe_invalid_json',200],
 ]) {
  const events=[],ai=createJevAi({apiKey,fetchImpl,onResponse:event=>events.push(event)});
  await assert.rejects(ai.run(JEV_MODEL,request()),error=>error.message===code&&!error.cause);
  assert.equal(events.length,1);assert.equal(events[0].error,code);assert.equal(events[0].http_status,status);
  assert.ok(!JSON.stringify(events).includes(apiKey));
 }
});

test('TypeSafe rejects wrong model identities and malformed native usage envelopes',async()=>{
 for(const mutate of [body=>{body.model='clef-flash';},body=>{body.model='jev-1.13.0';},
  body=>{body.answers=[];},body=>{delete body.usage;},body=>{body.usage.input_tokens='321';},
  body=>{body.usage.output_tokens=-1;},body=>{body.usage.output_tokens=1.5;}]) {
  const body=envelope();mutate(body);const events=[];
  const ai=createJevAi({apiKey,fetchImpl:async()=>response(body),onResponse:event=>events.push(event)});
  await assert.rejects(ai.run(JEV_MODEL,request()),/typesafe_invalid_response/);
  assert.equal(events[0].ok,false);assert.equal(events[0].http_status,200);
  assert.equal(events[0].usage,undefined);
 }
});

test('a deadline aborts stalled fetch and emits one failure even if the transport later completes',async()=>{
 const events=[];let finish,signal;
 const ai=createJevAi({apiKey,timeout_ms:10,onResponse:event=>events.push(event),fetchImpl:(url,options)=>{
  signal=options.signal;return new Promise(resolve=>{finish=resolve;});
 }});
 const pending=ai.run(JEV_MODEL,request());
 await assert.rejects(pending,/typesafe_timeout/);
 assert.equal(signal.aborted,true);assert.equal(events.length,1);
 assert.equal(events[0].error,'typesafe_timeout');assert.equal(events[0].http_status,null);assert.equal(events[0].ok,false);
 finish(response());await nextTurn();
 assert.equal(events.length,1);assert.equal(events[0].ok,false);assert.equal(events[0].http_status,null);
 await assert.rejects(pending,/typesafe_timeout/);
});

test('the deadline also bounds response reading and cancels a stalled body',async()=>{
 const events=[];let cancelled=false;
 const ai=createJevAi({apiKey,timeout_ms:10,onResponse:event=>events.push(event),fetchImpl:async()=>
  new Response(new ReadableStream({cancel(){cancelled=true;}}))});
 await assert.rejects(ai.run(JEV_MODEL,request()),/typesafe_timeout/);
 assert.equal(cancelled,true);assert.equal(events.length,1);
 assert.equal(events[0].http_status,200);assert.equal(events[0].ok,false);assert.equal(events[0].error,'typesafe_timeout');
});

test('TypeSafe bounds response bytes with or without Content-Length',async()=>{
 for(const headers of [{},{'Content-Length':'512001'}]) {
  const events=[],ai=createJevAi({apiKey,onResponse:event=>events.push(event),
   fetchImpl:async()=>new Response('x'.repeat(512001),{headers})});
  await assert.rejects(ai.run(JEV_MODEL,request()),/typesafe_response_too_large/);
  assert.equal(events[0].ok,false);assert.equal(events[0].response_hash,undefined);
 }
});

test('observation failures and pending observation promises cannot replace or delay a valid provider response',async()=>{
 for(const onResponse of [()=>{throw new Error(apiKey);},()=>Promise.reject(new Error(apiKey)),()=>new Promise(()=>{})]) {
  const ai=createJevAi({apiKey,fetchImpl:async()=>response(),onResponse});
  assert.deepEqual(await ai.run(JEV_MODEL,request()),envelope());
 }
 await nextTurn();
});
