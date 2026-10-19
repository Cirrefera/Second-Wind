/** Prepare corrected guidance bytes; preserve historical live content verbatim. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../workers/gateway/src/contracts.js';
const root=new URL('../',import.meta.url),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const input=process.argv[2];
if(!input) throw new Error('Usage: node scripts/package.mjs held-reverified-inventory.json');
const held=JSON.parse(await readFile(input,'utf8')),snapshot=digest(canonicalJson(held));
const historicEvidence=JSON.parse(await readFile(new URL('../../workers/gateway/review/inventory-evidence-2026-10-19.json',root),'utf8'));
if(snapshot!==historicEvidence.snapshot_sha256) throw new Error('historical_snapshot_mismatch');
const original=held.find(item=>item.sku==='SW-PT-0006');
if(!original||original.status!=='live'||original.version!==1) throw new Error('historical_identity_mismatch');
const validation=JSON.parse(await readFile(new URL('validation.json',root),'utf8'));
if(validation.result!=='passed'||validation.tests!==7||validation.language!=='python') throw new Error('validation_not_passed');
for(const [path,hash] of Object.entries(validation.source_hashes)) if(digest(await readFile(new URL(path,root)))!==hash) throw new Error('stale_validation:'+path);
const upstream=JSON.parse(await readFile(new URL('upstream-source-inspection.json',root),'utf8'));
if(!/^[0-9a-f]{40}$/.test(upstream.revision)||upstream.files.length!==4) throw new Error('source_inspection_missing');
const example=await readFile(new URL('example.py',root),'utf8');
const template=await readFile(new URL('guidance.template.md',root),'utf8');
if(template.split('{{EXAMPLE}}').length!==2) throw new Error('example_placeholder_invalid');
const guidance=template.replace('{{EXAMPLE}}',example.trimEnd());
await writeFile(new URL('GUIDANCE.md',root),guidance);
await mkdir(new URL('history/',root),{recursive:true});
await writeFile(new URL('history/v1-guidance.txt',root),original.guidance);
await writeFile(new URL('history/v1-catalog-record.json',root),JSON.stringify(original,null,2)+'\n');
const content_hash=digest(guidance),release_ref='sha256:'+content_hash;
const item={...original,version:2,status:'draft',kind:'guide',name:'retries double charge customers',
 summary:'Python Lambda Powertools idempotency wiring with validated business keys, payload checks, replay behavior and an explicit external-payment failure boundary. Includes a tested Python example; no deployment or payment processor.',
 guidance,mime_type:'text/markdown; charset=utf-8',input_schema:'',license_spdx:'Apache-2.0',provenance:'original',
 source_repo:'',source_url:'https://secondwindai.com'};
const supported_boundary='Guidance and tested Python 3.12/Powertools 3.36.0 wiring for a single decoded JSON payment event per Lambda invocation and an existing DynamoDB persistence table. Requires a buyer-supplied payment function with durable downstream idempotency. Does not implement a payment processor, cross-service atomicity, authentication, SQS batch handling, AWS deployment or other language adapters.';
const routing={schema_version:'1',product_id:item.sku,sku:item.sku,slug:item.slug,version:2,release_ref,service:'lambda',product_kind:'guidance-product',
 route_summary:'Configure Python Lambda Powertools DynamoDB idempotency to deduplicate completed retries, reject changed payment payloads and reason about uncertain external side effects.',supported_boundary,language_policy:'explicit',
 aliases:['lambda-idempotency-guidance'],tags:['lambda','powertools','idempotency','duplicate-payments','dynamodb'],taxonomy_ids:['aws.lambda','aws.powertools.idempotency'],
 problem_family_ids:['duplicate-side-effects'],operations:['configure-idempotency'],environments:['aws-lambda'],desired_outcomes:['deduplicate-retries'],input_kinds:['json-event'],
 failure_signatures:['duplicate-charge','duplicate-invocation'],languages:['python'],runtimes:['python3.12'],required_evidence:[],
 exclusions:['exactly-once-external-payment','payment-processing','typescript','javascript','java','dotnet','sqs-batch','event-authentication','aws-deployment']};
const manifest={schema_version:'1',sku:item.sku,slug:item.slug,version:2,product_kind:'guidance-product',service:'lambda',release_ref,content_hash,
 hash_scope:'guidance-utf8',mime_type:item.mime_type,origin:'Second Wind',license:'Apache-2.0',
 original_contribution:'Corrected operational decision guide and independently tested Python wiring with business-field validation, durable downstream-key handoff, payload mismatch behavior and explicit post-effect failure/expiry boundaries.',
 delivery_contract:{kind:'guidance',format:'UTF-8 Markdown including complete Python example',language:'python',external_execution:'buyer-controlled'},
 validation_contract:{kind:'offline-real-library-tests',cases:7,dependencies:validation.dependencies,scope:validation.scope},
 language_policy:{mode:'configured',explicit_selection:true,adapters:['python']},tags:routing.tags,supported_boundary};
const files=[];
for(const path of ['GUIDANCE.md','example.py','requirements.txt','LICENSE']) {const bytes=await readFile(new URL(path,root));files.push({path,content:bytes.toString('utf8'),sha256:digest(bytes),size_bytes:bytes.length,mime_type:path.endsWith('.py')?'text/x-python':'text/plain; charset=utf-8'});}
const source_provenance={source_snapshot_sha256:snapshot,historical_record_sha256:digest(canonicalJson(original)),
 historical_guidance_sha256:digest(original.guidance),historical_guidance_size_bytes:Buffer.byteLength(original.guidance),historical_content_hash:original.content_hash,
 historical_record_path:'history/v1-catalog-record.json',historical_guidance_path:'history/v1-guidance.txt',
 corrected_guidance_sha256:content_hash,upstream_source_inspection:upstream,original_source_hashes:Object.fromEntries(files.map(file=>[file.path,file.sha256])),
 license_mapping:[{paths:files.map(file=>file.path),license:'Apache-2.0',license_file:'LICENSE',status:'proposed original-source mapping awaiting trusted review'},
 {dependency:'aws-lambda-powertools==3.36.0',license:'MIT-0',source_revision:upstream.revision,status:'external dependency; no implementation vendored; upstream license inspected, not a product licensing attestation'}]};
const blockers=['trusted_guidance_and_contract_reviews_pending','trusted_license_and_provenance_review_pending','publication_approval_pending'];
const release_input={schema_version:'1',item,manifest,routing_manifest:routing,payload:{content:guidance,sha256:content_hash,size_bytes:Buffer.byteLength(guidance),mime_type:item.mime_type},files,source_provenance,blockers};
for(const [path,value] of [['routing-manifest.json',routing],['source-provenance.json',source_provenance],['release-input.json',release_input],['release-candidate.json',{...manifest,status:'draft',publication_blockers:blockers}]]) await writeFile(new URL(path,root),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({sku:item.sku,version:2,release_ref,size_bytes:Buffer.byteLength(guidance),language:'python',historical_hash_preserved:original.content_hash}));
