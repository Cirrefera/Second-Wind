/** Produce actual local release inputs. Never uploads, signs reviews, assigns prices or publishes. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../workers/gateway/src/contracts.js';
const root=new URL('../',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const input=process.argv[2];
if(!input) throw new Error('Usage: node scripts/package.mjs held-reverified-inventory.json');
const held=JSON.parse(await readFile(input,'utf8'));
const snapshot=digest(canonicalJson(held));
const historical=JSON.parse(await readFile(new URL('../../workers/gateway/review/inventory-evidence-2026-10-19.json',root),'utf8'));
if(snapshot!==historical.snapshot_sha256) throw new Error('historical_snapshot_mismatch');
const original=held.find(item=>item.sku==='AWS-0568');
if(!original||original.version!==1) throw new Error('historical_identity_mismatch');
const evidence=JSON.parse(await readFile(new URL('validation.json',root),'utf8'));
if(evidence.result!=='passed'||evidence.languages?.join(',')!=='javascript,python') throw new Error('validation_not_passed');
for(const [path,hash] of Object.entries(evidence.source_hashes)) if(digest(await readFile(new URL(path,root)))!==hash) throw new Error('stale_validation:'+path);
const groups=[{id:'table',name:'Agent session table',requires:[],paths:['planner.mjs','planner.py','selection.schema.json','README.md','LICENSE']},
 {id:'status-index',name:'Status lookup index',requires:['table'],paths:['features/status-index.mjs','features/status_index.py']},
 {id:'expiry',name:'Item expiration',requires:['table'],paths:['features/expiry.mjs','features/expiry.py']},
 {id:'recovery',name:'Point in time recovery',requires:['table'],paths:['features/recovery.mjs','features/recovery.py']},
 {id:'change-stream',name:'Old and new item stream',requires:['table'],paths:['features/change-stream.mjs','features/change_stream.py']}];
const files=[];
for(const path of groups.flatMap(group=>group.paths)) {const bytes=await readFile(new URL(path,root));files.push({path,content:bytes.toString('utf8'),sha256:digest(bytes),size_bytes:bytes.length,mime_type:path.endsWith('.mjs')?'text/javascript':path.endsWith('.py')?'text/x-python':path.endsWith('.json')?'application/json':'text/plain; charset=utf-8'});}
const components=groups.map(({paths,...component})=>({...component,files:paths.map(path=>files.find(file=>file.path===path))}));
const payload=canonicalJson({schema_version:'1',sku:original.sku,version:2,files});
const content_hash=digest(payload),release_ref='sha256:'+content_hash;
const item={...original,version:2,status:'draft',name:'prepare agent state table',
 summary:'Generate exact DynamoDB API inputs for a new agent/session table and selected status index, TTL, recovery or stream features. Explicit JavaScript or Python selection; no AWS calls or deployment.',
 guidance:await readFile(new URL('README.md',root),'utf8'),mime_type:'application/json',
 input_schema:JSON.stringify(JSON.parse(await readFile(new URL('selection.schema.json',root),'utf8'))),
 provenance:'original',source_repo:'',source_url:'https://secondwindai.com',license_spdx:'Apache-2.0'};
const supported_boundary='Offline request planning for a new DynamoDB agent/session table using string keys, on-demand billing and AWS managed KMS, with separately selected status index, TTL, recovery and streams. No AWS execution, response matcher, existing-table migration, IAM provisioning, global tables, customer-managed KMS or immediate TTL deletion.';
const routing={schema_version:'1',product_id:'AWS-0568',sku:original.sku,slug:original.slug,version:2,release_ref,service:'dynamodb',product_kind:'artifact-product',
 route_summary:'Prepare DynamoDB API requests for agent session state, optional status index, item expiration, point in time recovery and change streams.',supported_boundary,
 language_policy:'explicit',aliases:['agent-state-table'],tags:['dynamodb','agent-state','session-state','request-planning'],taxonomy_ids:['aws.dynamodb'],problem_family_ids:['agent-state-storage'],
 operations:['prepare-api-plan'],environments:['aws-dynamodb-api'],desired_outcomes:['agent-session-state'],input_kinds:['table-configuration'],failure_signatures:[],
 languages:['javascript','python'],runtimes:['nodejs24','python3.12'],required_evidence:[],exclusions:['existing-table-migration','global-tables','iam-role-creation','customer-managed-kms','aws-deployment','immediate-ttl-expiration']};
const manifest={schema_version:'1',sku:item.sku,slug:item.slug,version:2,product_kind:'artifact-product',service:'dynamodb',release_ref,content_hash,
 hash_scope:'file-package-json-utf8',mime_type:'application/json',origin:'Second Wind',license:'Apache-2.0',
 original_contribution:'Independent modular JavaScript and Python API planners, explicit language selection, selected-feature isolation, activation dependencies and final-state verification requests.',
 delivery_contract:{kind:'file-package',format:'self-contained JSON with exact UTF-8 file contents',entrypoints:{javascript:'planner.mjs',python:'planner.py'},configuration_schema:'selection.schema.json',side_effects:'none'},
 validation_contract:{kind:'offline-model-and-behavior-validation',languages:['javascript','python'],component_combinations_per_language:16,aws_model:'botocore 1.43.114 DynamoDB 2012-08-10',aws_deployment:'not-performed',response_matcher:'not-implemented'},
 language_policy:{mode:'configured',explicit_selection:true,configuration_field:'language',adapters:['javascript','python']},
 tags:routing.tags,supported_boundary,required_files:files.map(({content,...file})=>file),components,trial_adapter:'javascript-isolate',
 input_schema:JSON.parse(item.input_schema)};
const source_provenance={source_snapshot_sha256:snapshot,historical_record:original,historical_record_sha256:digest(canonicalJson(original)),
 current_origin:'original Second Wind implementation; no DynamoDB Tools code included',
 original_file_hashes:Object.fromEntries(files.map(file=>[file.path,file.sha256])),
 interface_sources:['https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_CreateTable.html','https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateTimeToLive.html','https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateContinuousBackups.html'],
 license_mapping:[{paths:files.map(file=>file.path),license:'Apache-2.0',license_file:'LICENSE',status:'proposed original-source mapping awaiting trusted review'}]};
const blockers=['component_price_allocation_pending','trusted_product_and_contract_reviews_pending','trusted_license_and_provenance_review_pending','publication_approval_pending'];
const release_input={schema_version:'1',item,manifest,routing_manifest:routing,payload:{content:payload,sha256:content_hash,size_bytes:Buffer.byteLength(payload),mime_type:'application/json'},files,source_provenance,blockers};
const fileManifest={schema_version:'1',sku:item.sku,version:2,product_kind:'artifact-product',required_files:manifest.required_files};
for(const [path,value] of [['files.manifest.json',fileManifest],['routing-manifest.json',routing],['source-provenance.json',source_provenance],['release-input.json',release_input],['release-candidate.json',{...manifest,status:'draft',publication_blockers:blockers,validation:{service_model:'passed',javascript_and_python_variants:'passed',aws_deployment:'not_performed'}}]]) await writeFile(new URL(path,root),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({sku:item.sku,version:2,release_ref,files:files.length,components:components.length,languages:manifest.language_policy.adapters,price_allocation:'not_configured'}));
