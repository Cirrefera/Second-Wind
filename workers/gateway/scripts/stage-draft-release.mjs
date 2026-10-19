/** Operator-only preparation run by the repository workflow after acceptance.
 * This stages one existing draft. It neither publishes nor deploys the Worker.
 */
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from '../src/contracts.js';
import {prepareRelease} from '../../../products/agent-state-dynamodb-manifest/scripts/package.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token) throw Error('cloudflare_credentials_unavailable');
const base=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
const auth={Authorization:`Bearer ${token}`};
async function apiFailure(label,response) {
 // Report only status and numeric provider codes; response bodies can contain private data.
 let codes=[];
 try {codes=(await response.json()).errors?.map(e=>e.code).filter(c=>Number.isInteger(c))||[];}catch{}
 return Error(`${label}:status=${response.status}:codes=${codes.join(',')||'none'}`);
}
async function query(sql,params=[]) {
 const r=await fetch(base+'/d1/database/db6412e2-4c9d-4b82-a93e-3b9f3708245d/query',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
 const data=await r.json();if(!r.ok||!data.success) throw Error('draft_database_operation_failed');
 return data.result[0];
}
const {release,routing,payload}=await prepareRelease();
if(release.sku!=='AWS-0568'||release.version!==2||release.pricing.max_amount_atomic!=='500000') throw Error('unexpected_release');
const row=(await query('SELECT sku,status,version FROM items WHERE sku=?',[release.sku])).results[0];
if(!row||row.status!=='draft'||![1,2].includes(row.version)) throw Error('draft_state_changed');
for(const file of ['0003_component_trials.sql','0004_routing_manifests.sql','0005_selected_sandbox.sql']) {
 // Only the already-tested additive schema; never the historical root migration.
 try {execFileSync('./node_modules/.bin/wrangler',['d1','execute','second-wind-catalog','--remote',`--file=migrations/${file}`],{stdio:'pipe',maxBuffer:2000000});}
 catch{throw Error('draft_schema_preparation_failed');}
}
const objectPath='/r2/buckets/secondwind-payloads/objects/'+release.storage.r2_key;
const before=await fetch(base+objectPath,{headers:auth,signal:AbortSignal.timeout(20000)});
if(before.ok) {
 if(await sha256(await before.arrayBuffer())!==release.storage.content_hash) throw Error('immutable_object_conflict');
}else if(before.status===404){
 const put=await fetch(base+objectPath,{method:'PUT',headers:{...auth,'Content-Type':'application/json','If-None-Match':'*'},body:payload,signal:AbortSignal.timeout(30000)});
 if(!put.ok&&put.status!==412) throw await apiFailure('immutable_object_upload_failed',put);
}else throw await apiFailure('immutable_object_read_failed',before);
const verify=await fetch(base+objectPath,{headers:auth,signal:AbortSignal.timeout(20000)});
if(!verify.ok||await sha256(await verify.arrayBuffer())!==release.storage.content_hash) throw Error('immutable_object_verification_failed');
const manifestHash=await sha256(canonicalJson(release)),routingHash=await sha256(canonicalJson(routing));
for(const [table,hash] of [['component_releases',manifestHash],['product_routing_manifests',routingHash]]){
 const prior=(await query(`SELECT manifest_hash FROM ${table} WHERE sku=? AND version=?`,[release.sku,release.version])).results[0];
 if(prior&&prior.manifest_hash!==hash) throw Error('draft_release_conflict');
}
const schema=await readFile(new URL('../../../products/agent-state-dynamodb-manifest/config.schema.json',import.meta.url),'utf8');
const summary='Prepare DynamoDB API requests for an agent/session table with optional status queries, expiry, point-in-time recovery and change streams. Includes readiness sequencing and verification requests. Makes no AWS calls.';
await query("UPDATE items SET name=?,summary=?,input_schema=?,input_example=?,mime_type='application/json',version=2,updated_at=? WHERE sku=? AND status='draft' AND version IN (1,2)",
 ['DynamoDB agent state planner',summary,schema,canonicalJson({table_name:'agent-state-example',features:['table'],language:'javascript',runtime:'nodejs22'}),new Date().toISOString(),release.sku]);
await query('INSERT INTO component_releases(sku,version,manifest_json,manifest_hash) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',[release.sku,release.version,canonicalJson(release),manifestHash]);
await query('INSERT INTO product_routing_manifests(sku,version,manifest_json,manifest_hash,reviewed_by,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING',[release.sku,release.version,canonicalJson(routing),routingHash,'source-review:'+process.env.GITHUB_SHA,new Date().toISOString()]);
await query('INSERT INTO payload_objects(id,sku,r2_bucket,r2_key,content_hash,size_bytes,mime_type,version) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
 ['payload:AWS-0568:2',release.sku,'secondwind-payloads',release.storage.r2_key,release.storage.content_hash,release.storage.size_bytes,'application/json',release.version]);
const stored=(await query('SELECT i.status,i.version,p.content_hash,p.size_bytes FROM items i JOIN payload_objects p ON p.sku=i.sku AND p.version=i.version WHERE i.sku=?',[release.sku])).results[0];
if(stored?.status!=='draft'||stored.version!==2||stored.content_hash!==release.storage.content_hash||stored.size_bytes!==release.storage.size_bytes) throw Error('draft_reference_verification_failed');
console.log(JSON.stringify({sku:release.sku,status:'draft',version:2,manifest_hash:manifestHash,payload_hash:stored.content_hash,size_bytes:stored.size_bytes,routing_hash:routingHash,published:false,worker_deployed:false}));
