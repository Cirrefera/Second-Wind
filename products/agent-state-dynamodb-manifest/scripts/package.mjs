import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256,USDC,NETWORK} from '../../../workers/gateway/src/contracts.js';
import {prepareComponentSelection,selectedPackageFiles} from '../../../workers/gateway/src/scope.js';
import {validateRoutingManifest} from '../../../workers/gateway/src/routing.js';
const root=new URL('../',import.meta.url);
const write=async(name,data)=>writeFile(new URL(name,root),canonicalJson(data)+'\n');
export async function prepareRelease() {
 const evidence=JSON.parse(await readFile(new URL('validation.json',root),'utf8'));
 const paths=['planner.mjs','config.schema.json','README.md',...(await readdir(new URL('features/',root))).sort().map(p=>'features/'+p)];
 const files=[];
 for(const path of paths){const content=await readFile(new URL(path,root),'utf8');files.push({path,content,sha256:await sha256(content),size_bytes:Buffer.byteLength(content),mime_type:path.endsWith('.mjs')?'text/javascript':path.endsWith('.json')?'application/json':'text/markdown'});}
 for(const [path,digest] of Object.entries(evidence.source_hashes)) if(await sha256(await readFile(new URL(path,root)))!==digest) throw new Error('stale_validation:'+path);
 if(evidence.result!=='passed'||evidence.component_combinations!==16||evidence.validated_operation_inputs!==80) throw new Error('validation_required');
 const manifest={schema_version:'1',sku:'AWS-0568',product_kind:'artifact-product',required_files:files.map(({content,...f})=>f)};
 const manifestBytes=canonicalJson(manifest)+'\n',sourceHash=await sha256(manifestBytes);
 const featureIds=['status-index','expiry','recovery','change-stream'];
 const assembly={kind:'javascript-feature-plan-v1',entrypoint:'plan.mjs',core:'planner.mjs',selection_field:'features',features:featureIds.map(id=>({id,path:`features/${id}.mjs`}))};
 const release={schema_version:'1',sku:'AWS-0568',slug:'agent-state-dynamodb-manifest',version:2,
  release_ref:'sha256:'+sourceHash,product_kind:'artifact-product',service:'dynamodb',trial_adapter:'javascript-isolate',assembly,
  origin:'Second Wind',license:'Apache-2.0',original_contribution:'Deterministic DynamoDB request planning, readiness sequencing, selected-feature delivery and verification.',
  supported_boundary:'Prepare DynamoDB API requests for an agent/session table. Buyer controls AWS execution.',
  language_policy:{mode:'configured',explicit_selection:true,adapters:['javascript']},
  pricing:{mode:'proportional-components',version:'1',max_amount_atomic:'500000',asset:USDC,network:NETWORK},
  components:[{id:'table',name:'Agent/session table',share_bps:5000,requires:[],files:files.filter(f=>!f.path.startsWith('features/'))},
    ...featureIds.map(id=>({id,name:{'status-index':'Status queries',expiry:'Automatic item expiry',recovery:'Point-in-time recovery','change-stream':'Change stream'}[id],share_bps:id==='status-index'?2000:1000,requires:['table'],files:files.filter(f=>f.path===`features/${id}.mjs`)}))]};
 const fullScope=await prepareComponentSelection(release,release.components.map(c=>c.id),{});
 const payload=canonicalJson(selectedPackageFiles(release,fullScope));
 const content_hash=await sha256(payload);
 release.storage={via:'r2',r2_bucket:'secondwind-payloads',r2_key:`releases/sha256/${content_hash}.json`,content_hash,size_bytes:Buffer.byteLength(payload),mime_type:'application/json',hash_scope:'selected-files-canonical-json'};
 release.content_hash=content_hash;release.mime_type='application/json';release.hash_scope='selected-files-canonical-json';
 release.required_files=fullScope.files.map(f=>f.path);
 release.delivery_contract={kind:'file-package',entrypoint:'plan.mjs',selection:'Exact files and generated entry point bound before acceptance.'};
 release.validation_contract={kind:'isolated-javascript',required:'Selected product must execute in sandbox before acceptance.',aws_deployment:'not_performed'};
 release.tags=['dynamodb','agent-state','request-planning'];
 const routing={schema_version:'1',product_id:release.slug,sku:release.sku,slug:release.slug,version:release.version,release_ref:release.release_ref,
  service:'dynamodb',product_kind:'artifact-product',route_summary:'Prepare DynamoDB agent session state table API requests with optional status queries, expiry, recovery and change stream.',
  supported_boundary:release.supported_boundary,aliases:['dynamodb-agent-state'],tags:release.tags,taxonomy_ids:['aws.dynamodb'],problem_family_ids:['agent-state-storage'],
  operations:['prepare-table-plan'],environments:['aws'],desired_outcomes:['agent-state-table-plan'],input_kinds:['table-configuration'],failure_signatures:[],
  languages:['javascript'],runtimes:['nodejs22'],required_evidence:[],exclusions:['existing-table-migration','global-tables','iam-role-creation','aws-deployment'],language_policy:'explicit'};
 if(validateRoutingManifest(routing).length) throw new Error('invalid_routing_manifest');
 return {release,routing,payload,manifestBytes};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const {release,routing,payload,manifestBytes}=await prepareRelease();
 await writeFile(new URL('files.manifest.json',root),manifestBytes);
 await writeFile(new URL('release.payload.json',root),payload);
 await write('release.manifest.json',release);await write('routing.manifest.json',routing);
 await write('release-candidate.json',{sku:release.sku,version:release.version,status:'draft',release_ref:release.release_ref,manifest_hash:await sha256(canonicalJson(release)),
  storage:release.storage,pricing:release.pricing,
  publication_blockers:['immutable_delivery_store_upload_pending','production_trial_acceptance_pending','license_review_pending','publication_review_pending'],
  validation:{service_model:'passed',aws_deployment:'not_performed'}});
 console.log(JSON.stringify({sku:release.sku,version:release.version,release_hash:await sha256(canonicalJson(release)),package_hash:release.storage.content_hash}));
}
