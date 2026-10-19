/** Operator-only metadata preparation. Never changes product content or status. */
import {readFile} from 'node:fs/promises';
import {canonicalJson,sha256} from '../src/contracts.js';
import {validateRoutingManifest} from '../src/routing.js';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token) throw Error('cloudflare_credentials_unavailable');
async function query(sql,params=[]) {
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/db6412e2-4c9d-4b82-a93e-3b9f3708245d/query`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
 const data=await r.json();if(!r.ok||!data.success) throw Error('routing_database_operation_failed');return data.result[0].results;
}
if(!process.argv.includes('--check')) {
 const evidence=JSON.parse(await readFile(new URL('../review/live-routing-2026-10-19.json',import.meta.url),'utf8'));
 const m=evidence.manifest;
 if(validateRoutingManifest(m).length) throw Error('routing_manifest_invalid');
 const [item]=await query('SELECT sku,slug,service,status,version,guidance FROM items WHERE sku=?',[m.sku]);
 if(!item||item.status!=='live'||item.version!==m.version||item.slug!==m.slug||item.service!==m.service
  ||evidence.source_hash_scope!=='guidance-utf8'||await sha256(item.guidance)!==evidence.source_hash) throw Error('reviewed_routing_source_changed');
 const hash=await sha256(canonicalJson(m));
 const [prior]=await query('SELECT manifest_hash FROM product_routing_manifests WHERE sku=? AND version=?',[m.sku,m.version]);
 if(prior&&prior.manifest_hash!==hash) throw Error('reviewed_routing_conflict');
 if(!prior) await query('INSERT INTO product_routing_manifests(sku,version,manifest_json,manifest_hash,reviewed_by,created_at) VALUES (?,?,?,?,?,?)',
  [m.sku,m.version,canonicalJson(m),hash,'source-review:'+process.env.GITHUB_SHA,new Date().toISOString()]);
}
const live=await query("SELECT i.sku,i.slug,i.service,i.version,r.manifest_json,r.manifest_hash FROM items i LEFT JOIN product_routing_manifests r ON r.sku=i.sku AND r.version=i.version WHERE i.status='live'");
let missing=0;
for(const row of live) {
 if(!row.manifest_json){missing++;continue;}
 const m=JSON.parse(row.manifest_json);
 if(validateRoutingManifest(m).length||m.sku!==row.sku||m.slug!==row.slug||m.version!==row.version||m.service!==row.service
  ||await sha256(canonicalJson(m))!==row.manifest_hash) throw Error('live_routing_invalid');
}
if(missing) throw Error(`live_routing_missing:count=${missing}`);
console.log(JSON.stringify({live_products:live.length,valid_routing_manifests:live.length,status:'verified',publication_changes:0}));
