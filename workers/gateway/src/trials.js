import {checkConfiguration,copyConfiguration,describeProduct} from './catalog.js';
import {canonicalJson,sha256,validToken,CommerceError} from './contracts.js';
import {trialMenu,prepareComponentSelection} from './scope.js';
import {executeCode,validateExecutionInput} from './execution.js';
import {createScopeQuote} from './commerce.js';
import {enqueueObservation,observeExpiredTrial} from './telemetry.js';

const fail=(code,status=400)=>{throw new CommerceError(code,status);};
const trialStatus=(env,row)=>row.status!=='running'?row.status:
  Date.now()<Date.parse(row.created_at)+Math.max(100,Math.min(60_000,Number(env.EXECUTION_TIMEOUT_MS)||15_000))+5_000?'running':'unknown';

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
  if(!Array.isArray(release.components) || !release.components.length) fail('component_trial_not_available',409);
  const menu=await trialMenu(release);
  if(release.sku!==product.sku || release.version!==product.version
      || (menu.pricing_status!=='not_configured' && menu.max_amount_atomic!==product.price_usdc_micros)) fail('component_release_identity_mismatch',503);
  if(release.trial_adapter!=='javascript-isolate') fail('unsupported_trial_adapter',409);
  const files=new Map();
  for(const component of release.components) for(const file of component.files) {
    if(typeof file.content!=='string' || await sha256(file.content)!==file.sha256
        || new TextEncoder().encode(file.content).byteLength!==file.size_bytes) fail('component_payload_invalid',503);
    files.set(file.path,file);
  }
  return {product,release,menu,files};
}
export async function describeComponents(env,sku) {
  const {menu}=await releaseFor(env,sku);return menu;
}

