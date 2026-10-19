import {canonicalJson,sha256} from './contracts.js';

export const VALIDATOR_VERSION = '2026-10-19.1';
export const SERVICE_ALIASES = Object.freeze({'api-gateway':'apigateway','step-functions':'states'});
export const canonicalService = value => SERVICE_ALIASES[value] || value;
const kinds = new Set(['guidance-product','artifact-product','executable-product','bundle']);
const digestPattern = /^[a-f0-9]{64}$/;

/** Evidence is supplied by release preparation; absence always blocks publication.
 * A report does not itself authorize promotion. No catalog or legacy hash writes.
 */
export async function validatePublication(item, manifest, evidence = {}) {
  const blockers = [];
  const require = (condition, reason) => { if (!condition) blockers.push(reason); };
  require(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug || ''),'slug_invalid');
  require(typeof item.name === 'string' && item.name.trim().length > 0,'name_missing');
  require(typeof item.summary === 'string' && item.summary.trim().length > 0,'summary_missing');
  require(Number.isFinite(item.price_usd) && item.price_usd > 0 && item.price_usd <= 10,'price_invalid');
  const guidance_hash = await sha256(item.guidance || '');
  const legacy_hash_status = !item.content_hash ? 'missing' : item.content_hash === guidance_hash ? 'exact_guidance_hash'
    : guidance_hash.startsWith(item.content_hash) ? 'guidance_hash_prefix' : 'different_from_guidance';
  require(Boolean(manifest),'release_manifest_missing');
  if (manifest) {
    require(manifest.schema_version === '1','manifest_schema_unsupported');
    require(manifest.sku === item.sku && manifest.slug === item.slug && manifest.version === item.version,'manifest_identity_mismatch');
    require(kinds.has(manifest.product_kind),'product_kind_unreviewed');
    require(manifest.service === canonicalService(item.service) && evidence.service_verified === true,'canonical_service_unverified');
    require(Boolean(manifest.release_ref),'immutable_release_missing');
    require(digestPattern.test(manifest.content_hash || ''),'release_hash_invalid');
    require(Boolean(manifest.mime_type),'mime_type_missing');
    require(Boolean(manifest.delivery_contract) && Boolean(manifest.validation_contract),'contracts_missing');
    require(evidence.contract_review_hash === await sha256(canonicalJson(manifest)),'advertised_contract_unreviewed');
    require(Boolean(manifest.origin) && Boolean(manifest.license) && evidence.license_verified === true,'license_or_origin_unverified');
    require(evidence.purchase_url_verified === true,'purchase_url_unverified');
    require(evidence.pre_settlement_ready === true,'pre_settlement_preparation_unverified');
    const kind = manifest.product_kind;
    if (kind === 'guidance-product') {
      require(Boolean(item.guidance?.trim()),'guidance_missing');
      require(manifest.hash_scope === 'guidance-utf8' && manifest.content_hash === guidance_hash,'guidance_hash_mismatch');
      require(evidence.guidance_review_hash === guidance_hash,'guidance_quality_unreviewed');
      require(evidence.immutable_guidance_hash === guidance_hash,'immutable_guidance_release_unverified');
    } else {
      require(evidence.payload_verified_hash === manifest.content_hash,'canonical_payload_unverified');
      require(evidence.validation_passed_hash === manifest.content_hash,'release_validation_missing');
    }
    if (kind === 'artifact-product') require(Array.isArray(manifest.required_files) && manifest.required_files.length > 0,'required_files_missing');
    if (kind === 'executable-product') {
      require(Boolean(manifest.input_schema) && Boolean(manifest.output_schema),'execution_schemas_missing');
      require(Boolean(manifest.side_effects) && Boolean(manifest.idempotency_contract),'execution_safety_contract_missing');
    }
    if (kind === 'bundle') require(Array.isArray(manifest.members) && manifest.members.length > 0 && evidence.members_verified === true,'bundle_members_unverified');
    if (manifest.language_policy?.mode === 'configured') {
      require(Array.isArray(manifest.language_policy.adapters) && manifest.language_policy.adapters.length > 0,'language_adapters_missing');
      require(evidence.language_adapters_verified === true,'language_adapters_unverified');
      require(manifest.language_policy.explicit_selection === true,'explicit_language_selection_missing');
    } else require(manifest.language_policy?.mode === 'not-applicable','language_policy_missing');
    require(Array.isArray(manifest.tags) && manifest.tags.length > 0 && Boolean(manifest.supported_boundary),'routing_contract_missing');
  }
  // Legacy fields alone never constitute a release or a licensing verification.
  if (!item.license_spdx) blockers.push('legacy_license_missing');
  if (!item.provenance) blockers.push('legacy_provenance_missing');
  if (!item.mime_type && !manifest?.mime_type) blockers.push('mime_type_missing');
  if (item.kind === 'artifact' && !evidence.payload_verified_hash) blockers.push('advertised_artifact_missing');
  if (item.sku.startsWith('BUN-') && !evidence.members_verified) blockers.push('bundle_members_unverified');
  return {sku:item.sku,slug:item.slug,status:item.status,validator_version:VALIDATOR_VERSION,
    eligibility:blockers.length?'blocked':'eligible',blockers:[...new Set(blockers)],
    guidance_hash,legacy_hash:item.content_hash,legacy_hash_status,
    manifest_hash:manifest ? await sha256(canonicalJson(manifest)) : null};
}
