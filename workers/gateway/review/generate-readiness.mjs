/** Read only a held inventory export. Never fetches or mutates catalog data. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../src/contracts.js';

const input=process.argv[2];
if(!input) throw new Error('Usage: node review/generate-readiness.mjs held-inventory.json');
const root=new URL('./',import.meta.url);
const digest=value=>createHash('sha256').update(value).digest('hex');
const historicalBytes=await readFile(new URL('inventory-evidence-2026-10-19.json',root));
const historical=JSON.parse(historicalBytes);
const inventory=JSON.parse(await readFile(input,'utf8'));
if(digest(canonicalJson(inventory))!==historical.snapshot_sha256) throw new Error('historical_snapshot_mismatch');
if(inventory.length!==historical.items || new Set(inventory.map(item=>item.sku)).size!==inventory.length) throw new Error('inventory_identity_mismatch');
const candidate=JSON.parse(await readFile(new URL('../../../products/agent-state-dynamodb-manifest/release-candidate.json',root),'utf8'));
const rows=[];
for(const item of inventory) {
 const guidance=typeof item.guidance==='string'?item.guidance:'';
 const guidanceHash=digest(guidance);
 const match=guidance.match(/Structured payload:\s*([\s\S]*)$/);
 let fields='none';
 if(match) {
  try {
   const payload=JSON.parse(match[1]);
   fields=payload && typeof payload==='object' && !Array.isArray(payload)?Object.keys(payload).sort().join(';'):'non-object';
  } catch {fields='unparseable';}
 }
 const isBundle=item.sku.startsWith('BUN-');
 const contractKind=isBundle?'bundle':item.kind==='artifact'?'artifact-product':item.kind==='guide'?'guidance-product':'unreviewed-tool-kind';
 const metadataGaps=['release_manifest_missing','mime_type_missing','canonical_service_review_missing','validation_contract_missing','language_policy_missing','routing_boundary_and_tags_missing'];
 if(!item.input_schema) metadataGaps.push('legacy_input_schema_empty');
 const provenanceGaps=['original_contribution_review_missing','license_claim_review_missing'];
 if(!item.license_spdx) provenanceGaps.push('license_spdx_missing');
 if(!item.provenance) provenanceGaps.push('provenance_missing');
 if(item.source_repo || item.source_url) provenanceGaps.push('source_revision_missing','source_file_to_deliverable_mapping_unverified','applicable_license_and_notice_mapping_unverified');
 else provenanceGaps.push('original_authorship_or_source_evidence_missing');
 if(isBundle) provenanceGaps.push('versioned_member_provenance_unverified');
 let payloadGaps;
 if(isBundle) payloadGaps=['versioned_member_manifest_missing','member_release_and_entitlement_verification_missing'];
 else if(item.kind==='artifact') payloadGaps=['required_artifact_files_unverified','artifact_file_manifest_missing','artifact_validation_missing'];
 else if(item.kind==='guide') payloadGaps=['guidance_quality_review_missing','immutable_guidance_object_verification_missing'];
 else payloadGaps=['guidance_vs_executable_contract_unreviewed','promised_execution_or_guidance_delivery_unverified'];
 payloadGaps.push('immutable_release_binding_missing','pre_settlement_preparation_evidence_missing');
 rows.push({
  sku:item.sku,slug:item.slug,status_in_snapshot:item.status,version_in_snapshot:item.version,
  new_publication_readiness:item.status==='retired'?'retired;release-evidence-missing':'blocked',
  legacy_kind:item.kind,required_contract_review:contractKind,service_in_snapshot:item.service,
  canonical_service_candidate:({'api-gateway':'apigateway','step-functions':'states'})[item.service]||item.service,
  advertised_summary:item.summary,invoke_kind_in_snapshot:item.invoke_kind,
  observed_fulfillment:'inline guidance in held export; no canonical payload-object evidence in historical audit',
  guidance_utf8_bytes:Buffer.byteLength(guidance),guidance_sha256:guidanceHash,
  structured_metadata_fields:fields,legacy_content_hash:item.content_hash||'',
  legacy_hash_relation:!item.content_hash?'missing':item.content_hash===guidanceHash?'exact_guidance_hash':guidanceHash.startsWith(item.content_hash)?'guidance_hash_prefix':'different_from_guidance',
  mime_type_in_snapshot:item.mime_type||'',input_schema_present:Boolean(item.input_schema),
  metadata_gaps:metadataGaps.join(';'),payload_and_evidence_gaps:payloadGaps.join(';'),
  provenance_in_snapshot:item.provenance||'',source_repo_in_snapshot:item.source_repo||'',source_url_in_snapshot:item.source_url||'',
  license_claim_in_snapshot:item.license_spdx||'',provenance_gaps:provenanceGaps.join(';'),
  local_draft_candidate:item.sku===candidate.sku?'products/agent-state-dynamodb-manifest;draft only;not a catalog or immutable delivery release':'none inspected',
 });
}
const keys=Object.keys(rows[0]);
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const csv=[keys,...rows.map(row=>keys.map(key=>row[key]))].map(row=>row.map(quote).join(',')).join('\n')+'\n';
const counts=field=>Object.fromEntries([...new Set(rows.map(row=>row[field]))].sort().map(value=>[value,rows.filter(row=>row[field]===value).length]));
const evidence={
 schema_version:'1',scope:'Read-only reassessment of the held 2026-10-19 inventory export. No production access this pass; no catalog, purchase or stored-hash mutation.',
 source_snapshot_sha256:historical.snapshot_sha256,source_snapshot_hash_scope:historical.snapshot_hash_scope,
 historical_evidence_sha256:digest(historicalBytes),
 historical_eligibility_csv_sha256:digest(await readFile(new URL('inventory-eligibility-2026-10-19.csv',root))),
 report_sha256:digest(csv),report_hash_scope:'exact UTF-8 inventory-readiness-2026-10-19.csv bytes',
 generator_sha256:digest(await readFile(new URL('generate-readiness.mjs',root))),
 records:rows.length,statuses_in_snapshot:counts('status_in_snapshot'),legacy_kinds:counts('legacy_kind'),contract_reviews:counts('required_contract_review'),
 rows_with_mime_type:rows.filter(row=>row.mime_type_in_snapshot).length,
 rows_with_input_schema:rows.filter(row=>row.input_schema_present).length,
 rows_without_license_claim:rows.filter(row=>!row.license_claim_in_snapshot).length,
 rows_without_provenance_claim:rows.filter(row=>!row.provenance_in_snapshot).length,
 legacy_hash_relations:counts('legacy_hash_relation'),
 local_draft_candidate:{sku:candidate.sku,status:candidate.status,content_hash:candidate.content_hash,note:'Separate original replacement candidate. Does not resolve the historical upstream attribution or imply publication approval.'},
 interpretation:'Missing means absent or unverified in the held export and historical audit, not proof that an uninspected external store or upstream file does not exist. Structured metadata keys are pointers, not artifact bytes. The legacy tool kind is not automatically classified as executable. Retired rows are not candidates for promotion.',
};
await writeFile(new URL('inventory-readiness-2026-10-19.csv',root),csv);
await writeFile(new URL('inventory-readiness-evidence-2026-10-19.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({records:rows.length,source_snapshot_sha256:historical.snapshot_sha256,report_sha256:evidence.report_sha256}));
