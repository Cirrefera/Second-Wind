/** Read-only production evidence. Never logs raw responses, secrets or wallet values. */
import {writeFile,mkdir} from 'node:fs/promises';
import {newHttpBatchRpcSession} from 'capnweb';
const origin='https://secondwindai.com';
const report={observed_at:new Date().toISOString(),source_commit:process.env.GITHUB_SHA||null,public:{},cloudflare:{},limitations:[]};
async function get(path){const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000)});return {status:r.status,body:await r.json()};}
for(const path of ['/health','/api/proof','/api/tools','/openapi.json','/.well-known/x402','/v2/x402/discovery/resources']) {
 try {
  const {status,body}=await get(path);
  report.public[path]={status};
  if(path==='/health') report.public[path].deployment=body.deployment;
  if(path==='/api/proof') report.public[path]={status,state:body.status,tools_live:body.tools_live,dependencies:body.dependencies,
    recipient_configured:body.payment?.payTo_configured,recipient_verified:body.payment?.payment_recipient_verified,
    facilitator_configured:body.payment?.facilitator_configured};
  if(path==='/api/tools') report.public[path].products=(body.tools||[]).map(p=>({sku:p.sku,version:p.version,kind:p.kind,price_usdc_micros:p.price_usdc_micros,hash:p.content_hash,hash_scope:p.content_hash_scope,purchase_mode:p.purchase_mode||'fixed-price'}));
 }catch{report.public[path]={status:'unavailable'};}
}
try {
 const r=await fetch(origin+'/llms.txt',{signal:AbortSignal.timeout(20000)});const body=await r.text();
 report.public['/llms.txt']={status:r.status,approved_price_language:body.includes('Pay only for what you need. Prices shown are for the full product.')};
 const product=report.public['/api/tools'].products?.[0];
 if(product){const session=newHttpBatchRpcSession(origin+'/capnp');
  const info=await session.select(product.sku).info();
  report.public.capnweb={status:'verified',sku:info.sku,version:info.version,hash:info.content_hash};}
}catch{report.public.capnweb={status:'unverified'};}
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(token&&account) {
 const base=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
 async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  const data=await r.json();if(!r.ok||!data.success) throw Error('cloudflare_read_unavailable');return data.result;}
 try {
  const settings=await api('/workers/scripts/secondwind-gateway/settings');
  report.cloudflare.bindings=(settings.bindings||[]).map(b=>({name:b.name,type:b.type}));
  report.cloudflare.compatibility_date=settings.compatibility_date;
  const result=await api('/workers/scripts/secondwind-gateway/deployments');
  report.cloudflare.deployments=(result.deployments||[]).slice(0,2).map(d=>({id:d.id,created_on:d.created_on,versions:d.versions}));
 }catch{report.cloudflare.worker='unavailable';}
 const query=async sql=>{
  if(!/^SELECT\s/i.test(sql)||sql.includes(';')) throw Error('read_only_query_required');
  const result=await api('/d1/database/db6412e2-4c9d-4b82-a93e-3b9f3708245d/query',{sql,params:[]});return result[0]?.results||[];};
 try {
  report.cloudflare.inventory=await query('SELECT status,kind,COUNT(*) AS count FROM items GROUP BY status,kind');
  const tables=await query("SELECT name FROM sqlite_master WHERE type='table'");const names=new Set(tables.map(x=>x.name));
  for(const table of ['payload_objects','component_releases','product_routing_manifests','selection_validations','release_approvals'])
   report.cloudflare[table]=names.has(table)?await query(`SELECT COUNT(*) AS count FROM ${table}`):'not_deployed';
  if(names.has('business_event_outbox')) report.cloudflare.outbox=await query("SELECT event_type,COUNT(*) AS count,SUM(CASE WHEN sent_at IS NULL THEN 1 ELSE 0 END) AS pending,MAX(attempts) AS max_attempts FROM business_event_outbox GROUP BY event_type");
 }catch{report.cloudflare.database='unavailable';}
}else report.cloudflare.status='credentials_not_available';
report.limitations=['Read-only check: no funds, settlements, catalog promotions or infrastructure mutations.',
 'R2 object counts and hashes, Basin/Iceberg arrival, live Clef and funded commerce require separate evidence.'];
await mkdir('review-output',{recursive:true});
await writeFile('review-output/production-baseline.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.public['/health'].status!==200 || report.public['/api/tools'].status!==200) process.exitCode=1;