export async function trialProduct(env,sku,configuration,input,callback,options={}) {
  const id=input?.trial_id,token=input?.trial_token;
  if(id===undefined && token===undefined) throw new CommerceError('trial_recovery_credentials_required',400,
    {hint:'Generate and privately retain trial_id (trial_ plus a UUID) and trial_token (32 random bytes as base64url) before execution.'});
  if(typeof id!=='string' || !/^trial_[A-Za-z0-9_-]{1,96}$/.test(id) || !validToken(token))
    fail('invalid_trial_recovery_credentials');
  if(typeof sku!=='string' || !sku.trim() || sku.length>200) fail('invalid_product_key');
  const execution=validateExecutionInput(input?.code,input?.language);
  const config=copyConfiguration(configuration);
  const tokenHash=await sha256(token);
  const hashRequest=row=>sha256(canonicalJson({sku:sku.trim(),version:row.version,
    release_hash:row.release_hash,configuration:config,code:execution.code,language:execution.language}));
  const readAttempt=()=>env.SW_DB.prepare(`SELECT t.*,r.request_hash,r.execution_owner
    FROM component_trials t LEFT JOIN component_trial_requests r ON r.trial_id=t.id WHERE t.id=?1`).bind(id).first();
  const validateAttempt=async row=>{
    if(row.token_hash!==tokenHash) fail('trial_unauthorized',401);
    if(!row.request_hash || row.request_hash!==await hashRequest(row)) fail('trial_request_conflict',409);
    if(row.expires_at<Date.now()) {await observeExpiredTrial(env,id);fail('trial_expired',409);}
  };
  const responseFor=row=>({trial_id:id,trial_token:token,expires_at:new Date(row.expires_at).toISOString(),
    release_hash:row.release_hash,status:trialStatus(env,row),result:row.result_json?JSON.parse(row.result_json):null,
    evidence_kind:'buyer_sandbox_execution',
    note:'Sandbox output is buyer-run evidence, not verification of a foreign AWS deployment.'});
  // Recover the original identity before consulting today's catalog. A later
  // release must never turn an identical retry into a new execution.
  const prior=await readAttempt();
  if(prior) {await validateAttempt(prior);return responseFor(prior);}
  const check=await checkConfiguration(env.SW_DB,sku,configuration);
  if(!check.ok) throw new CommerceError('incomplete_configuration',400,{missing:check.missing,errors:check.errors});
  const {product,release,menu,files}=await releaseFor(env,sku);
  if(product.version!==check.version) fail('product_changed',409);
  const requestHash=await hashRequest({version:product.version,release_hash:menu.release_hash});
  const owner=crypto.randomUUID();
  const created_at=new Date().toISOString(),expires_at=Date.now()+3600000;
  const trialInsert=env.SW_DB.prepare(`INSERT INTO component_trials
    (id,token_hash,sku,version,release_hash,config_json,status,created_at,expires_at)
    VALUES (?1,?2,?3,?4,?5,?6,'running',?7,?8)`)
    .bind(id,tokenHash,product.sku,product.version,menu.release_hash,canonicalJson(check.config),created_at,expires_at);
  const identityInsert=env.SW_DB.prepare(`INSERT INTO component_trial_requests (trial_id,request_hash,execution_owner)
    VALUES (?1,?2,?3)`).bind(id,requestHash,owner);
  let inserted=false;
  try { await env.SW_DB.batch([trialInsert,identityInsert]); inserted=true; }
  catch {
    // A failed D1 acknowledgement may follow a committed batch. Read back
    // the identity before deciding whether this request owns execution.
  }
  let row;
  try { row=await readAttempt(); }
  catch { throw new CommerceError('trial_start_unknown',503,{trial_id:id,trial_token:token}); }
  if(!row) {
    if(!inserted) throw new CommerceError('trial_start_unavailable',503,{trial_id:id,trial_token:token});
    throw new CommerceError('trial_start_unknown',503,{trial_id:id,trial_token:token});
  }
  await validateAttempt(row);
  if(row.execution_owner!==owner) return responseFor(row);
  if(options.journey) await enqueueObservation(env,'journey.linked',
    {journey:options.journey,payload:{trial_id:id}});
  // Only explicit trial operations cross into the isolated Worker. No acceptance,
  // payment, grant, storage, gateway secret or network capability is provided.
  const providers={
    components:async()=>menu,
    configuration:async()=>check.config,
    readFile:async(path)=>{if(!files.has(path)) fail('trial_file_not_found',404);return files.get(path).content;},
  };
  const modules=Object.fromEntries([...files].filter(([path])=>/\.m?js$/.test(path)).map(([path,file])=>['product/'+path,file.content]));
  const result=await executeCode(env,execution.code,execution.language,null,callback,{...options,providers,modules});
  const status=result.ok?'completed':'failed';
  try {
    await env.SW_DB.prepare('UPDATE component_trials SET status=?1,result_json=?2 WHERE id=?3 AND status=\'running\'')
      .bind(status,canonicalJson(result),id).run();
  } catch {
    // Execution has already happened. Never retry it; read back if possible.
  }
  let saved;
  try { saved=await env.SW_DB.prepare('SELECT status,result_json FROM component_trials WHERE id=?1').bind(id).first(); }
  catch { saved=null; }
  if(!saved?.result_json) return {trial_id:id,trial_token:token,expires_at:new Date(expires_at).toISOString(),
    release_hash:menu.release_hash,status:'unknown',result:null,evidence_kind:'buyer_sandbox_execution',
    note:'Sandbox execution may have completed, but its result was not durably confirmed. It will not be rerun.'};
  return {trial_id:id,trial_token:token,expires_at:new Date(expires_at).toISOString(),
    release_hash:menu.release_hash,status:saved.status,result:JSON.parse(saved.result_json),
    evidence_kind:'buyer_sandbox_execution',
    note:'Sandbox output is buyer-run evidence, not verification of a foreign AWS deployment.'};
}
async function readTrial(env,id,token,{requireCurrent=true}={}) {
  if(typeof id!=='string' || !validToken(token)) fail('trial_unauthorized',401);
  const row=await env.SW_DB.prepare('SELECT * FROM component_trials WHERE id=?1 AND token_hash=?2')
    .bind(id,await sha256(token)).first();
  if(!row) fail('trial_unauthorized',401);
  if(row.expires_at<Date.now()) {
    await observeExpiredTrial(env,id);
    fail('trial_expired',409);
  }
  if(!requireCurrent) return {row};
  const current=await releaseFor(env,row.sku);
  if(current.product.version!==row.version || current.menu.release_hash!==row.release_hash) fail('trial_release_changed',409);
  return {row,...current};
}
export async function recoverTrial(env,id,token,{journey}={}) {
  const {row}=await readTrial(env,id,token,{requireCurrent:false});
  if(journey) await enqueueObservation(env,'recovery.trial_recovered',{journey,payload:{trial_id:row.id,sku:row.sku}});
  return {trial_id:row.id,status:trialStatus(env,row),release_hash:row.release_hash,
    result:row.result_json?JSON.parse(row.result_json):null};
}
export async function selectTrialComponents(env,id,token,ids) {
  const {row,release}=await readTrial(env,id,token);
  if(row.status!=='completed') fail('trial_not_completed',409);
  const scope=await prepareComponentSelection(release,ids,JSON.parse(row.config_json));
  await env.SW_DB.prepare('INSERT INTO component_selections(trial_id,scope_hash,scope_json,created_at) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING')
    .bind(id,scope.scope_hash,canonicalJson(scope),new Date().toISOString()).run();
  // Public selection exposes file identities, not an extra copy of file content.
  return scope;
}
export async function acceptTrialSelection(env,id,token,ids,expectedScopeHash,{journey}={}) {
  const {row,release,product,files}=await readTrial(env,id,token);
  if(row.status!=='completed') fail('trial_not_completed',409);
  const configuration=JSON.parse(row.config_json);
  const scope=await prepareComponentSelection(release,ids,configuration);
  if(scope.scope_hash!==expectedScopeHash) fail('selection_acceptance_mismatch',409);
  const selected=await env.SW_DB.prepare('SELECT scope_hash FROM component_selections WHERE trial_id=?1 AND scope_hash=?2').bind(id,scope.scope_hash).first();
  if(!selected) fail('selection_required',409);
  const selectedFiles=scope.files.map(file=>({path:file.path,content:files.get(file.path).content}));
  return createScopeQuote(env,{product,scope,configuration,files:selectedFiles,acceptanceKey:`${id}:${scope.scope_hash}`,journey});
}
