import {checkConfiguration,describeProduct} from './catalog.js';
import {canonicalJson,sha256,randomToken,validToken,CommerceError} from './contracts.js';
import {componentMenu,prepareComponentSelection,assembledEntrypoint,selectionConfiguration,selectedPackageFiles} from './scope.js';
import {readStoredPackage} from './release-storage.js';
import {executeCode,validateExecutionInput} from './execution.js';
import {createScopeQuote} from './commerce.js';

const fail=(code,status=400)=>{throw new CommerceError(code,status);};

// Releases contain small immutable UTF-8 file packages. Other adapters must be
// implemented explicitly; no claims of arbitrary language execution or AWS access.
async function releaseFor(env,sku) {
  const product=await describeProduct(env.SW_DB,sku);
  const row=await env.SW_DB.prepare('SELECT * FROM component_releases WHERE sku=?1 AND version=?2')
    .bind(product.sku,product.version).first();
  if(!row) fail('component_trial_not_available',409);
  if(new TextEncoder().encode(row.manifest_json).byteLength>750000) fail('component_release_too_large',503);
  const release=JSON.parse(row.manifest_json);
  if(await sha256(canonicalJson(release))!==row.manifest_hash) fail('component_release_hash_mismatch',503);
  const menu=await componentMenu(release);
  if(release.sku!==product.sku || release.version!==product.version
      || menu.max_amount_atomic!==product.price_usdc_micros) fail('component_release_identity_mismatch',503);
  if(release.trial_adapter!=='javascript-isolate') fail('unsupported_trial_adapter',409);
  if(release.storage) {
    const stored=new Map((await readStoredPackage(env,release.storage)).map(f=>[f.path,f.content]));
    for(const c of release.components) for(const f of c.files) {
      if(f.content!==stored.get(f.path)) fail('release_storage_mismatch',503);
    }
  }
  const files=new Map();
  for(const component of release.components) for(const file of component.files) {
    if(typeof file.content!=='string' || await sha256(file.content)!==file.sha256
        || new TextEncoder().encode(file.content).byteLength!==file.size_bytes) fail('component_payload_invalid',503);
    files.set(file.path,file);
  }
  const generated=assembledEntrypoint(release,release.components.map(c=>c.id));
  if(generated) files.set(generated.path,generated);
  return {product,release,menu,files};
}
export async function describeComponents(env,sku) {
  const {menu}=await releaseFor(env,sku);return menu;
}

