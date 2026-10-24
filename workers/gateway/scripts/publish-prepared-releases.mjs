import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {getPlatformProxy} from 'wrangler';
import {canonicalJson,sha256} from '../src/contracts.js';
import {prepareRelease,publishRelease} from '../src/release-preparation.js';

// Operator entry point for a reviewed publication-record commit or manual dispatch.
// No HTTP route,
// payment credentials, review generation, schema changes or replacement publisher.
const root=new URL('../../../',import.meta.url);
let mode=process.env.RELEASE_MODE;
if(process.env.GITHUB_REPOSITORY!=='Cirrefera/Second-Wind'
  ||process.env.GITHUB_REF!=='refs/heads/main'
  ||!process.env.GITHUB_SHA||process.env.GITHUB_SHA!==process.env.EXPECTED_COMMIT
  ||!['stage','activate','record'].includes(mode)) throw new Error('explicit_main_commit_and_mode_required');
const read=async path=>readFile(new URL(path,root),'utf8');
const authorization=JSON.parse(await read('products/publication.json'));
if(authorization.schema_version!=='1'||!Array.isArray(authorization.releases)||!authorization.releases.length)
  throw new Error('invalid_publication_record');
if(mode==='record') mode=authorization.mode;
if(!['stage','activate'].includes(mode)) throw new Error('explicit_publication_mode_required');
if(await sha256(await read(authorization.review_report))!==authorization.review_report_sha256)
  throw new Error('review_report_changed');
const pending=[];
const mechanical=new Set(['pre_settlement_preparation_unverified','immutable_guidance_release_unverified']);
for(const release of authorization.releases) {
  const bytes=await read(release.input);
  if(await sha256(bytes)!==release.input_sha256) throw new Error('reviewed_input_changed');
  const input=JSON.parse(bytes);
  const reviewsBytes=await read(release.reviews);
  if(await sha256(reviewsBytes)!==release.reviews_sha256) throw new Error('review_records_changed');
  const reviews=JSON.parse(reviewsBytes);
  if(input.item.sku!==release.sku||input.item.version!==release.version
    ||canonicalJson([...(input.blockers||[])].sort())!==canonicalJson([...release.resolved_blockers].sort()))
    throw new Error('reviewed_release_identity_changed');
  // These exact editorial pending markers were resolved by the referenced review.
  // All structural, licensing, routing, byte and storage gates still run below.
  input.blockers=[];
  const report=await prepareRelease({},input,{reviews});
  if(!report.source_ready||report.publication.blockers.some(b=>!mechanical.has(b)))
    throw new Error('publication_review_incomplete:'+input.item.sku+':'+report.publication.blockers.join(','));
  pending.push({input,reviews});
}
let proxy;
const results=[];
try {
  proxy=await getPlatformProxy({configPath:fileURLToPath(new URL('../wrangler.release.toml',import.meta.url)),
    remoteBindings:true,persist:false,envFiles:[]});
  const env=proxy.env;
  // Read every current row before the first write. publishRelease repeats its
  // optimistic guards inside each D1 transaction after immutable R2 staging.
  for(const {input} of pending) {
    const row=await env.SW_DB.prepare('SELECT version,price_usd FROM items WHERE sku=?').bind(input.item.sku).first();
    if(!row||row.version>input.item.version||row.price_usd!==input.item.price_usd)
      throw new Error('catalog_release_preflight_failed:'+input.item.sku);
  }
  for(const {input,reviews} of pending) {
    const result=await publishRelease(env,input,{mode,reviews});
    results.push(result);
    console.log(JSON.stringify({sku:result.sku,version:result.version,status:result.status,
      payload_hash:result.payload.content_hash,manifest_hash:result.manifest_hash,routing_hash:result.routing_hash,
      payload_stored_verified:result.payload.stored_verified,input_stored_verified:result.input_object.stored_verified}));
  }
} finally {
  await writeFile('release-result.json',JSON.stringify({commit:process.env.GITHUB_SHA,mode,results},null,2)+'\n');
  await proxy?.dispose();
}
