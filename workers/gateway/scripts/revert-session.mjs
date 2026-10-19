const EXPECTED_ROUTE_HASH="73e6a3b8e6f17536cec20bc5d660de056b73a9a2af17de2fdd1c57aab9c9c68e";
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
async function api(path,body){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(!response.ok||!data.success)throw Error('rollback_api_failed:'+response.status);return data.result;
}
const q=async sql=>(await api('/d1/database/db6412e2-4c9d-4b82-a93e-3b9f3708245d/query',{sql,params:[]}))[0].results;
const deployment=await api('/workers/scripts/secondwind-gateway/deployments');
if(deployment.deployments?.[0]?.versions?.[0]?.version_id!=='f25ead1b-a5fe-461d-88d2-b5d8cca91dcd')throw Error('worker_changed_stop_rollback');
const tables=['selection_validations','component_acceptances','component_selections','component_trials','component_releases','product_routing_manifests'];
const existing=await q("SELECT name FROM sqlite_master WHERE type='table'");
if(!tables.every(t=>existing.some(r=>r.name===t)))throw Error('schema_changed_stop_rollback');
for(const table of tables.filter(t=>t!=='product_routing_manifests')){
 if((await q('SELECT COUNT(*) AS n FROM '+table))[0].n!==0)throw Error('nonempty_session_table_stop:'+table);
}
const routes=await q('SELECT sku,version,manifest_hash,manifest_json FROM product_routing_manifests');
if(routes.length!==1||routes[0].sku!=='SW-PT-0006'||routes[0].version!==1||routes[0].manifest_hash!==EXPECTED_ROUTE_HASH)throw Error('routing_changed_stop_rollback');
if(createHash('sha256').update(routes[0].manifest_json).digest('hex')!==EXPECTED_ROUTE_HASH)throw Error('routing_bytes_changed_stop_rollback');
const eventCondition="event_type IN ('trial.started','trial.completed','trial.failed','scope.selected','scope.tested','scope.accepted')";
if((await q('SELECT COUNT(*) AS n FROM business_event_outbox WHERE '+eventCondition))[0].n!==0)throw Error('trial_events_exist_stop_rollback');
const catalogBefore=await q('SELECT * FROM items ORDER BY sku');
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const guard=tables.filter(t=>t!=='product_routing_manifests').map(t=>'(SELECT COUNT(*) FROM '+t+')=0').join(' AND ');
const sql="CREATE TABLE session_rollback_guard_20261019(ok INTEGER CHECK(ok=1));\n"+
"INSERT INTO session_rollback_guard_20261019 SELECT CASE WHEN "+guard+
" AND (SELECT COUNT(*) FROM product_routing_manifests)=1 AND EXISTS (SELECT 1 FROM product_routing_manifests WHERE sku='SW-PT-0006' AND version=1 AND manifest_hash='"+EXPECTED_ROUTE_HASH+"')"+
" AND (SELECT COUNT(*) FROM business_event_outbox WHERE "+eventCondition+")=0 THEN 1 ELSE 0 END;\n"+
"DROP TRIGGER component_scope_accepted;\n"+tables.map(t=>'DROP TABLE '+t+';').join('\n')+
"\nDROP TABLE session_rollback_guard_20261019;";
await writeFile('/tmp/secondwind-session-rollback.sql',sql);
try{execFileSync('./node_modules/.bin/wrangler',['d1','execute','second-wind-catalog','--remote','--file=/tmp/secondwind-session-rollback.sql'],{stdio:'pipe',maxBuffer:2000000});}catch{throw Error('rollback_transaction_failed');}
const after=await q("SELECT name FROM sqlite_master WHERE type IN ('table','trigger')");
if(after.some(r=>tables.includes(r.name)||r.name==='component_scope_accepted'||r.name==='session_rollback_guard_20261019'))throw Error('rollback_schema_verification_failed');
if(digest(await q('SELECT * FROM items ORDER BY sku'))!==digest(catalogBefore))throw Error('catalog_changed_during_rollback');
const health=await fetch('https://secondwindai.com/health');
if(health.status!==200)throw Error('post_rollback_health_failed');
console.log(JSON.stringify({status:'reverted',removed_empty_tables:5,removed_routing_tables:1,removed_session_routing_rows:1,catalog_unchanged:true,worker_version:'f25ead1b-a5fe-461d-88d2-b5d8cca91dcd',health:health.status}));
