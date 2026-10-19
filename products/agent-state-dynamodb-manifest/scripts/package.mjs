import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=['plan.mjs','config.schema.json','README.md'];
const required_files=[];
for(const path of paths){const bytes=await readFile(new URL(path,root));required_files.push({path,sha256:hash(bytes),size_bytes:bytes.length});}
const evidence=JSON.parse(await readFile(new URL('validation.json',root),'utf8'));
if(evidence.result!=='passed') throw new Error('validation_not_passed');
for(const path of ['plan.mjs','config.schema.json','scripts/validate-aws.py']) if(evidence.source_hashes[path]!==hash(await readFile(new URL(path,root)))) throw new Error('stale_validation');
const canonical_manifest={schema_version:'1',sku:'AWS-0568',product_kind:'artifact-product',required_files};
const bytes=Buffer.from(JSON.stringify(canonical_manifest)+'\n');
await writeFile(new URL('files.manifest.json',root),bytes);
await writeFile(new URL('release-candidate.json',root),JSON.stringify({
 sku:'AWS-0568',status:'draft',release_ref:'sha256:'+hash(bytes),content_hash:hash(bytes),
 hash_scope:'exact UTF-8 files.manifest.json bytes including final newline',
 origin:'Second Wind',license:'Apache-2.0',
 original_contribution:'Configurable API plan with selected-feature isolation, explicit activation dependency and verification requests.',
 delivery_contract:{kind:'file-package',required_files:paths},
 language_policy:{mode:'configured',explicit_selection:false,adapters:['javascript']},
 publication_blockers:['component_price_allocation_pending','immutable_delivery_store_pending','trial_fulfillment_integration_pending','publication_review_pending','catalog_contract_and_provenance_review_pending','explicit_language_selection_integration_pending'],
 validation:{service_model:'passed',aws_deployment:'not_performed'},
},null,2)+'\n');
console.log(JSON.stringify({sku:'AWS-0568',release_hash:hash(bytes),files:required_files.length}));
