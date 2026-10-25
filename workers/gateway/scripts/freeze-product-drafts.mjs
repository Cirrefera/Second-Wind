import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {canonicalJson,sha256} from '../src/contracts.js';

// Explicitly named draft products only. Previous frozen inputs remain intact;
// a source change creates a new version and invalidates previous review status.
const root=fileURLToPath(new URL('../../../',import.meta.url));
const inventoryPath=path.join(root,'docs/sandbox-package-readiness-2026-10-25.json');
const inventory=JSON.parse(await readFile(inventoryPath,'utf8'));
const requested=new Set(process.argv.slice(2));
if(!requested.size)throw new Error('explicit_product_slugs_required');
for(const slug of requested){
  const row=inventory.products.find(p=>p.slug===slug);
  if(!row||row.published||row.private_adapter_compatible)throw new Error('draft_product_required:'+slug);
  const prior=await readFile(path.join(root,row.release_input),'utf8');
  const input=JSON.parse(prior),directory=path.join(root,'products',slug);
  const display=await readFile(path.join(directory,'product.json'),'utf8').then(JSON.parse,()=>null);
  if(typeof display?.name==='string'&&typeof display?.summary==='string'){
    input.item.name=display.name;input.item.summary=display.summary;
    input.manifest.original_contribution=display.summary;
    input.routing_manifest.route_summary=display.summary;
  }
  const names=new Set(input.files.map(f=>f.path));
  for(const name of ['package-lock.json','preview.mjs']){
    if(await readFile(path.join(directory,name)).then(()=>true,()=>false))names.add(name);
  }
  const files=[];
  for(const name of names){
    const content=await readFile(path.join(directory,name),'utf8');
    const old=input.files.find(f=>f.path===name);
    files.push({...old,path:name,content,sha256:await sha256(content),size_bytes:Buffer.byteLength(content),
      mime_type:old?.mime_type||(name.endsWith('.json')?'application/json':'text/javascript')});
  }
  if(canonicalJson(files)===canonicalJson(input.files)){console.log(slug+': unchanged');continue;}
  const version=input.item.version+1,manifest=input.manifest;
  input.files=files;input.item.version=version;input.item.status='draft';manifest.version=version;
  input.item.guidance=files.find(f=>f.path==='README.md')?.content||input.item.guidance;
  manifest.required_files=files.map(({content,...f})=>f);
  for(const component of manifest.components||[]){
    component.files=component.files.map(f=>files.find(next=>next.path===f.path)||f);
    if(manifest.components.length===1)component.files=files;
  }
  const payload=canonicalJson({schema_version:'1',sku:input.item.sku,version,files});
  const hash=await sha256(payload);
  manifest.content_hash=hash;manifest.release_ref=`sha256:${hash}`;
  input.payload={content:payload,sha256:hash,size_bytes:Buffer.byteLength(payload),mime_type:'application/json'};
  input.routing_manifest.version=version;input.routing_manifest.release_ref=manifest.release_ref;
  input.source_provenance.previous_release_input_sha256=await sha256(prior);
  input.source_provenance.original_file_hashes=Object.fromEntries(files.map(f=>[f.path,f.sha256]));
  input.blockers=[...new Set([...(input.blockers||[]),'updated_product_source_requires_review'])];
  const target=path.join(directory,'releases',`v${version}`);await mkdir(target,{recursive:true});
  const candidate={...manifest,status:'draft',publication_blockers:input.blockers};
  for(const [name,value] of Object.entries({'release-input.json':input,'release-candidate.json':candidate,
    'routing-manifest.json':input.routing_manifest,'source-provenance.json':input.source_provenance,
    'files.manifest.json':{schema_version:'1',sku:row.sku,version,required_files:manifest.required_files}})){
    const file=path.join(target,name),bytes=JSON.stringify(value,null,2)+'\n';
    const existing=await readFile(file,'utf8').catch(()=>null);
    if(existing!==null&&existing!==bytes)throw new Error('immutable_draft_version_exists:'+file);
    await writeFile(file,bytes);
  }
  row.release_input=path.relative(root,path.join(target,'release-input.json'));
  row.version=version;row.manifest_hash=await sha256(canonicalJson(manifest));
  row.source_ready=false;row.source_blockers=['updated_product_source_requires_review'];
  row.source_files_match=true;row.source_file_errors=[];
  console.log(`${slug}: froze v${version}`);
}
await writeFile(inventoryPath,JSON.stringify(inventory,null,2)+'\n');
