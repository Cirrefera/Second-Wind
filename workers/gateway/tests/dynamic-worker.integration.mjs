import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';

const executionEntry=fileURLToPath(new URL('../src/execution.js',import.meta.url));
const previewEntry=fileURLToPath(new URL('../src/preview.js',import.meta.url));
const releaseInput=JSON.parse(await readFile(new URL('../../../products/agent-state-dynamodb-manifest/releases/v4/release-input.json',import.meta.url),'utf8'));
const release=releaseInput.manifest;
const code=`const preview=await codemode.preview();
const components=await codemode.components();
const configuration=await codemode.configuration();
const imported=await import('./product/planner.mjs').then(()=>true,()=>false);
const readFileAccessible=await codemode.readFile('planner.mjs').then(()=>true,()=>false);
const {env}=await import('cloudflare:workers');
return {preview,components,configuration,readFileAccessible,imported,envKeys:Object.keys(env)};`;
const source=`import {executeCode} from ${JSON.stringify(executionEntry)};
import {runProductPreview,previewAvailable} from ${JSON.stringify(previewEntry)};
const release=${JSON.stringify(release)};
export default {async fetch(request,env){
 const input=await request.json();
 const preview=await runProductPreview(env,release,input.configuration,input.components);
 const componentMenu={components:input.components.map(id=>{
  const item=release.components.find(component=>component.id===id);
  return {id:item.id,name:item.name,requires:[...item.requires]};
 })};
 const outer=await executeCode(env,input.code,'javascript',null,null,{
  modules:{},providers:{preview:async()=>preview,components:async()=>componentMenu,
   configuration:async()=>input.configuration},
 });
 return Response.json({available:await previewAvailable(release),preview,outer});
}};`;
const output=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,
 format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['cloudflare:*','node:*']});
const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,
 compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],workerLoaders:{LOADER:{}},
 bindings:{GATEWAY_SECRET:'must-not-cross'}}));
try {
 const optional=['status-index','expiry','recovery','change-stream'];
 for(let mask=0;mask<16;mask++) {
  const ids=['table',...optional.filter((_,i)=>mask&(1<<i))].sort();
  for(const language of ['javascript','python']) {
   const configuration={language,table_name:'agent-state-example'};
   const response=await runtime.dispatchFetch('http://localhost/protected-preview',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({configuration,components:ids,code})});
   const body=await response.json();
   assert.equal(body.available,true);
   assert.equal(body.preview.ok,true,JSON.stringify(body.preview));
   assert.equal(body.preview.configuration_valid,true);
   assert.deepEqual(body.preview.selected_components,ids);
   assert.equal(body.preview.execution_language,'javascript');
   assert.equal(body.preview.delivery_language,language);
   assert.equal(body.preview.runtime_supported,true);
   assert.equal(body.preview.operation_count,2+Number(ids.includes('expiry'))+Number(ids.includes('recovery')));
   assert.equal(body.preview.verification_count,1+Number(ids.includes('expiry'))+Number(ids.includes('recovery')));
   assert.deepEqual(Object.keys(body.preview).sort(),[
    'configuration_valid','delivery_language','execution_language','ok','operation_count',
    'runtime_supported','selected_components','verification_count'].sort());
   assert.equal(body.outer.ok,true,JSON.stringify(body.outer));
   assert.deepEqual(body.outer.result.preview,body.preview);
   assert.deepEqual(body.outer.result.configuration,configuration);
   assert.equal(body.outer.result.readFileAccessible,false);
   assert.equal(body.outer.result.imported,false);
   assert.deepEqual(body.outer.result.envKeys,[]);
   const publicDetails=JSON.stringify(body.outer.result.components);
   assert.equal(/"(?:content|sha256|path|steps|verification|source|plan)"/.test(publicDetails),false);
   assert.equal(Object.hasOwn(body.outer.result,'plan'),false);
   assert.equal(Object.hasOwn(body.outer.result,'source'),false);
  }
 }
 console.log('PASS: reviewed protected preview executes all 16 selected packages for JavaScript and Python delivery, then exposes only bounded diagnostics to outer Code Mode with no source modules, readFile, plan, or gateway secrets. No AWS calls.');
} finally {await runtime.dispose();}
