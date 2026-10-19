import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../src/execution.js',import.meta.url));
const code=`const m=await import('./product/core.js'); const {env}=await import('cloudflare:workers'); return {answer:m.answer,files:await codemode.listFiles(),secrets:Object.keys(env)};`;
const source=`import {executeCode} from ${JSON.stringify(entry)};
export default {async fetch(request,env){return Response.json(await executeCode(env,${JSON.stringify(code)},'javascript',null,null,{
modules:{'product/core.js':'export const answer=42;'},providers:{listFiles:async()=>['core.js']}}));}};`;
const output=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['cloudflare:*','node:*']});
const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],workerLoaders:{LOADER:{}},bindings:{GATEWAY_SECRET:'must-not-cross'}}));
try {
 const response=await runtime.dispatchFetch('http://localhost/trial');const body=await response.json();
 assert.equal(body.ok,true);assert.deepEqual(body.result,{answer:42,files:['core.js'],secrets:[]});
 console.log('PASS: real Dynamic Worker imports product module, calls scoped provider and receives no gateway secrets.');
} finally {await runtime.dispose();}
