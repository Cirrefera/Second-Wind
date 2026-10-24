import {checkConfiguration,copyConfiguration,describeProduct} from './catalog.js';
import {canonicalJson,sha256,validToken,CommerceError} from './contracts.js';
import {validatePreview} from './preview.js';
import {validateExecutionInput} from './execution.js';
import {createSandboxAccess,recoverGrant} from './commerce.js';
import {requireSandboxEligible} from './sandbox-policy.js';

const fail=(code,status=400,details={})=>{throw new CommerceError(code,status,details);};
const accessKey=id=>`sandbox-access:${id}`;

function trialCredentials(input) {
  const id=input?.trial_id,token=input?.trial_token;
  if(typeof id!=='string' || !/^trial_[A-Za-z0-9_-]{1,96}$/.test(id) || !validToken(token))
    fail('invalid_trial_recovery_credentials');
  return {id,token};
}

function normalizedComponents(input) {
  if(!Array.isArray(input?.components) || !input.components.length || input.components.length>100
      || input.components.some(id=>typeof id!=='string') || new Set(input.components).size!==input.components.length)
    fail('explicit_trial_components_required');
  return [...input.components].sort();
}

async function pinnedRelease(env,sku,version,expectedHash) {
  const row=await env.SW_DB.prepare('SELECT manifest_json,manifest_hash FROM component_releases WHERE sku=?1 AND version=?2')
    .bind(sku,version).first();
  if(!row || new TextEncoder().encode(row.manifest_json).byteLength>750000) fail('component_trial_not_available',409);
  let release;
  try { release=JSON.parse(row.manifest_json); }
  catch { fail('component_release_hash_mismatch',503); }
  const hash=await sha256(canonicalJson(release));
  if(hash!==row.manifest_hash || hash!==expectedHash || release.sku!==sku || release.version!==version)
    fail('component_release_hash_mismatch',503);
  return release;
}

async function validatePreviewRequest(release,configuration,components) {
  const preview=await validatePreview(release,configuration,components);
  if(Array.isArray(preview)) return preview;
  if(preview?.ok===true && Array.isArray(preview.selected_components)) return preview.selected_components;
  fail(preview?.code || 'trial_preview_contract_invalid',409);
}

function buildRequest({id,tokenHash,productKey,product,releaseHash,configuration,execution,components}) {
  return {trial_id:id,trial_token_hash:tokenHash,product_key:productKey,sku:product.sku,
    version:product.version,release_hash:releaseHash,configuration,code:execution.code,
    language:execution.language,components};
}

async function priorAcceptance(env,id) {
  return env.SW_DB.prepare(`SELECT q.* FROM component_acceptances a
    JOIN commerce_quotes q ON q.id=a.quote_id WHERE a.acceptance_key=?1`).bind(accessKey(id)).first();
}

function acceptanceSnapshot(quote) {
  let snapshot;
  try { snapshot=JSON.parse(quote.snapshot_json); }
  catch { fail('sandbox_access_record_invalid',503); }
  if(quote.kind!=='product' || quote.sku!=='SW-SANDBOX' || quote.amount_usdc_micros!=='10000'
      || snapshot.purchase_purpose!=='sandbox-access' || !snapshot.trial_product
      || snapshot.sku!=='SW-SANDBOX') fail('sandbox_access_record_invalid',503);
  return snapshot;
}

async function assertSameAcceptance(env,acceptance,request,product) {
  const quote=await env.SW_DB.prepare('SELECT * FROM commerce_quotes WHERE id=?1')
    .bind(acceptance.acceptanceId).first();
  if(!quote) fail('sandbox_access_record_unavailable',503);
  const snapshot=acceptanceSnapshot(quote);
  let stored;
  try { stored=JSON.parse(quote.config_json); }
  catch { fail('sandbox_access_record_invalid',503); }
  if(stored.trial_token_hash!==request.trial_token_hash) fail('trial_unauthorized',401);
  if(await sha256(canonicalJson(request))!==quote.request_hash
      || canonicalJson(stored)!==canonicalJson(request)
      || snapshot.manifest_hash!==request.release_hash
      || canonicalJson(snapshot.trial_product)!==canonicalJson(product))
    fail('trial_request_conflict',409);
  return {quote,snapshot};
}

