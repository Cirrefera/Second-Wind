import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {newHttpBatchRpcSession} from 'capnweb';
import {prepareRelease} from '../../../products/agent-state-dynamodb-manifest/scripts/package.mjs';
import {createFixtureDb,insertItem} from './helpers/d1.mjs';
import {canonicalJson,sha256} from '../src/contracts.js';
const {release,routing,payload}=await prepareRelease();
const entry=fileURLToPath(new URL('../src/index.js',import.meta.url));
const output=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['cloudflare:*','node:*']});
const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],
 workerLoaders:{LOADER:{}},d1Databases:{SW_DB:'product-sandbox'},r2Buckets:['PAYLOADS','DELIVERIES'],bindings:{GATEWAY_SECRET:'must-not-cross'}}));
const schema=await readFile(new URL('../../../products/agent-state-dynamodb-manifest/config.schema.json',import.meta.url),'utf8');
const source=createFixtureDb();
const item=insertItem(source,{sku:release.sku,slug:release.slug,version:release.version,price_usd:0.5,kind:'artifact',service:'dynamodb',input_schema:schema});
const code=`const {prepare}=await import('./product/plan.mjs'); const config=await codemode.configuration();
 const plan=prepare(config); const selected=new Set(config.features);
 if(Boolean(plan.steps[0].input.GlobalSecondaryIndexes)!==selected.has('status-index')) throw Error('index mismatch');
 if(Boolean(plan.steps[0].input.StreamSpecification)!==selected.has('change-stream')) throw Error('stream mismatch');
 if(plan.steps.some(s=>s.operation==='UpdateTimeToLive')!==selected.has('expiry')) throw Error('expiry mismatch');
 if(plan.steps.some(s=>s.operation==='UpdateContinuousBackups')!==selected.has('recovery')) throw Error('recovery mismatch');
 const {env}=await import('cloudflare:workers');
 if(Object.keys(env).length) throw Error('unexpected bindings');
 return {features:config.features,operations:plan.steps.map(s=>s.operation),secrets:Object.keys(env)};`;
try {
 const db=await runtime.getD1Database('SW_DB');
 for(const {sql} of source.sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all()) await db.prepare(sql).run();
 source.close();
 const keys=Object.keys(item);await db.prepare(`INSERT INTO items (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(item)).run();
 await db.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').bind(item.sku,item.version,canonicalJson(release),await sha256(canonicalJson(release))).run();
 await db.prepare('INSERT INTO product_routing_manifests VALUES (?,?,?,?,?,?)').bind(item.sku,item.version,canonicalJson(routing),await sha256(canonicalJson(routing)),'local-acceptance',new Date().toISOString()).run();
 const bucket=await runtime.getR2Bucket('PAYLOADS');await bucket.put(release.storage.r2_key,payload);
 const config={table_name:'agent-state-test',features:['table',...release.components.slice(1).map(c=>c.id)],language:'javascript',runtime:'nodejs22'};
 const realFetch=globalThis.fetch;let trips=0;
 globalThis.fetch=async(url,init)=>{trips++;return runtime.dispatchFetch(url,init);};
 let response;
 try {
  const client=newHttpBatchRpcSession('https://secondwindai.com/capnp');
  response=await client.searchIntent({alias:'dynamodb-agent-state',target_language:'javascript',target_runtime:'nodejs22'}).candidates.map(candidate=>{
    const trial=candidate.product.configure(config).trial({code,language:'javascript'});
    return {info:trial.info(),recovery:trial.recovery()};
  });
  assert.equal(trips,1,'search, configure, trial and inspect use one HTTP request');
 }finally {globalThis.fetch=realFetch;}
 assert.equal(response.length,1);assert.equal(response[0].info.result.ok,true,JSON.stringify(response[0].info.result));
 assert.deepEqual(response[0].info.result.result.secrets,[]);
 const trial=response[0].recovery;
 const post=async(path,data)=>{
  const res=await runtime.dispatchFetch('https://secondwindai.com'+path,{method:'POST',headers:{'content-type':'application/json','X-Trial-Token':trial.trial_token},body:JSON.stringify(data)});
  const result=await res.json();assert.equal(res.status,200,JSON.stringify(result));return result;
 };
 const optional=release.components.slice(1).map(c=>c.id);
 for(let mask=0;mask<16;mask++) {
  const selection=['table',...optional.filter((_,i)=>mask&(1<<i))];
  const scope=await post(`/api/trials/${trial.trial_id}/selection`,{selection});
  const tested=await post(`/api/trials/${trial.trial_id}/selection/test`,{selection,scope_hash:scope.scope_hash,input:{code,language:'javascript'}});
  assert.equal(tested.result.ok,true,JSON.stringify(tested));
  assert.deepEqual(tested.result.result.features,[...selection].sort());
 }
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM commerce_quotes').first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM payments').first()).n,0);
 console.log('PASS: search → configure → trial → inspect in 1 HTTP request using actual Code Mode Dynamic Workers.');
 console.log('PASS: all 16 chosen product versions execute in fresh sandboxes with exact selected behavior and no secret bindings. No payment configuration, quotes or charges.');
}finally {await runtime.dispose();}
