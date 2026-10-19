import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublication,canonicalService} from '../src/publication.js';
import {sha256,canonicalJson} from '../src/contracts.js';
const item={sku:'A',slug:'a',name:'A',summary:'Operational guidance',price_usd:1,kind:'guide',service:'lambda',version:1,status:'draft',guidance:'A reviewed operational procedure',license_spdx:'MIT',provenance:'synthesized'};
test('prose masquerading as an artifact is blocked without changing legacy hashes',async()=>{
 const input={...item,kind:'artifact',content_hash:'historical'};
 const r=await validatePublication(input);
 assert.equal(r.eligibility,'blocked');assert.ok(r.blockers.includes('advertised_artifact_missing'));assert.equal(input.content_hash,'historical');
});
test('a guidance release needs exact immutable bytes, verified license and reviewed contract',async()=>{
 const hash=await sha256(item.guidance);
 const m={schema_version:'1',sku:'A',slug:'a',version:1,product_kind:'guidance-product',service:'lambda',release_ref:'release:1',content_hash:hash,hash_scope:'guidance-utf8',mime_type:'text/markdown',delivery_contract:{type:'guidance'},validation_contract:{type:'reviewed'},origin:'Second Wind',license:'MIT',language_policy:{mode:'not-applicable'},tags:['retry-safety'],supported_boundary:'operational guidance'};
 const e={service_verified:true,contract_review_hash:await sha256(canonicalJson(m)),license_verified:true,purchase_url_verified:true,pre_settlement_ready:true,guidance_review_hash:hash,immutable_guidance_hash:hash};
 assert.equal((await validatePublication(item,m,e)).eligibility,'eligible');
 assert.equal((await validatePublication({...item,guidance:'changed'},m,e)).eligibility,'blocked');
 assert.equal((await validatePublication(item,m,{...e,license_verified:false})).eligibility,'blocked');
 assert.equal(canonicalService('api-gateway'),'apigateway');assert.equal(canonicalService('step-functions'),'states');
});
