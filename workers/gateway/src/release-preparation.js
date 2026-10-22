import {canonicalJson,sha256,CommerceError} from './contracts.js';
import {validatePublication,canonicalService} from './publication.js';
import {validateRoutingManifest} from './routing.js';
import {validateComponentRelease} from './scope.js';

const text=value=>typeof value==='string'&&value.trim().length>0;
const sorted=value=>canonicalJson(Array.isArray(value)?[...value].sort():[]);
const digest=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const MAX_BYTES=16*1024*1024;
const reviewKinds=new Set(['routing','service','contract','product','license','purchase-url','validation','guidance-quality','sandbox-trial','bundle-members','language-adapters']);
const ITEM_FIELDS=['sku','slug','name','kind','service','summary','guidance','price_usd','invoke_kind','invoke_key','input_schema','input_example','mime_type','source_repo','source_path','source_url','license_spdx','provenance','content_hash','version'];
const defaults={guidance:'',invoke_kind:'resolve',invoke_key:'',input_schema:'',input_example:'',mime_type:'',source_repo:'',source_path:'',source_url:'',license_spdx:'',provenance:'',content_hash:''};
const fail=(code,details={})=>{throw new CommerceError(code,409,details);};
export const releasePayloadKey=(sku,version,hash)=>`releases/${encodeURIComponent(sku)}/${version}/${hash}`;

/** Reviews come from the trusted operator, separately from untrusted release
 * inputs. A reference identifies the actual review; this code never issues one.
 * Fixture review records are synthetic and do not approve repository products.
 */
function reviewed(reviews,kind,hash) {
  return reviews.find(review=>review?.kind===kind&&review.subject_hash===hash
    &&text(review.reviewed_by)&&text(review.reference));
}

async function bytesFor(env,file,blockers,label) {
  if(!file||typeof file!=='object') {blockers.push(`${label}_missing`);return null;}
  const hash=file.sha256??file.content_hash;
  if(!digest.test(hash||'')||(file.sha256&&file.content_hash&&file.sha256!==file.content_hash)
    ||!Number.isSafeInteger(file.size_bytes)||file.size_bytes<0||file.size_bytes>MAX_BYTES||!text(file.mime_type)) {
    blockers.push(`${label}_descriptor_invalid`);return null;
  }
  let bytes,stored=false;
  if(typeof file.content==='string') bytes=encoder.encode(file.content);
  if(file.r2_key&&env.PAYLOADS) {
    try {
      const object=await env.PAYLOADS.get(file.r2_key);
      if(object) {
        if(object.size>MAX_BYTES) {blockers.push(`${label}_too_large`);return null;}
        const actual=new Uint8Array(await object.arrayBuffer());
        if(actual.byteLength!==file.size_bytes||await sha256(actual)!==hash) blockers.push(`${label}_stored_bytes_mismatch`);
        else {stored=true;if(!bytes) bytes=actual;}
      }
    } catch {blockers.push(`${label}_store_unavailable`);}
  }
  if(!bytes) {blockers.push(`${label}_bytes_missing`);return null;}
  if(bytes.byteLength!==file.size_bytes||await sha256(bytes)!==hash) {blockers.push(`${label}_bytes_mismatch`);return null;}
  return {bytes,stored,hash};
}

/** Read-only source preparation. Inline bytes are useful before R2 is staged,
 * but immutable-store readiness is reported only after reading the exact key.
 * Commercial allocation and human reviews are never inferred from tests.
 */
