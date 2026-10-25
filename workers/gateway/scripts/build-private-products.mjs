import {readFile,writeFile,mkdir,stat,symlink,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {builtinModules} from 'node:module';
import {build} from 'esbuild';

// Build every individual product from its own frozen input. Nothing in this
// operator command activates a product or treats compilation as a passing trial.
const root=fileURLToPath(new URL('../../../',import.meta.url));
const output=path.join(root,'.private-builds');
const digest=value=>createHash('sha256').update(value).digest('hex');
const builderHash=digest(await readFile(fileURLToPath(import.meta.url)));
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:
  value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value);
const exists=async file=>stat(file).then(()=>true,()=>false);
const builtins=new Set(builtinModules.flatMap(x=>[x,x.replace(/^node:/,''),`node:${x.replace(/^node:/,'')}`]));
function command(program,args,cwd,log) {
  return new Promise((resolve,reject)=>{
    const child=spawn(program,args,{cwd,env:{...process.env,AWS_EC2_METADATA_DISABLED:'true'},stdio:['ignore','pipe','pipe']});
    let text='';
    for(const stream of [child.stdout,child.stderr]) stream.on('data',b=>{text+=b;if(text.length>200000)text=text.slice(-200000);});
    child.on('error',reject);
    child.on('close',async code=>{await writeFile(log,text);code===0?resolve():reject(new Error(`${program}_build_exit_${code}`));});
  });
}
async function write(file,content){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,content);}
function productFiles(input) {
  const files=new Map();
  for(const file of [...(input.files||[]),...(input.manifest.components||[]).flatMap(c=>c.files||[])]) {
    if(!file.path.split('/').every(p=>/^[A-Za-z0-9_.-]+$/.test(p)&&p!=='.'&&p!=='..'))throw new Error('unsafe_source_path');
    if(typeof file.content!=='string'||Buffer.byteLength(file.content)!==file.size_bytes||digest(file.content)!==file.sha256)throw new Error(`source_bytes_changed:${file.path}`);
    if(files.has(file.path)&&files.get(file.path)!==file.content)throw new Error(`source_conflict:${file.path}`);
    files.set(file.path,file.content);
  }
  return files;
}
async function installNode(source,files) {
  const lock=files.get('package-lock.json');
  if(!lock)throw new Error('pinned_dependency_lock_required');
  const key=digest(lock),cache=path.join(output,'dependencies',key),marker=path.join(cache,'complete.json');
  if(!await exists(marker)) {
    await mkdir(cache,{recursive:true});
    await writeFile(path.join(cache,'package.json'),files.get('package.json'));
    await writeFile(path.join(cache,'package-lock.json'),lock);
    await command('npm',['ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund'],cache,path.join(cache,'install.log'));
    await writeFile(marker,JSON.stringify({lock_sha256:key}));
  }
  const modules=path.join(source,'node_modules');
  if(!await exists(modules))await symlink(path.join(cache,'node_modules'),modules,'dir');
  return path.join(cache,'node_modules');
}