export async function trialProduct(env,sku,configuration,input,callback,options={}) {
  const check=await checkConfiguration(env.SW_DB,sku,configuration);
  if(!check.ok) throw new CommerceError('incomplete_configuration',400,{missing:check.missing,errors:check.errors});
  const {product,release,menu,files}=await releaseFor(env,sku);
  if(product.version!==check.version) fail('product_changed',409);
  const execution=validateExecutionInput(input?.code,input?.language);
  const id=`trial_${crypto.randomUUID()}`,token=randomToken();
  const created_at=new Date().toISOString(),expires_at=Date.now()+3600000;
  await env.SW_DB.prepare(`INSERT INTO component_trials
    (id,token_hash,sku,version,release_hash,config_json,status,created_at,expires_at)
    VALUES (?1,?2,?3,?4,?5,?6,'running',?7,?8)`)
    .bind(id,await sha256(token),product.sku,product.version,menu.release_hash,canonicalJson(check.config),created_at,expires_at).run();
  // Only explicit trial operations cross into the isolated Worker. No quote,
  // payment, grant, storage, gateway secret or network capability is provided.
  const providers={
    components:async()=>menu,
    configuration:async()=>check.config,
    readFile:async(path)=>{if(!files.has(path)) fail('trial_file_not_found',404);return files.get(path).content;},
  };
  const modules=Object.fromEntries([...files].filter(([path])=>/\.m?js$/.test(path)).map(([path,file])=>['product/'+path,{js:file.content}]));
  const result=await executeCode(env,execution.code,execution.language,null,callback,{...options,providers,modules});
  const status=result.ok?'completed':'failed';
  await env.SW_DB.prepare('UPDATE component_trials SET status=?1,result_json=?2 WHERE id=?3 AND status=\'running\'')
    .bind(status,canonicalJson(result),id).run();
  return {trial_id:id,trial_token:token,expires_at:new Date(expires_at).toISOString(),
    release_hash:menu.release_hash,status,result,
    evidence_kind:'buyer_sandbox_execution',
    note:'Sandbox output is buyer-run evidence, not verification of a foreign AWS deployment.'};
}
async function readTrial(env,id,token) {
  if(typeof id!=='string' || !validToken(token)) fail('trial_unauthorized',401);
  const row=await env.SW_DB.prepare('SELECT * FROM component_trials WHERE id=?1 AND token_hash=?2')
    .bind(id,await sha256(token)).first();
  if(!row) fail('trial_unauthorized',401);
  if(row.expires_at<Date.now()) fail('trial_expired',409);
  const current=await releaseFor(env,row.sku);
  if(current.product.version!==row.version || current.menu.release_hash!==row.release_hash) fail('trial_release_changed',409);
  return {row,...current};
}
export async function recoverTrial(env,id,token) {
  const {row}=await readTrial(env,id,token);
  return {trial_id:row.id,status:row.status,release_hash:row.release_hash,
    result:row.result_json?JSON.parse(row.result_json):null};
}
export async function selectTrialComponents(env,id,token,ids) {
  const {row,release}=await readTrial(env,id,token);
  if(row.status!=='completed') fail('trial_not_completed',409);
  const configuration=selectionConfiguration(release,ids,JSON.parse(row.config_json));
  const scope=await prepareComponentSelection(release,ids,configuration);
  await env.SW_DB.prepare('INSERT INTO component_selections(trial_id,scope_hash,scope_json,created_at) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING')
    .bind(id,scope.scope_hash,canonicalJson(scope),new Date().toISOString()).run();
  // Public selection exposes file identities, not an extra copy of file content.
  return scope;
}
export async function acceptTrialSelection(env,id,token,ids,expectedScopeHash) {
  const {row,release,product,files}=await readTrial(env,id,token);
  if(row.status!=='completed') fail('trial_not_completed',409);
  const configuration=selectionConfiguration(release,ids,JSON.parse(row.config_json));
  const scope=await prepareComponentSelection(release,ids,configuration);
  if(scope.scope_hash!==expectedScopeHash) fail('selection_acceptance_mismatch',409);
  const selected=await env.SW_DB.prepare('SELECT scope_hash FROM component_selections WHERE trial_id=?1 AND scope_hash=?2').bind(id,scope.scope_hash).first();
  if(!selected) fail('selection_required',409);
  const selectedFiles=selectedPackageFiles(release,scope);
  if(release.assembly) {
    const tested=await env.SW_DB.prepare('SELECT package_hash FROM selection_validations WHERE trial_id=?1 AND scope_hash=?2 AND passed=1').bind(id,scope.scope_hash).first();
    if(!tested || tested.package_hash!==await sha256(canonicalJson(selectedFiles))) fail('selected_product_test_required',409);
  }
  return createScopeQuote(env,{product,scope,configuration,files:selectedFiles,acceptanceKey:`${id}:${scope.scope_hash}`});
}

export async function testTrialSelection(env,id,token,ids,expectedScopeHash,input,callback,options={}) {
  const {row,release}=await readTrial(env,id,token);
  if(row.status!=='completed') fail('trial_not_completed',409);
  const configuration=selectionConfiguration(release,ids,JSON.parse(row.config_json));
  const scope=await prepareComponentSelection(release,ids,configuration);
  if(scope.scope_hash!==expectedScopeHash) fail('selection_acceptance_mismatch',409);
  const selected=await env.SW_DB.prepare('SELECT scope_hash FROM component_selections WHERE trial_id=?1 AND scope_hash=?2').bind(id,scope.scope_hash).first();
  if(!selected) fail('selection_required',409);
  const execution=validateExecutionInput(input?.code,input?.language);
  const code_hash=await sha256(execution.code);
  const previous=await env.SW_DB.prepare('SELECT * FROM selection_validations WHERE trial_id=?1 AND scope_hash=?2 AND code_hash=?3').bind(id,scope.scope_hash,code_hash).first();
  if(previous) return {scope_hash:scope.scope_hash,package_hash:previous.package_hash,code_hash,result:JSON.parse(previous.result_json),replayed:true};
  const selectedFiles=selectedPackageFiles(release,scope),files=new Map(selectedFiles.map(f=>[f.path,f.content]));
  const package_hash=await sha256(canonicalJson(selectedFiles));
  const result=await executeCode(env,execution.code,execution.language,null,callback,{...options,
    modules:Object.fromEntries([...files].filter(([path])=>/\.m?js$/.test(path)).map(([path,content])=>['product/'+path,{js:content}])),
    providers:{configuration:async()=>configuration,scope:async()=>scope,
      readFile:async path=>{if(!files.has(path)) fail('trial_file_not_found',404);return files.get(path);}}});
  await env.SW_DB.prepare(`INSERT INTO selection_validations(trial_id,scope_hash,code_hash,package_hash,result_json,passed,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT DO NOTHING`)
    .bind(id,scope.scope_hash,code_hash,package_hash,canonicalJson(result),result.ok?1:0,new Date().toISOString()).run();
  return {scope_hash:scope.scope_hash,package_hash,code_hash,result,evidence_kind:'buyer_sandbox_execution'};
}
