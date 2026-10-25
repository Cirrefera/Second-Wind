import {CommerceError,sha256} from './contracts.js';
import {isSandboxEligible} from './sandbox-policy.js';

export const PRIVATE_RUNTIME_ADAPTER='js-product-runtime-v1';
const TYPES=new Set(['javascript','wasm','json','text','data']);
const MAX_MODULES=64,MAX_MODULE_BYTES=32*1024*1024,MAX_RUNTIME_BYTES=48*1024*1024;
const fail=code=>{throw new CommerceError(code,503);};

/** Only an immutable, reviewed release can name executable assets. Caller
 * configuration never supplies R2 keys, module source or loader flags. */
export function privateRuntimeDescriptor(release) {
  const runtime=release?.private_runtime;
  if(!isSandboxEligible(release?.sku)||release?.preview_contract?.adapter!==PRIVATE_RUNTIME_ADAPTER
      ||runtime?.entrypoint!=='product/preview.mjs'||!Array.isArray(runtime.modules)
      ||!runtime.modules.length||runtime.modules.length>MAX_MODULES)fail('private_runtime_invalid');
  let total=0;const names=new Set();
  for(const asset of runtime.modules) {
    if(!asset||typeof asset.name!=='string'||asset.name.length>256||!asset.name.startsWith('product/')
        ||!asset.name.split('/').every(p=>/^[A-Za-z0-9_.-]+$/.test(p)&&p!=='.'&&p!=='..')
        ||names.has(asset.name)||!TYPES.has(asset.type)||!/^[a-f0-9]{64}$/.test(asset.sha256)
        ||asset.r2_key!==`private-runtime/sha256/${asset.sha256}`
        ||!Number.isSafeInteger(asset.size_bytes)||asset.size_bytes<=0||asset.size_bytes>MAX_MODULE_BYTES)
      fail('private_runtime_invalid');
    names.add(asset.name);total+=asset.size_bytes;
  }
  if(total>MAX_RUNTIME_BYTES||!runtime.modules.some(x=>x.name===runtime.entrypoint&&x.type==='javascript'))
    fail('private_runtime_too_large');
  return runtime;
}

/** Verify availability and bytes before admission; read again at execution.
 * Sequential reads avoid retaining duplicate copies of the larger assets. */
export async function loadPrivateRuntime(env,release,{verifyOnly=false}={}) {
  const runtime=privateRuntimeDescriptor(release),modules={};
  if(!env.PAYLOADS)fail('private_runtime_store_unavailable');
  for(const asset of runtime.modules) {
    const object=await env.PAYLOADS.get(asset.r2_key);
    if(!object||object.size!==asset.size_bytes)fail('private_runtime_asset_unavailable');
    const bytes=await object.arrayBuffer();
    if(bytes.byteLength!==asset.size_bytes||await sha256(bytes)!==asset.sha256)fail('private_runtime_hash_mismatch');
    if(verifyOnly)continue;
    if(asset.type==='wasm'||asset.type==='data')modules[asset.name]={[asset.type]:bytes};
    else {
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      modules[asset.name]=asset.type==='json'?{json:JSON.parse(text)}:
        asset.type==='text'?{text}:{js:text};
    }
  }
  return {modules};
}

export async function stagePrivateRuntime(env,release,assets) {
  const runtime=privateRuntimeDescriptor(release);
  for(const asset of runtime.modules) {
    const bytes=assets.get(asset.sha256);
    if(!bytes||bytes.byteLength!==asset.size_bytes||await sha256(bytes)!==asset.sha256)
      fail('private_runtime_build_mismatch');
    const existing=await env.PAYLOADS.head(asset.r2_key);
    if(!existing)await env.PAYLOADS.put(asset.r2_key,bytes,{onlyIf:{etagDoesNotMatch:'*'},
      customMetadata:{sha256:asset.sha256},httpMetadata:{contentType:'application/octet-stream'}});
  }
  await loadPrivateRuntime(env,release,{verifyOnly:true});
}
