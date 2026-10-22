/** Reproduce actual local source-readiness evidence without cloud access or review attestations. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../src/contracts.js';
import {prepareRelease} from '../src/release-preparation.js';
const root=new URL('./',import.meta.url),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const products=[];
for(const product of ['agent-state-dynamodb-manifest','lambda-powertools-idempotency']) {
 const url=new URL(`../../../products/${product}/release-input.json`,root);
 const bytes=await readFile(url),input=JSON.parse(bytes),report=await prepareRelease({},input);
 if(!report.source_ready||report.source_blockers.length||report.payload.stored_verified||report.input_object.stored_verified
   ||report.publication.eligibility!=='blocked'||report.review_objects.length) throw new Error('unattested_source_preparation_boundary_failed:'+product);
 const validationBytes=await readFile(new URL(`../../../products/${product}/validation.json`,root));
 const validation=JSON.parse(validationBytes);
 if(validation.result!=='passed') throw new Error('product_validation_missing:'+product);
 for(const file of input.files) {
  const actual=await readFile(new URL(`../../../products/${product}/${file.path}`,root));
  if(digest(actual)!==file.sha256||actual.length!==file.size_bytes||actual.toString('utf8')!==file.content) throw new Error('local_source_input_drift:'+product+':'+file.path);
 }
 for(const [path,hash] of Object.entries(validation.source_hashes))
  if(digest(await readFile(new URL(`../../../products/${product}/${path}`,root)))!==hash) throw new Error('stale_product_validation:'+product+':'+path);
 products.push({product,sku:input.item.sku,version:input.item.version,status:'draft',
  input_file_sha256:digest(bytes),canonical_input_sha256:digest(canonicalJson(input)),
  validation_file_sha256:digest(validationBytes),validation,preparation:report});
}
const inspectionBytes=await readFile(new URL('corpus-source-inspection.json',root)),inspection=JSON.parse(inspectionBytes);
const evidence={schema_version:'1',observed_date:'2026-10-19',
 scope:'Local actual-source preparation with exact inline payload bytes. No cloud credentials, store writes, publication approvals, price allocations, live inference, AWS calls or payment operations.',
 generator_sha256:digest(await readFile(new URL('verify-source-preparations.mjs',root))),
 preparation_source_sha256:digest(await readFile(new URL('../src/release-preparation.js',root))),
 source_snapshot_sha256:inspection.source_snapshot_sha256,source_inspection_sha256:digest(inspectionBytes),source_inspection_counts:inspection.counts,products};
await writeFile(new URL('prepared-product-evidence.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(products.map(({sku,version,preparation})=>({sku,version,source_ready:preparation.source_ready,payload_hash:preparation.payload.content_hash,publication:preparation.publication.eligibility}))));
