import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {canonicalJson,sha256} from '../src/contracts.js';
import {resolveIntent,validateRoutingManifest} from '../src/routing.js';
import {ProductService} from '../src/product-service.js';
import {createApp} from '../src/index.js';
import {RpcTarget,newHttpBatchRpcSession,newMessagePortRpcSession} from 'capnweb';
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
test('a valid complete Clef choice ranks an eligible product without reintroducing conflicts',async t=>{
 const {env,db}=await fixture(t);
 for(const [sku,patch] of [['SECOND',{}],['PYTHON',{languages:['python']}],['MISSING',{required_evidence:['event-sample']}]]) {
  const item=insertItem(db,{sku,slug:sku.toLowerCase(),service:'lambda'}),m={...manifest(item),...patch};
  await db.prepare('INSERT INTO product_routing_manifests VALUES (?1,?2,?3,?4,?5,?6)').bind(item.sku,item.version,canonicalJson(m),await sha256(canonicalJson(m)),'fixture',new Date().toISOString()).run();
 }
 const intent={goal:'idempotency',target_language:'javascript'},baseline=await resolveIntent(env,intent);
 let request,chosenSku=baseline.matches[1].sku;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  request=input;const keys=Object.keys(input.questions.candidate.criteria);
  const index=input.state.candidates.findIndex(candidate=>candidate.sku===chosenSku),choice=`candidate_${index}`;
  return {model:'clef-flash',answers:{candidate:{type:'choice',choice,confidence:1,
   probabilities:Object.fromEntries(keys.map(key=>[key,key===choice?1:0]))}}};
 }};
 const result=await resolveIntent(env,intent),{alignment,...unchanged}=result;
 assert.equal(alignment.readings.candidate.choice,'candidate_2');
 assert.equal(alignment.snapshot_ref,baseline.snapshot_ref);
 assert.deepEqual(unchanged,{...baseline,matches:[baseline.matches[1],baseline.matches[0]]});
 assert.equal(result.status,'multiple_candidates');
 assert.deepEqual(request.state.candidates.map(candidate=>candidate.sku),['MISSING',...baseline.matches.map(product=>product.sku)]);
 assert.ok(!request.state.candidates.some(candidate=>candidate.sku==='PYTHON'));
 chosenSku='MISSING';
 const pending=await resolveIntent(env,intent);
 assert.equal(pending.status,'missing_configuration');assert.equal(pending.matched,false);
 assert.deepEqual(pending.matches.map(product=>product.sku),['MISSING']);
 assert.deepEqual(pending.clarifications,[{field:'evidence:event-sample',question:'Please supply evidence:event-sample.'}]);
});

test('HTTP and actual Cap\'n Web routing apply Clef ranking before the requested limit',async t=>{
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
    const choice=selected||mode==='low-confidence'?'candidate_1':'unknown',keys=Object.keys(input.questions.candidate.criteria);
    return {model:'clef-flash',answers:{candidate:{type:'choice',choice,confidence:mode==='low-confidence'?0.49:1,
     probabilities:Object.fromEntries(keys.map(key=>[key,key===choice?1:0]))}}};
   }};
   const response=await app.fetch(new Request('https://secondwindai.com/api/resolve',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent:requestIntent,limit:1})}),env,{waitUntil(){}});
   assert.equal(response.status,200);
   const http=await response.json(),client=newHttpBatchRpcSession('https://secondwindai.com/capnp');
   const rpc=await client.searchIntent(requestIntent,1);
   const {candidates,...rpcResult}=rpc;
   assert.deepEqual(rpcResult,http);
   assert.equal(requests.length,2);
   assert.ok(requests.every(request=>request.state.candidates.length===2));
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
   }
   for(const candidate of candidates) candidate.product[Symbol.dispose]();
  }
 } finally {globalThis.fetch=realFetch;}
});