async function nodeRuntime(row,input,files,dir) {
  const source=path.join(dir,'source');
  for(const [name,content] of files)await write(path.join(source,name),content);
  const dependencies=await installNode(source,files);
  const ts=files.has('preview.ts');
  const entry=ts?'preview.ts':files.has('preview.mjs')?'preview.mjs':files.has('preview.js')?'preview.js':null;
  if(!entry)throw new Error('product_preview_entrypoint_required');
  const nodeImports=new Set(),rootNamespaces=new Set();
  // Preserve the exact pinned library; avoid eagerly bundling unrelated CDK
  // service barrels merely because the source imports the package root.
  for(const content of files.values())for(const m of content.matchAll(/\b(aws_[A-Za-z0-9_]+)\s+as\s+(\w+)/g))rootNamespaces.add(m[1]);
  const facade=`export * from ${JSON.stringify(path.join(dependencies,'aws-cdk-lib/core/index.js'))};\n`+
    [...rootNamespaces].map(n=>`export * as ${n} from ${JSON.stringify(path.join(dependencies,'aws-cdk-lib',n.replaceAll('_','-'),'index.js'))};`).join('\n');
  const emitted=await build({absWorkingDir:source,entryPoints:[entry],bundle:true,write:false,format:'cjs',platform:'node',target:'es2022',minify:true,metafile:true,logLevel:'silent',
    plugins:[{name:'private-product',setup(b){
      b.onResolve({filter:/^(node:)?[^./]/},args=>{
        if(builtins.has(args.path)){const name=args.path.replace(/^node:/,'');nodeImports.add(name);return {path:`node:${name}`,external:true};}
        if(args.path==='aws-cdk-lib')return {path:'cdk-core',namespace:'private-facade'};
      });
      b.onLoad({filter:/.*/,namespace:'private-facade'},()=>({contents:facade,loader:'js',resolveDir:source}));
      b.onLoad({filter:/\.[cm]?[jt]s$/},async args=>{
        let content=await readFile(args.path,'utf8');
        const owned=!args.path.includes('/node_modules/');
        if(owned){
          const relative=path.relative(source,args.path).replaceAll(path.sep,'/');
          content=content.replaceAll('import.meta.url',JSON.stringify(`file:///tmp/secondwind-product/${relative}`));
        }
        // Runtime initialization belongs to the preview request. Wasm is
        // compiled by Worker Loader, not by a dynamic WebAssembly constructor.
        if(args.path.endsWith('/@aws/cloudformation-validate/bindings_wasm.js')){
          const original="const wasmBytes = require('fs').readFileSync(wasmPath);\nconst wasmModule = new WebAssembly.Module(wasmBytes);";
          if(!content.includes(original))throw new Error('validator_loader_changed');
          content=content.replace(original,'const wasmModule = globalThis.__secondwindValidatorWasm;');
        }
        if(args.path.endsWith('/core/lib/validation/cloudformation-validate-plugin.js')){
          const original='path().join(__dirname,"rules")';
          if(!content.includes(original))throw new Error('validator_rules_loader_changed');
          content=content.replace(original,'globalThis.__secondwindRulesDirectory');
        }
        return {contents:content,loader:args.path.endsWith('.ts')?'ts':'js'};
      });
    }}]});
  const code=emitted.outputFiles[0].text;
  const assets=[],add=(name,type,bytes)=>{bytes=Buffer.from(bytes);const hash=digest(bytes);assets.push({name,type,sha256:hash,size_bytes:bytes.length,r2_key:`private-runtime/sha256/${hash}`,bytes});};
  const data={};
  for(const [name,content] of files)if(!/\.[cm]?[jt]s$/.test(name)&&!/(?:^|\/)(?:README\.md|LICENSE|source-provenance\.json|validation\.json|files\.manifest\.json|release-candidate\.json|product\.json|preview-contract\.json)$/.test(name))data[`/tmp/secondwind-product/${name}`]=content;
  const cdk=path.join(dependencies,'aws-cdk-lib');
  let wasmImport='',rules={};
  if(await exists(cdk)) {
    const wasm=path.join(cdk,'node_modules/@aws/cloudformation-validate/bindings_wasm_bg.wasm');
    if(await exists(wasm)){add('product/validator.wasm','wasm',await readFile(wasm));wasmImport=`import validatorWasm from './validator.wasm';`;} 
    const rulePath=path.join(cdk,'core/lib/validation/rules');
    if(await exists(rulePath))for(const name of await readdir(rulePath))if(name.endsWith('.rego'))rules[name]=await readFile(path.join(rulePath,name),'utf8');
  }
  add('product/files.json','json',JSON.stringify(data));
  add('product/rules.json','json',JSON.stringify(rules));
  nodeImports.add('fs');nodeImports.add('path');nodeImports.add('process');
  const imports=[...nodeImports].sort();
  const native=imports.map((name,i)=>`import * as node${i} from 'node:${name}';`).join('\n');
  const mappings=imports.map((name,i)=>`${JSON.stringify(`node:${name}`)}:node${i}.default??node${i}`).join(',');
  add('product/native.mjs','javascript',`${native}\nconst builtins={${mappings}};\nexport function initialize(){const module={exports:{}};const exports=module.exports;const require=name=>{if(!Object.hasOwn(builtins,name))throw new Error('private_dependency_missing');return builtins[name];};const process=require('node:process');const __dirname='/tmp/secondwind-product';const __filename=__dirname+'/preview.mjs';\n${code}\nreturn module.exports;}\n`);
  let artifactImport='',previewArtifacts='';
  if(row.slug==='cdk-lambda-nodejs'){
    const handler=await build({absWorkingDir:source,entryPoints:['handler.ts'],bundle:true,
      write:false,platform:'node',target:'node22',format:'cjs',minify:true,logLevel:'silent'});
    add('product/handler.txt','text',handler.outputFiles[0].contents);
    artifactImport="import prebuiltHandler from './handler.txt';";
    previewArtifacts=',{prebuiltHandler}';
  }
  const call=ts?`module.preview(configuration${previewArtifacts})`:'module.preview({configuration,selected_components})';
  add('product/preview.mjs','javascript',`import {initialize} from './native.mjs';
import * as fs from 'node:fs';import path from 'node:path';
import files from './files.json';import rules from './rules.json';${wasmImport}${artifactImport}
export async function preview({configuration,selected_components=[]}){
 for(const [name,content] of Object.entries(files)){fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,content);}
 const ruleDir='/tmp/secondwind-rules';fs.mkdirSync(ruleDir,{recursive:true});for(const [name,content] of Object.entries(rules))fs.writeFileSync(path.join(ruleDir,name),content);
 globalThis.__secondwindRulesDirectory=ruleDir;${wasmImport?'globalThis.__secondwindValidatorWasm=validatorWasm;':''}
 try{const module=initialize();const result=await ${call};const output={ok:result?.ok===true,status:result?.ok===true?'complete':'blocked',slug:${JSON.stringify(row.slug)},selected_components,diagnostic_codes:result?.ok===true?['local_fixture_only']:['validation_failed']};
 for(const name of ['resource_count','operation_count','verification_count','route_count','action_count','model_count','table_count','index_count','policy_count','permission_count','warning_count','error_count'])if(Number.isSafeInteger(result?.[name])&&result[name]>=0&&result[name]<=1000)output[name]=result[name];return output;
 }finally{fs.rmSync('/tmp/secondwind-product',{recursive:true,force:true});fs.rmSync(ruleDir,{recursive:true,force:true});delete globalThis.__secondwindRulesDirectory;delete globalThis.__secondwindValidatorWasm;}
}
`);
  const publicAssets=assets.map(({bytes,...asset})=>asset);
  for(const asset of assets)await write(path.join(dir,'assets',asset.sha256),asset.bytes);
  return {kind:'private-javascript-modules',entrypoint:'product/preview.mjs',modules:publicAssets,
    total_bytes:assets.reduce((n,a)=>n+a.size_bytes,0),dependency_input_count:Object.keys(emitted.metafile.inputs).length};
}

