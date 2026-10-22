import {canonicalJson,sha256} from './contracts.js';

export const JEV_MODEL='jev-1.14.0';
export const JEV_ENDPOINT='https://api.typesafe.ai/v1/systemone';
const MAX_REQUEST_BYTES=48000,MAX_RESPONSE_BYTES=512000;
const pinnedModel=value=>typeof value==='string'&&/^jev-\d+\.\d+\.\d+$/.test(value);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
class JevError extends Error {}

function requestIds(headers,apiKey) {
  const ids={};
  for(const name of ['x-request-id','request-id','x-typesafe-request-id','cf-ray']) {
    const value=headers.get(name);
    if(typeof value==='string'&&/^[A-Za-z0-9_.:/+=-]{1,200}$/.test(value)&&!value.includes(apiKey)) ids[name]=value;
  }
  return ids;
}

async function responseBytes(response,signal) {
  const length=response.headers.get('content-length');
  if(length!==null&&/^\d+$/.test(length)&&Number(length)>MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(()=>{});
    throw new JevError('typesafe_response_too_large');
  }
  const reader=response.body?.getReader();
  if(!reader) throw new JevError('typesafe_invalid_response');
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  const chunks=[];
  let size=0,complete=false;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.byteLength;
      if(size>MAX_RESPONSE_BYTES) throw new JevError('typesafe_response_too_large');
      chunks.push(value);
    }
    complete=true;
    const bytes=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return bytes;
  } finally {
    signal.removeEventListener('abort',cancel);
    if(!complete) cancel();
    reader.releaseLock();
  }
}

/** Native TypeSafe transport for the shared typed reader. No retries, redirects,
 * aliases, or production configuration. Metadata excludes bodies and secrets;
 * onResponse is observation-only and is never awaited. */
export function createJevAi({apiKey,model=JEV_MODEL,fetchImpl=fetch,timeout_ms=5000,onResponse}={}) {
  if(typeof apiKey!=='string'||!apiKey.length||/[^\x21-\x7e]/.test(apiKey)) throw new JevError('typesafe_api_key_required');
  if(!pinnedModel(model)) throw new JevError('typesafe_model_must_be_pinned');
  if(typeof fetchImpl!=='function') throw new JevError('typesafe_fetch_required');
  if(!Number.isInteger(timeout_ms)||timeout_ms<1||timeout_ms>30000) throw new JevError('invalid_typesafe_timeout');
  if(onResponse!==undefined&&typeof onResponse!=='function') throw new JevError('invalid_typesafe_observer');
  return {provider:'typesafe-live',model,run:async(requestedModel,body)=>{
    if(requestedModel!==model||!record(body)||body.model!==model
        ||Object.keys(body).some(key=>!['model','state','questions'].includes(key))
        ||!(typeof body.state==='string'||Array.isArray(body.state)||record(body.state))
        ||!record(body.questions)||!Object.keys(body.questions).length||Object.keys(body.questions).length>64)
      throw new JevError('typesafe_invalid_request');
    let encoded;
    try {encoded=canonicalJson(body);JSON.parse(encoded);} catch {throw new JevError('typesafe_invalid_request');}
    if(new TextEncoder().encode(encoded).byteLength>MAX_REQUEST_BYTES) throw new JevError('typesafe_context_too_large');
    const metadata={provider:'typesafe-live',endpoint:JEV_ENDPOINT,model,http_status:null,ok:false,
      request_hash:await sha256(encoded),request_ids:{}};
    const controller=new AbortController(),started=Date.now();
    let timer,timedOut=false;
    try {
      return await Promise.race([
        (async()=>{
          const response=await fetchImpl(JEV_ENDPOINT,{method:'POST',redirect:'error',credentials:'omit',
            headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:encoded,signal:controller.signal});
          if(!response||!Number.isInteger(response.status)||response.status<100||response.status>599
              ||typeof response.headers?.get!=='function') throw new JevError('typesafe_invalid_response');
          metadata.http_status=response.status;
          metadata.request_ids=requestIds(response.headers,apiKey);
          if(response.redirected||response.status>=300&&response.status<400) throw new JevError('typesafe_redirect_rejected');
          if(response.status<200||response.status>=300) throw new JevError(`typesafe_http_${response.status}`);
          const bytes=await responseBytes(response,controller.signal);
          metadata.response_hash=await sha256(bytes);
          let result;
          try {result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
          catch {throw new JevError('typesafe_invalid_json');}
          if(pinnedModel(result?.model)&&!result.model.includes(apiKey)) metadata.response_model=result.model;
          if(!record(result)||result.model!==model||!record(result.answers)||!record(result.usage)
              ||['input_tokens','output_tokens'].some(key=>!Number.isSafeInteger(result.usage[key])||result.usage[key]<0))
            throw new JevError('typesafe_invalid_response');
          metadata.usage={input_tokens:result.usage.input_tokens,output_tokens:result.usage.output_tokens};
          metadata.ok=true;
          return result;
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{
          timedOut=true;controller.abort();reject(new JevError('typesafe_timeout'));
        },timeout_ms);}),
      ]);
    } catch(error) {
      metadata.ok=false;
      metadata.error=timedOut?'typesafe_timeout':error instanceof JevError?error.message:'typesafe_network_error';
      throw new JevError(metadata.error);
    } finally {
      clearTimeout(timer);
      if(!metadata.ok) controller.abort();
      if(onResponse) {
        // A broken observer cannot turn a valid provider response into a failure.
        try {void Promise.resolve(onResponse({...metadata,latency_ms:Math.max(0,Date.now()-started)})).catch(()=>{});}
        catch {}
      }
    }
  }};
}
