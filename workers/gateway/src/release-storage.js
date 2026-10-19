import {canonicalJson,sha256,CommerceError} from './contracts.js';
const maxBytes=750000;
const fail=code=>{throw new CommerceError(code,503);};

/** Content-addressed immutable write, followed by an independent read/hash check.
 * No storage binding is passed into patron code. R2 is not commerce authority.
 */
export async function storePackage(env,files) {
  if(!env.PAYLOADS) fail('payload_store_not_configured');
  const content=canonicalJson(files),size_bytes=new TextEncoder().encode(content).byteLength;
  if(size_bytes>maxBytes) fail('product_package_too_large');
  const content_hash=await sha256(content),r2_key=`releases/sha256/${content_hash}.json`;
  await env.PAYLOADS.put(r2_key,content,{onlyIf:new Headers({'If-None-Match':'*'}),
    sha256:content_hash,httpMetadata:{contentType:'application/json'}});
  const payload={via:'r2',r2_bucket:'secondwind-payloads',r2_key,content_hash,size_bytes,
    mime_type:'application/json',hash_scope:'selected-files-canonical-json'};
  await readStoredPackage(env,payload);
  return payload;
}
export async function readStoredPackage(env,payload) {
  if(payload.r2_bucket!=='secondwind-payloads' || !/^[a-f0-9]{64}$/.test(payload.content_hash||'')
    || payload.r2_key!==`releases/sha256/${payload.content_hash}.json`
    || !Number.isSafeInteger(payload.size_bytes)||payload.size_bytes<1||payload.size_bytes>maxBytes) fail('invalid_release_storage');
  if(!env.PAYLOADS) fail('payload_store_not_configured');
  const object=await env.PAYLOADS.get(payload.r2_key);
  if(!object) fail('payload_missing');
  if(object.size!==payload.size_bytes) fail('content_hash_mismatch');
  const content=await object.text();
  if(new TextEncoder().encode(content).byteLength!==payload.size_bytes || await sha256(content)!==payload.content_hash) fail('content_hash_mismatch');
  const files=JSON.parse(content);
  if(!Array.isArray(files)||files.some(f=>!f||typeof f.path!=='string'||typeof f.content!=='string')
    || new Set(files.map(f=>f.path)).size!==files.length) fail('invalid_release_package');
  return files;
}
