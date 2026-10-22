import {readFile,writeFile} from 'node:fs/promises';
import {validatePublication,canonicalService} from '../src/publication.js';
const [input,output]=process.argv.slice(2);
if(!input || !output) throw new Error('Usage: node scripts/audit-inventory.mjs inventory.json report.csv');
const items=JSON.parse(await readFile(input,'utf8'));
const rows=[];
for(const item of items){
 const r=await validatePublication(item,item.manifest,item.evidence);
 rows.push({...r,advertised_kind:item.kind,canonical_service:canonicalService(item.service),
  completion_state:r.eligibility==='eligible'?item.manifest.product_kind:'invalid-or-incomplete',
  promised_kind:item.manifest?.product_kind || (item.sku.startsWith('BUN-')?'bundle':item.kind==='artifact'?'artifact-product':item.kind==='guide'?'guidance-product':'requires-contract-review'),
  actual_fulfillment:item.invoke_kind==='resolve'?'inline guidance':'requires payload/execution inspection',
  guidance_bytes:Buffer.byteLength(item.guidance||''),blockers:r.blockers.join(';')});
}
const keys=Object.keys(rows[0]||{});
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
await writeFile(output,[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(csv).join(',')).join('\n')+'\n');
console.log(JSON.stringify({items:rows.length,eligible:rows.filter(x=>x.eligibility==='eligible').length,blocked:rows.filter(x=>x.eligibility==='blocked').length}));