export async function prepareRelease(env={},input={},options={}) {
  input=JSON.parse(canonicalJson(input));
  const blockers=[];
  const item={...defaults,...input.item};
  const manifest=input.manifest;
  if(input.schema_version!=='1') blockers.push('release_input_schema_unsupported');
  if(!manifest||typeof manifest!=='object') blockers.push('release_manifest_missing');
  if(!['tool','workflow','guide','artifact','agent'].includes(item.kind)) blockers.push('item_kind_invalid');
  if(!['resolve','bedrock','r2'].includes(item.invoke_kind)) blockers.push('invoke_kind_invalid');
  if(manifest&&manifest.service!==canonicalService(item.service)) blockers.push('canonical_service_mismatch');
  if(manifest?.input_schema!==undefined) {
    try {if(canonicalJson(JSON.parse(item.input_schema))!==canonicalJson(manifest.input_schema)) blockers.push('catalog_input_schema_mismatch');}
    catch {blockers.push('catalog_input_schema_mismatch');}
  }
  const manifestHash=manifest?await sha256(canonicalJson(manifest)):null;
  if(manifest&&encoder.encode(canonicalJson(manifest)).byteLength>750000) blockers.push('release_manifest_too_large');
  const reviews=Array.isArray(options.reviews)?options.reviews:[];
  const inputJson=canonicalJson(input),inputHash=await sha256(inputJson);
  const inputObject={r2_key:`release-inputs/${encodeURIComponent(item.sku)}/${item.version}/${manifestHash}/${inputHash}.json`,
    content_hash:inputHash,size_bytes:encoder.encode(inputJson).byteLength,mime_type:'application/json'};
  const inputVerified=await bytesFor(env,{...inputObject,content:inputJson},blockers,'release_input');
  const payload={...input.payload};
  const payloadHash=payload.sha256??payload.content_hash;
  const expectedKey=releasePayloadKey(item.sku,item.version,payloadHash);
  if(payload.r2_key&&payload.r2_key!==expectedKey) blockers.push('payload_key_not_immutable');
  payload.r2_key=expectedKey;
  if(payload.r2_bucket&&payload.r2_bucket!=='secondwind-payloads') blockers.push('payload_bucket_invalid');
  const verified=await bytesFor(env,payload,blockers,'payload');
  if(manifest&&verified&&manifest.content_hash!==verified.hash) blockers.push('manifest_payload_hash_mismatch');
  if(manifest?.product_kind==='guidance-product'&&verified
    &&(await sha256(item.guidance)!==verified.hash||manifest.hash_scope!=='guidance-utf8')) blockers.push('immutable_guidance_mismatch');

  const files=new Map();
  const components=Array.isArray(manifest?.components)?manifest.components:[];
  if(manifest?.components!==undefined&&!Array.isArray(manifest.components)) blockers.push('component_release_invalid');
  const sourceFiles=[...(Array.isArray(input.files)?input.files:[]),...components.flatMap(component=>Array.isArray(component?.files)?component.files:[])];
  if(manifest?.components) {
    try {await validateComponentRelease(manifest,{allowUnpriced:true});}
    catch(error) {blockers.push(error.code||'component_release_invalid');}
    for(const component of components) for(const file of Array.isArray(component?.files)?component.files:[]) if(typeof file?.content!=='string') blockers.push('component_file_bytes_missing');
  }
  for(const file of sourceFiles) {
    if(!text(file?.path)||file.path.length>256||!file.path.split('/').every(part=>/^[A-Za-z0-9_.-]{1,128}$/.test(part)&&part!=='.'&&part!=='..')) {
      blockers.push('source_file_path_invalid');continue;
    }
    const checked=await bytesFor(env,file,blockers,'source_file');
    if(!checked) continue;
    const prior=files.get(file.path);
    if(prior&&(prior.hash!==checked.hash||prior.mime_type!==file.mime_type)) blockers.push('source_file_conflict');
    files.set(file.path,{...checked,path:file.path,mime_type:file.mime_type});
  }
  if(manifest?.product_kind==='artifact-product') {
    if(!Array.isArray(manifest.required_files)||!manifest.required_files.length) blockers.push('required_files_missing');
    for(const required of Array.isArray(manifest.required_files)?manifest.required_files:[]) {
      const path=typeof required==='string'?required:required?.path;
      const file=files.get(path);
      if(!file) blockers.push('required_file_bytes_missing');
      else if(typeof required==='object'&&(required.sha256!==file.hash||required.size_bytes!==file.bytes.byteLength)) blockers.push('required_file_identity_mismatch');
    }
    if(verified) {
      if(manifest.delivery_contract?.kind==='file-package') {
        try {
          const delivered=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(verified.bytes));
          if(manifest.hash_scope!=='file-package-json-utf8'||delivered.schema_version!=='1'||delivered.sku!==item.sku
            ||delivered.version!==item.version||!Array.isArray(delivered.files)||delivered.files.length!==files.size) throw new Error();
          const paths=new Set();
          for(const file of delivered.files) {
            const actual=files.get(file.path);
            if(paths.has(file.path)||!actual||typeof file.content!=='string'||await sha256(file.content)!==actual.hash
              ||encoder.encode(file.content).byteLength!==actual.bytes.byteLength) throw new Error();
            if((file.sha256&&file.sha256!==actual.hash)||(file.size_bytes!==undefined&&file.size_bytes!==actual.bytes.byteLength)
              ||(file.mime_type&&file.mime_type!==actual.mime_type)) throw new Error();
            paths.add(file.path);
          }
        } catch {blockers.push('delivered_file_package_mismatch');}
      } else if(files.size!==1||[...files.values()][0].hash!==verified.hash) blockers.push('delivered_file_package_required');
    }
  }

  const routing=input.routing_manifest;
  const routingErrors=validateRoutingManifest(routing);
  blockers.push(...routingErrors);
  if(routing&&manifest&&(routing.sku!==item.sku||routing.slug!==item.slug||routing.version!==item.version
    ||routing.release_ref!==manifest.release_ref||routing.service!==canonicalService(item.service)||routing.product_kind!==manifest.product_kind
    ||routing.supported_boundary!==manifest.supported_boundary)) blockers.push('routing_release_identity_mismatch');
  if(routing&&manifest?.language_policy?.mode==='configured'
    &&(routing.language_policy!=='explicit'||sorted(routing.languages)!==sorted(manifest.language_policy.adapters))) blockers.push('routing_language_policy_mismatch');
  if(routing&&manifest?.language_policy?.mode==='not-applicable'&&routing.language_policy!=='not-applicable') blockers.push('routing_language_policy_mismatch');
  const routingHash=routing?await sha256(canonicalJson(routing)):null;
  const routingReview=reviewed(reviews,'routing',routingHash);
  const has=kind=>Boolean(reviewed(reviews,kind,manifestHash));
  const evidence={
    service_verified:has('service'),contract_review_hash:has('contract')?manifestHash:undefined,
    product_review_hash:has('product')?manifestHash:undefined,license_verified:has('license'),
    purchase_url_verified:has('purchase-url'),pre_settlement_ready:Boolean(verified?.stored),
    payload_verified_hash:verified?.hash,validation_passed_hash:has('validation')?verified?.hash:undefined,
    guidance_review_hash:has('guidance-quality')?verified?.hash:undefined,
    immutable_guidance_hash:verified?.stored?verified.hash:undefined,
    component_payloads_verified_hash:!blockers.length?manifestHash:undefined,
    sandbox_trial_verified_hash:has('sandbox-trial')?manifestHash:undefined,
    members_verified:has('bundle-members'),language_adapters_verified:has('language-adapters'),
  };
  const publication=await validatePublication(item,manifest,evidence);
  const structural=new Set(['sku_missing','version_invalid','slug_invalid','name_missing','summary_missing','price_invalid',
    'manifest_schema_unsupported','manifest_identity_mismatch','product_kind_unreviewed','immutable_release_missing',
    'release_hash_invalid','mime_type_missing','contracts_missing','original_contribution_missing','advertised_kind_mismatch',
    'guidance_missing','guidance_hash_mismatch','execution_schemas_missing','execution_safety_contract_missing',
    'language_adapters_missing','explicit_language_selection_missing','language_policy_missing','routing_contract_missing']);
  blockers.push(...publication.blockers.filter(blocker=>structural.has(blocker)));
  const publicationBlockers=[...publication.blockers,...blockers];
  if(!routingReview) publicationBlockers.push('routing_review_missing');
  if(Array.isArray(input.blockers)) publicationBlockers.push(...input.blockers.filter(text));
  if((manifest?.components?.length||manifest?.component_candidates?.length)&&manifest?.pricing?.mode!=='proportional-components') publicationBlockers.push('commercial_component_allocation_missing');
  const reviewObjects=[];
  for(const review of reviews) {
    if(!reviewKinds.has(review?.kind)||!reviewed([review],review.kind,review.kind==='routing'?routingHash:manifestHash)) continue;
    const hash=await sha256(canonicalJson(review));
    reviewObjects.push({kind:review.kind,subject_hash:review.subject_hash,content_hash:hash,
      r2_key:`release-reviews/${encodeURIComponent(item.sku)}/${item.version}/${manifestHash}/${review.kind}/${hash}.json`});
  }
  return {
    sku:item.sku,version:item.version,manifest_hash:manifestHash,routing_hash:routingHash,
    input_object:{...inputObject,stored_verified:Boolean(inputVerified?.stored)},
    source_ready:!blockers.length,source_blockers:[...new Set(blockers)],
    payload:{r2_bucket:'secondwind-payloads',r2_key:expectedKey,content_hash:payloadHash,size_bytes:payload.size_bytes,mime_type:payload.mime_type,stored_verified:Boolean(verified?.stored)},
    review_objects:reviewObjects,
    publication:{...publication,blockers:[...new Set(publicationBlockers)],eligibility:publicationBlockers.length?'blocked':'eligible'},
  };
}