test('confident semantic routing can surface only the exact eligible product while uncertain readings retain no match',async t=>{
 const {env,item}=await fixture(t),intent={goal:'avoid repeated work',target_language:'javascript'};
 const fallback=await resolveIntent(env,intent);
 assert.equal(fallback.status,'no_match');
 env.CLEF_ROUTING_ENABLED='true';
 for(const [choice,confidence] of [['candidate_0',0.5],['candidate_0',0.49],['unknown',1]]) {
  let calls=0;
  env.AI={run:async()=>{
   calls++;return {model:'clef-flash',answers:{candidate:{type:'choice',choice,confidence,
    probabilities:{unknown:choice==='unknown'?1:0,candidate_0:choice==='candidate_0'?1:0}}}};
  }};
  const result=await resolveIntent(env,intent),{alignment,...withoutReading}=result;
  assert.equal(calls,1);
  if(choice==='candidate_0'&&confidence>=0.5) {
   assert.equal(result.status,'match');assert.equal(result.matches[0].sku,item.sku);
   assert.equal(result.matches[0].version,item.version);
   assert.equal(result.matches[0].compatibility.compatible,true);
  } else assert.deepEqual(withoutReading,fallback);
  assert.equal(alignment.readings.candidate.confidence,confidence);
 }
});

test('Clef choices preserve missing language while explicit conflicts stay model-free',async t=>{
 const {env,item}=await fixture(t);let calls=0;
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  calls++;assert.equal(input.state.candidates.length,1);
  return {model:'clef-flash',answers:{candidate:{type:'choice',choice:'candidate_0',confidence:1,
   probabilities:{unknown:0,candidate_0:1}}}};
 }};
 assert.equal((await resolveIntent(env,{sku:item.sku,target_language:'javascript'})).status,'match');
 assert.equal(calls,1);
 const missing=await resolveIntent(env,{sku:item.sku});
 assert.equal(missing.status,'missing_configuration');
 assert.equal(missing.matched,false);
 assert.equal(missing.clarifications[0].question,'What programming language do you want the product delivered in?');
 assert.equal((await resolveIntent(env,{sku:item.sku,target_language:'python'})).status,'no_match');
 assert.equal((await resolveIntent(env,{sku:'wrong',target_language:'javascript'})).status,'no_match');
 assert.equal(calls,2);
});

test('semantic pending choice asks exact language over HTTP and Cap\'n Web before an explicit callback answer matches',async t=>{
 const {env,item}=await fixture(t),intent={goal:'avoid repeated work'};
 assert.equal((await resolveIntent(env,intent)).status,'no_match');
 const seen=[];
 env.CLEF_ROUTING_ENABLED='true';env.AI={run:async(model,input)=>{
  seen.push(input.state.intent);
  return {model:'clef-flash',answers:{candidate:{type:'choice',choice:'candidate_0',confidence:1,
   probabilities:{unknown:0,candidate_0:1}}}};
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
 await assert.rejects(async()=>await pending.candidates[0].product.quote(),/incomplete_configuration/);
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
  calls++;return {model:'clef-flash',answers:{candidate:{type:'choice',choice:'candidate_0',confidence:1,
   probabilities:{unknown:0,candidate_0:1}}}};
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
  request=input;const keys=Object.keys(input.questions.candidate.criteria);
  return {model:'clef-flash',answers:{candidate:{type:'choice',choice:'candidate_19',confidence:1,
   probabilities:Object.fromEntries(keys.map(key=>[key,key==='candidate_19'?1:0]))}}};
 }};
 const result=await resolveIntent(env,intent,1);
 assert.equal(request.state.candidates.length,20);
 assert.deepEqual(request.state.candidates.map(candidate=>candidate.sku),baseline.matches.slice(0,20).map(product=>product.sku));
 assert.equal(result.matches.length,1);assert.equal(result.matches[0].sku,baseline.matches[19].sku);
 assert.equal(result.matches[0].version,baseline.matches[19].version);
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
 assert.equal((await resolveIntent(env,{sku:item.sku})).status,'no_match');
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
