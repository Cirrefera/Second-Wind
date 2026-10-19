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
