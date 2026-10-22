import {readFile,writeFile} from 'node:fs/promises';
import {readInventoryKind} from '../src/clef.js';
import {canonicalJson,sha256} from '../src/contracts.js';

// Operator-side review, not a public endpoint. Never reads payment or buyer data.
const [input,output]=process.argv.slice(2);
if(!input || !output) throw new Error('Usage: node scripts/classify-inventory.mjs inventory.json readings.json');
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account || !token) throw new Error('Cloudflare account ID and API token with Workers AI access are required');
const items=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(items)) throw new Error('Expected inventory array');
const snapshot_ref='sha256:'+await sha256(canonicalJson(items));
const ai={run:async(model,body)=>{
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 if(!response.ok) throw new Error(`clef_http_${response.status}`);
 const envelope=await response.json();
 if(envelope.success!==true) throw new Error('clef_provider_error');
 return envelope.result;
}};
const readings=[];
for(const item of items) {
 const reading=await readInventoryKind(ai,item,snapshot_ref);
 readings.push({sku:item.sku,version:item.version,...reading});
 // Checkpoint each completed reading. No inventory writes or publication side effects.
 await writeFile(output,JSON.stringify({snapshot_ref,readings},null,2)+'\n',{mode:0o600});
}
console.log(JSON.stringify({snapshot_ref,completed:readings.length}));