export async function buildProduct(row) {
  const inputBytes=await readFile(path.join(root,row.release_input));const input=JSON.parse(inputBytes);
  const files=productFiles(input),sourceHash=digest(canonical(Object.fromEntries(files)));
  const dir=path.join(output,row.slug,sourceHash);await mkdir(dir,{recursive:true});
  const previous=await readJson(path.join(dir,'build.json')).catch(()=>null);
  if(previous?.builder_sha256===builderHash&&previous.input_sha256===digest(inputBytes)
      &&previous.build?.kind==='private-javascript-modules'){
    let intact=true;
    for(const asset of previous.build.modules){
      const bytes=await readFile(path.join(dir,'assets',asset.sha256)).catch(()=>null);
      if(!bytes||bytes.length!==asset.size_bytes||digest(bytes)!==asset.sha256){intact=false;break;}
    }
    if(intact)return previous;
  }
  // Each product retains its own input, language and entrypoint. Interpreted
  // products are explicitly pending a native runtime adapter, never silently
  // translated to JavaScript or reported as a successful sandbox execution.
  let runtime;
  if(files.has('package.json'))runtime=await nodeRuntime(row,input,files,dir);
  else {
    for(const [name,content] of files)await write(path.join(dir,'source',name),content);
    runtime={kind:'native-source',language:input.manifest.language_policy.adapters[0],entrypoints:input.manifest.delivery_contract.entrypoints,
      runtime_adapter:'pending',reason:'Requires the product-specific interpreter and pinned dependencies'};
  }
  const report={schema_version:'1',sku:row.sku,slug:row.slug,input_sha256:digest(inputBytes),source_sha256:sourceHash,builder_sha256:builderHash,
    build:runtime,execution_verified:false,published:false};
  await write(path.join(dir,'build.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const inventory=await readJson(path.join(root,'docs/sandbox-package-readiness-2026-10-25.json'));
  const slugs=new Set(process.argv.slice(2));
  const results=await readJson(path.join(output,'results.json')).catch(()=>[]);
  let failed=false;
  for(const row of inventory.products.filter(p=>!p.private_adapter_compatible&&(!slugs.size||slugs.has(p.slug)))){
    const index=results.findIndex(r=>r.sku===row.sku);if(index!==-1)results.splice(index,1);
    try{const report=await buildProduct(row);results.push(report);console.log(JSON.stringify({slug:row.slug,built:report.build.kind,bytes:report.build.total_bytes}));}
    catch(error){const result={sku:row.sku,slug:row.slug,build_error:String(error.message),execution_verified:false,published:false};results.push(result);failed=true;console.log(JSON.stringify(result));}
    await write(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
  }
  if(failed)process.exitCode=1;
}
