import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
const entry=fileURLToPath(new URL('../src/execution.js',import.meta.url));
const code=`const m=await import('./product/core.js'); const {env}=await import('cloudflare:workers'); return {answer:m.answer,files:await codemode.listFiles(),secrets:Object.keys(env)};`;
const source=`import {executeCode} from ${JSON.stringify(entry)};
export default {async fetch(request,env){
const input=request.method==='POST'?await request.json():null;
return Response.json(await executeCode(env,input?.code || ${JSON.stringify(code)},'javascript',null,null,{
modules:input?.modules || {'product/core.js':'export const answer=42;'},
providers:{listFiles:async()=>input?Object.keys(input.modules):['core.js'],configuration:async()=>input?.configuration}}));}};`;
const output=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['cloudflare:*','node:*']});
const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],workerLoaders:{LOADER:{}},bindings:{GATEWAY_SECRET:'must-not-cross'}}));
try {
 const response=await runtime.dispatchFetch('http://localhost/trial');const body=await response.json();
 assert.equal(body.ok,true);assert.deepEqual(body.result,{answer:42,files:['core.js'],secrets:[]});
 console.log('PASS: real Dynamic Worker imports product module, calls scoped provider and receives no gateway secrets.');
 const bundle=JSON.parse(await readFile(new URL('../../../products/agent-state-dynamodb-manifest/release-input.json',import.meta.url),'utf8'));
 const optional=['status-index','expiry','recovery','change-stream'];
 for(let mask=0;mask<16;mask++) {
  const ids=['table',...optional.filter((_,i)=>mask&(1<<i))];
  // Materialize only the files in this subset, rather than exposing all optional modules.
  const modules=Object.fromEntries(bundle.manifest.components.filter(c=>ids.includes(c.id))
   .flatMap(c=>c.files).filter(f=>/\.m?js$/.test(f.path)).map(f=>['product/'+f.path,f.content]));
  const trialCode=`const {prepare}=await import('./product/planner.mjs');
   const modules=await Promise.all(${JSON.stringify(ids.slice(1))}.map(id=>import('./product/features/'+id+'.mjs')));
   const {env}=await import('cloudflare:workers');
   return {plan:prepare(await codemode.configuration(),modules.map(m=>m.feature)),secrets:Object.keys(env),files:await codemode.listFiles()};`;
  const run=await runtime.dispatchFetch('http://localhost/product',{method:'POST',body:JSON.stringify({code:trialCode,modules,configuration:{language:'javascript',table_name:'agent-state-example'}})});
  const result=await run.json();assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(result.result.plan.components,ids.sort());assert.deepEqual(result.result.secrets,[]);
  assert.equal(result.result.plan.steps[0].operation,'CreateTable');
  assert.equal(result.result.plan.steps.some(s=>s.operation==='UpdateTimeToLive'),ids.includes('expiry'));
  assert.equal(result.result.plan.steps.some(s=>s.operation==='UpdateContinuousBackups'),ids.includes('recovery'));
  assert.equal(result.result.files.length,ids.length);
 }
 console.log('PASS: actual AWS-0568 planner executes all 16 selected feature packages in real Dynamic Workers; omitted source modules and gateway secrets are absent. No AWS calls.');
} finally {await runtime.dispose();}