/** Create or recover the immutable one-cent acceptance for a single preview. */
export async function prepareTrialAccess(env,sku,configuration,input,{journey}={}) {
  if(typeof sku!=='string' || !sku.trim() || sku.length>200) fail('invalid_product_key');
  const productKey=sku.trim();
  const {id,token}=trialCredentials(input);
  const tokenHash=await sha256(token);
  const config=copyConfiguration(configuration);
  const execution=validateExecutionInput(input?.code,input?.language);
  const components=normalizedComponents(input);

  const prior=await priorAcceptance(env,id);
  if(prior) {
    const snapshot=acceptanceSnapshot(prior);
    let stored;
    try { stored=JSON.parse(prior.config_json); }
    catch { fail('sandbox_access_record_invalid',503); }
    if(stored.trial_token_hash!==tokenHash) fail('trial_unauthorized',401);
    const product=snapshot.trial_product;
    if(productKey!==stored.product_key || product.sku!==stored.sku || product.version!==stored.version)
      fail('trial_request_conflict',409);
    requireSandboxEligible(product.sku);
    const release=await pinnedRelease(env,product.sku,product.version,stored.release_hash);
    if(snapshot.manifest_hash!==stored.release_hash) fail('sandbox_access_record_invalid',503);
    const request=buildRequest({id,tokenHash,productKey,product,releaseHash:stored.release_hash,
      configuration:config,execution,components});
    if(canonicalJson(stored)!==canonicalJson(request)
        || await sha256(canonicalJson(request))!==prior.request_hash) fail('trial_request_conflict',409);
    const selected=await validatePreviewRequest(release,config,components);
    if(canonicalJson(selected)!==canonicalJson(components)) fail('trial_request_conflict',409);
    const acceptance=await createSandboxAccess(env,{request,product,acceptanceKey:accessKey(id),journey});
    await assertSameAcceptance(env,acceptance,request,product);
    return {acceptance,request,product,release,token};
  }

  const checked=await checkConfiguration(env.SW_DB,productKey,configuration);
  if(!checked.ok) throw new CommerceError('incomplete_configuration',400,
    {missing:checked.missing,errors:checked.errors});
  const product=await describeProduct(env.SW_DB,productKey);
  requireSandboxEligible(product.sku);
  if(product.version!==checked.version) fail('product_changed',409);
  const existingTrial=await env.SW_DB.prepare('SELECT token_hash FROM component_trials WHERE id=?1').bind(id).first();
  if(existingTrial) {
    if(existingTrial.token_hash!==tokenHash) fail('trial_unauthorized',401);
    fail('trial_already_exists',409,{hint:'Recover this trial using its existing credentials; use a new trial ID for a new preview.'});
  }
  const releaseRow=await env.SW_DB.prepare('SELECT manifest_json,manifest_hash FROM component_releases WHERE sku=?1 AND version=?2')
    .bind(product.sku,product.version).first();
  if(!releaseRow || new TextEncoder().encode(releaseRow.manifest_json).byteLength>750000)
    fail('component_trial_not_available',409);
  let release;
  try { release=JSON.parse(releaseRow.manifest_json); }
  catch { fail('component_release_hash_mismatch',503); }
  const releaseHash=await sha256(canonicalJson(release));
  if(releaseHash!==releaseRow.manifest_hash || release.sku!==product.sku || release.version!==product.version)
    fail('component_release_hash_mismatch',503);
  const selected=await validatePreviewRequest(release,checked.config,components);
  const request=buildRequest({id,tokenHash,productKey,product,releaseHash,
    configuration:checked.config,execution,components:selected});
  const acceptance=await createSandboxAccess(env,{request,product,acceptanceKey:accessKey(id),journey});
  await assertSameAcceptance(env,acceptance,request,product);
  return {acceptance,request,product,release,token};
}

/** Require the linked, settled SW-SANDBOX commerce grant before trial execution. */
export async function authorizeTrialAccess(env,sku,configuration,input,options={}) {
  const prepared=await prepareTrialAccess(env,sku,configuration,input,options);
  const quoteId=prepared.acceptance.acceptanceId;
  const purchase=await env.SW_DB.prepare('SELECT payment_id,quote_id,status FROM commerce_purchases WHERE quote_id=?1')
    .bind(quoteId).first();
  if(!purchase) throw new CommerceError('sandbox_payment_required',403,
    {purchase:prepared.acceptance.purchase,amount_usdc_micros:'10000',acceptanceId:quoteId});
  const priorLink=await env.SW_DB.prepare('SELECT payment_id FROM component_trial_payments WHERE trial_id=?1')
    .bind(prepared.request.trial_id).first();
  if(priorLink && priorLink.payment_id!==purchase.payment_id) fail('sandbox_payment_mismatch',409);
  // The caller's trial token is also its private recovery bearer for this
  // immutable admission. The paid D1 ledger and receipt remain entitlement proof.
  const grant=await recoverGrant(env,purchase.payment_id,prepared.token);
  const quote=await env.SW_DB.prepare('SELECT * FROM commerce_quotes WHERE id=?1').bind(quoteId).first();
  if(!quote || quote.id!==purchase.quote_id) fail('sandbox_access_record_invalid',503);
  const snapshot=acceptanceSnapshot(quote);
  if(grant.sku!=='SW-SANDBOX' || grant.paymentId!==purchase.payment_id
      || grant.receipt?.amount_usdc_micros!=='10000'
      || snapshot.purchase_purpose!=='sandbox-access') fail('sandbox_payment_mismatch',409);
  return {...prepared,paymentId:purchase.payment_id};
}
