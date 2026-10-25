import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Execute a built product's own preview, without commerce or external services.
// This command records execution evidence, never release approval or publication.
const root=fileURLToPath(new URL('../../../',import.meta.url));
const rows=JSON.parse(await readFile(path.join(root,'docs/sandbox-package-readiness-2026-10-25.json'),'utf8')).products;
const reports=JSON.parse(await readFile(path.join(root,'.private-builds/results.json'),'utf8'));
const slugs=new Set(process.argv.slice(2));
if(!slugs.size)throw new Error('explicit_product_slugs_required');
const entry=fileURLToPath(new URL('../src/execution.js',import.meta.url));
const loader=fileURLToPath(new URL('../src/private-runtime.js',import.meta.url));
const source=`import {executeCode} from ${JSON.stringify(entry)};
import {loadPrivateRuntime} from ${JSON.stringify(loader)};
export default {async fetch(request,env){
const {release,configuration,components}=await request.json();
const {modules}=await loadPrivateRuntime(env,release);
const code="const {preview}=await import('./product/preview.mjs');return await preview({configuration:await codemode.configuration(),selected_components:await codemode.components()});";
return Response.json(await executeCode(env,code,'javascript',null,null,{modules,privateProductPreview:true,
providers:{configuration:async()=>configuration,components:async()=>components}}));}};`;
const output=await build({stdin:{contents:source,resolveDir:root},bundle:true,write:false,
  format:'esm',platform:'browser',conditions:['workerd','worker','browser'],
  external:['cloudflare:*','node:*']});
const runtime=new Miniflare(convertV4MiniflareOptions({cf:false,modules:true,script:output.outputFiles[0].text,
  compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],workerLoaders:{LOADER:{}},
  r2Buckets:['PAYLOADS'],bindings:{EXECUTION_TIMEOUT_MS:'60000'}}));
try{
  const bucket=await runtime.getR2Bucket('PAYLOADS');
  for(const slug of slugs){
    const row=rows.find(r=>r.slug===slug),report=reports.find(r=>r.slug===slug);
    if(!row||report?.build?.kind!=='private-javascript-modules')throw new Error('built_runtime_required:'+slug);
    const input=JSON.parse(await readFile(path.join(root,row.release_input),'utf8'));
    const dir=path.join(root,'.private-builds',slug,report.source_sha256);
    for(const asset of report.build.modules)await bucket.put(asset.r2_key,await readFile(path.join(dir,'assets',asset.sha256)));
    const release={...input.manifest,preview_contract:{adapter:'js-product-runtime-v1'},
      private_runtime:{entrypoint:report.build.entrypoint,modules:report.build.modules}};
    const response=await runtime.dispatchFetch('http://localhost/preview',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({release,
        configuration:JSON.parse(input.item.input_example),components:(release.components||[]).map(c=>c.id)})});
    const result=await response.json();
    const evidence={sku:row.sku,slug,input_sha256:report.input_sha256,builder_sha256:report.builder_sha256,
      modules:report.build.modules.map(({name,sha256})=>({name,sha256})),
      runtime:'local-workerd',outbound:'disabled',executed_at:new Date().toISOString(),
      execution_verified:result.ok===true&&result.result?.ok===true,result};
    await writeFile(path.join(dir,'execution.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify({slug,verified:evidence.execution_verified,result}));
    if(!evidence.execution_verified)process.exitCode=1;
  }
}finally{await runtime.dispose();}