function guard(db,condition,args=[]) {
  // D1 batches are transactions. An invalid JSON sentinel aborts the whole
  // batch if a row changes after preparation, including preceding inserts.
  return db.prepare(`SELECT json(CASE WHEN ${condition} THEN 'true' ELSE 'release_write_conflict' END)`).bind(...args);
}
async function storePayload(env,input,report) {
  if(!env.PAYLOADS) fail('payload_store_not_configured');
  const {r2_key:key,content_hash:hash,size_bytes:size,mime_type}=report.payload;
  const existing=await env.PAYLOADS.get(key);
  if(!existing) {
    if(typeof input.payload?.content!=='string') fail('payload_bytes_missing');
    // R2 conditional put preserves a concurrently staged immutable object.
    await env.PAYLOADS.put(key,encoder.encode(input.payload.content),{
      onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:mime_type},customMetadata:{sha256:hash},
    });
  }
  const object=await env.PAYLOADS.get(key);
  if(!object||object.size!==size||await sha256(new Uint8Array(await object.arrayBuffer()))!==hash) fail('immutable_payload_verification_failed');
}

async function storeReviews(env,reviews,report) {
  for(const record of report.review_objects) {
    // Match the record hash as well when several reviews cover the same subject.
    const matching=await Promise.all(reviews.filter(review=>review?.kind===record.kind&&review.subject_hash===record.subject_hash)
      .map(async review=>({review,hash:await sha256(canonicalJson(review))})));
    const exact=matching.find(value=>value.hash===record.content_hash)?.review;
    if(!exact) fail('review_snapshot_changed');
    const bytes=encoder.encode(canonicalJson(exact));
    const existing=await env.PAYLOADS.get(record.r2_key);
    if(!existing) await env.PAYLOADS.put(record.r2_key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{sha256:record.content_hash}});
    const stored=await env.PAYLOADS.get(record.r2_key);
    if(!stored||stored.size!==bytes.byteLength||await sha256(new Uint8Array(await stored.arrayBuffer()))!==record.content_hash) fail('immutable_review_verification_failed');
  }
}

