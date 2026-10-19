import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublication,canonicalService} from '../src/publication.js';
import {sha256,canonicalJson} from '../src/contracts.js';
test('component publication verifies actual bytes even when supplied review hashes match',async()=>{
 const m={schema_version:'1',sku:'A',slug:'a',version:1,product_kind:'artifact-product',release_ref:'release:1',trial_adapter:'javascript-isolate',
 pricing:{mode:'proportional-components',max_amount_atomic:'1000000',asset:'USDC',network:'eip155:8453'},
 components:[{id:'core',name:'Core',share_bps:10000,requires:[],files:[{path:'index.js',content:'changed',sha256:await sha256('original'),size_bytes:8,mime_type:'text/javascript'}]}]};
 const h=await sha256(canonicalJson(m));
 const r=await validatePublication({...item,kind:'artifact'},m,{component_payloads_verified_hash:h,sandbox_trial_verified_hash:h});
 assert.ok(r.blockers.includes('component_file_hash_mismatch'));
 assert.ok(r.blockers.includes('component_file_size_mismatch'));
 delete m.components[0].files[0].content;
 assert.ok((await validatePublication(item,m)).blockers.includes('component_file_bytes_missing'));
});
const item={sku:'A',slug:'a',name:'A',summary:'Operational guidance',price_usd:1,kind:'guide',service:'lambda',version:1,status:'draft',guidance:'A reviewed operational procedure',license_spdx:'MIT',provenance:'synthesized'};
test('prose masquerading as an artifact is blocked without changing legacy hashes',async()=>{
 const input={...item,kind:'artifact',content_hash:'historical'};
 const r=await validatePublication(input);
 assert.equal(r.eligibility,'blocked');assert.ok(r.blockers.includes('advertised_artifact_missing'));assert.equal(input.content_hash,'historical');
});
test('a guidance release needs exact immutable bytes, verified license and reviewed contract',async()=>{
 const hash=await sha256(item.guidance);
 const m={schema_version:'1',sku:'A',slug:'a',version:1,product_kind:'guidance-product',service:'lambda',release_ref:'release:1',content_hash:hash,hash_scope:'guidance-utf8',mime_type:'text/markdown',delivery_contract:{type:'guidance'},validation_contract:{type:'reviewed'},origin:'Second Wind',original_contribution:'An original operational procedure with explicit verification and recovery steps.',license:'MIT',language_policy:{mode:'not-applicable'},tags:['retry-safety'],supported_boundary:'operational guidance'};
 const e={product_review_hash:await sha256(canonicalJson(m)),service_verified:true,contract_review_hash:await sha256(canonicalJson(m)),license_verified:true,purchase_url_verified:true,pre_settlement_ready:true,guidance_review_hash:hash,immutable_guidance_hash:hash};
 assert.equal((await validatePublication(item,m,e)).eligibility,'eligible');
 assert.equal((await validatePublication({...item,guidance:'changed'},m,e)).eligibility,'blocked');
 assert.equal((await validatePublication(item,m,{...e,license_verified:false})).eligibility,'blocked');
 const missing={...m}; delete missing.original_contribution;
 assert.ok((await validatePublication(item,missing,e)).blockers.includes('original_contribution_missing'));
 assert.ok((await validatePublication(item,m,{...e,product_review_hash:undefined})).blockers.includes('product_contribution_unreviewed'));
 const revised={...m,original_contribution:'Changed product promise'};
 assert.ok((await validatePublication(item,revised,{...e,contract_review_hash:await sha256(canonicalJson(revised))})).blockers.includes('product_contribution_unreviewed'));
 assert.equal(canonicalService('api-gateway'),'apigateway');assert.equal(canonicalService('step-functions'),'states');
});

async function reviewedGuidance(itemPatch={},manifestPatch={}) {
 const candidate={...item,...itemPatch},hash=await sha256(candidate.guidance);
 const manifest={schema_version:'1',sku:candidate.sku,slug:candidate.slug,version:candidate.version,
  product_kind:'guidance-product',service:'lambda',release_ref:'release:1',content_hash:hash,
  hash_scope:'guidance-utf8',mime_type:'text/markdown',delivery_contract:{type:'guidance'},
  validation_contract:{type:'reviewed'},origin:'Second Wind',original_contribution:'An original reviewed operational procedure.',
  license:'MIT',language_policy:{mode:'not-applicable'},tags:['retry-safety'],supported_boundary:'operational guidance',...manifestPatch};
 const review=await sha256(canonicalJson(manifest));
 const evidence={product_review_hash:review,service_verified:true,contract_review_hash:review,
  license_verified:true,purchase_url_verified:true,pre_settlement_ready:true,guidance_review_hash:hash,
  immutable_guidance_hash:hash,language_adapters_verified:true};
 return validatePublication(candidate,manifest,evidence);
}

test('review hashes cannot approve a missing SKU or invalid product version',async()=>{
 assert.equal((await reviewedGuidance()).eligibility,'eligible');
 for(const [patch,blocker] of [[{sku:''},'sku_missing'],[{sku:undefined},'sku_missing'],[{version:0},'version_invalid'],[{version:1.5},'version_invalid']]) {
  const result=await reviewedGuidance(patch);
  assert.equal(result.eligibility,'blocked');
  assert.ok(result.blockers.includes(blocker),blocker);
 }
});

test('review hashes cannot approve blank or malformed required release metadata',async()=>{
 const cases=[
  [{release_ref:' '},'immutable_release_missing'],
  [{mime_type:{}},'mime_type_missing'],
  [{delivery_contract:{}},'contracts_missing'],
  [{validation_contract:[]},'contracts_missing'],
  [{origin:true},'license_or_origin_unverified'],
  [{license:[]},'license_or_origin_unverified'],
  [{language_policy:{mode:'configured',adapters:[''],explicit_selection:true}},'language_adapters_missing'],
  [{tags:['']},'routing_contract_missing'],
  [{supported_boundary:true},'routing_contract_missing'],
 ];
 for(const [patch,blocker] of cases) {
  const result=await reviewedGuidance({},patch);
  assert.equal(result.eligibility,'blocked',JSON.stringify(patch));
  assert.ok(result.blockers.includes(blocker),blocker);
 }
});