async function storeInput(env,input,report) {
  const {r2_key:key,content_hash:hash,size_bytes:size}=report.input_object;
  const existing=await env.PAYLOADS.get(key);
  if(!existing) await env.PAYLOADS.put(key,encoder.encode(canonicalJson(input)),{
    onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{sha256:hash},
  });
  const object=await env.PAYLOADS.get(key);
  if(!object||object.size!==size||await sha256(new Uint8Array(await object.arrayBuffer()))!==hash) fail('immutable_release_input_verification_failed');
}

/** Explicit trusted-operator operation; intentionally has no HTTP/RPC route.
 * Stage writes draft evidence only. Activate requires the complete review gate.
 * An R2 object may remain after a failed D1 batch; no public row is half-written.
 */
export async function publishRelease(env,input,options={}) {
  input=JSON.parse(canonicalJson(input));
  options={...options,reviews:JSON.parse(canonicalJson(Array.isArray(options.reviews)?options.reviews:[]))};
  if(!['stage','activate'].includes(options.mode)) fail('explicit_release_mode_required');
  if(!env.SW_DB) fail('database_not_configured');
  let report=await prepareRelease(env,input,options);
  if(!report.source_ready) fail('release_source_not_ready',{report});
  const reviews=Array.isArray(options.reviews)?options.reviews:[];
  const routingReview=reviewed(reviews,'routing',report.routing_hash);
  if(!routingReview) fail('routing_review_missing',{report});
  const mechanical=new Set(['pre_settlement_preparation_unverified','immutable_guidance_release_unverified']);
  if(options.mode==='activate'&&report.publication.blockers.some(blocker=>!mechanical.has(blocker))) fail('release_publication_blocked',{report});
  const db=env.SW_DB;
  const item={...defaults,...input.item};
  const current=await db.prepare('SELECT * FROM items WHERE sku=?1').bind(item.sku).first();
  if(current&&item.version<current.version) fail('release_version_regression');
  if(current&&item.price_usd!==current.price_usd) fail('release_price_change_not_authorized');
  const payload=await db.prepare('SELECT * FROM payload_objects WHERE sku=?1 AND version=?2').bind(item.sku,item.version).first();
  const routing=await db.prepare('SELECT * FROM product_routing_manifests WHERE sku=?1 AND version=?2').bind(item.sku,item.version).first();
  const components=await db.prepare('SELECT * FROM component_releases WHERE sku=?1 AND version=?2').bind(item.sku,item.version).first();
  if(payload&&(payload.content_hash!==report.payload.content_hash||payload.r2_key!==report.payload.r2_key||payload.size_bytes!==report.payload.size_bytes
    ||payload.mime_type!==report.payload.mime_type||payload.r2_bucket!==report.payload.r2_bucket)) fail('immutable_payload_conflict');
  if(routing&&(routing.manifest_hash!==report.routing_hash||routing.manifest_json!==canonicalJson(input.routing_manifest))) fail('immutable_routing_conflict');
  if(components&&(components.manifest_hash!==report.manifest_hash||components.manifest_json!==canonicalJson(input.manifest))) fail('immutable_component_release_conflict');
  const sameVersion=current&&item.version===current.version;
  const immutable=Boolean(payload||routing||components);
  if(sameVersion&&current.status!=='draft'&&!immutable) fail('new_release_version_required');
  if(sameVersion&&(immutable||current.status!=='draft')&&ITEM_FIELDS.some(field=>item[field]!==current[field])) fail('immutable_item_version_conflict');
  if(options.mode==='stage'&&sameVersion&&current.status==='live'&&!immutable) fail('cannot_stage_live_version');
  await storePayload(env,input,report);
  await storeReviews(env,reviews,report);
  await storeInput(env,input,report);
  report=await prepareRelease(env,input,options);
  if(!report.source_ready||(options.mode==='activate'&&report.publication.eligibility!=='eligible')) fail('release_publication_blocked',{report});
  const statements=[];
  if(current) statements.push(guard(db,`EXISTS(SELECT 1 FROM items WHERE ${[...ITEM_FIELDS,'status','updated_at'].map(field=>`${field} IS ?`).join(' AND ')})`,[...ITEM_FIELDS,'status','updated_at'].map(field=>current[field])));
  else statements.push(guard(db,'NOT EXISTS(SELECT 1 FROM items WHERE sku=?)',[item.sku]));
  for(const [table,row] of [['payload_objects',payload],['product_routing_manifests',routing],['component_releases',components]]) {
    const fields=table==='payload_objects'?['id','r2_bucket','r2_key','content_hash','size_bytes','mime_type']:['manifest_json','manifest_hash'];
    statements.push(guard(db,`${row?'':'NOT '}EXISTS(SELECT 1 FROM ${table} WHERE sku=? AND version=?${row?fields.map(field=>` AND ${field} IS ?`).join(''):''})`,[item.sku,item.version,...(row?fields.map(field=>row[field]):[])]));
  }
  const timestamp=new Date().toISOString();
  const status=options.mode==='activate'?'live':'draft';
  if(!current) statements.push(db.prepare(`INSERT INTO items (${ITEM_FIELDS.join(',')},status,updated_at) VALUES (${ITEM_FIELDS.map(()=>'?').join(',')},?,?)`).bind(...ITEM_FIELDS.map(field=>item[field]),status,timestamp));
  else if(options.mode==='activate'||(sameVersion&&current.status==='draft'&&!immutable)) statements.push(db.prepare(`UPDATE items SET ${ITEM_FIELDS.filter(field=>field!=='sku').map(field=>`${field}=?`).join(',')},status=?,updated_at=? WHERE sku=?`).bind(...ITEM_FIELDS.filter(field=>field!=='sku').map(field=>item[field]),status,timestamp,item.sku));
  if(!payload) statements.push(db.prepare('INSERT INTO payload_objects(id,sku,r2_bucket,r2_key,content_hash,size_bytes,mime_type,version) VALUES(?,?,?,?,?,?,?,?)').bind(`release_${crypto.randomUUID()}`,item.sku,report.payload.r2_bucket,report.payload.r2_key,report.payload.content_hash,report.payload.size_bytes,report.payload.mime_type,item.version));
  if(!routing) statements.push(db.prepare('INSERT INTO product_routing_manifests(sku,version,manifest_json,manifest_hash,reviewed_by,created_at) VALUES(?,?,?,?,?,?)').bind(item.sku,item.version,canonicalJson(input.routing_manifest),report.routing_hash,routingReview.reviewed_by,timestamp));
  if(!components) statements.push(db.prepare('INSERT INTO component_releases(sku,version,manifest_json,manifest_hash) VALUES(?,?,?,?)').bind(item.sku,item.version,canonicalJson(input.manifest),report.manifest_hash));
  try {await db.batch(statements);} catch(error) {throw new CommerceError('release_write_conflict',409,{cause:error.message});}
  return {...report,status:options.mode==='activate'?'active':'staged',catalog_activated:options.mode==='activate'};
}
