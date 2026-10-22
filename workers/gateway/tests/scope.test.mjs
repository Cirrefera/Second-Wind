import test from 'node:test';
import assert from 'node:assert/strict';
import {componentMenu,prepareComponentSelection,verifyComponentSelection} from '../src/scope.js';
const file=(path)=>({path,sha256:'a'.repeat(64),size_bytes:20,mime_type:'text/javascript'});
const release=()=>({schema_version:'1',sku:'TEST',version:1,release_ref:'commit:immutable',
 pricing:{mode:'proportional-components',max_amount_atomic:'10000000',asset:'USDC',network:'eip155:8453'},
 components:[{id:'core',name:'Core',share_bps:3000,requires:[],files:[file('core.js')]},
 {id:'optional',name:'Optional',share_bps:7000,requires:['core'],files:[file('optional.js')]}]});
test('30 percent selection costs 30 percent and contains only selected files',async()=>{
 const r=release(),scope=await prepareComponentSelection(r,['core'],{language:'javascript'});
 assert.equal(scope.amount_atomic,'3000000');assert.equal(scope.selected_share_bps,3000);
 assert.deepEqual(scope.files.map(f=>f.path),['core.js']);
 assert.equal((await prepareComponentSelection(r,['optional','core'])).amount_atomic,'10000000');
 assert.deepEqual(await verifyComponentSelection(r,scope,{language:'javascript'}),scope);
});
test('missing dependencies are disclosed, never silently selected or charged',async()=>{
 await assert.rejects(prepareComponentSelection(release(),['optional']),e=>e.code==='component_dependencies_required' && e.details.missing_components[0]==='core');
 for(const ids of [[],['core','core'],['invented']]) await assert.rejects(prepareComponentSelection(release(),ids));
});
test('release, price, configuration and deliverable substitutions invalidate selection',async()=>{
 const r=release(),scope=await prepareComponentSelection(r,['core'],{language:'javascript'});
 await assert.rejects(verifyComponentSelection(r,{...scope,amount_atomic:'1'},{language:'javascript'}));
 await assert.rejects(verifyComponentSelection(r,scope,{language:'python'}));
 const changed=structuredClone(r);changed.components[0].files[0].sha256='b'.repeat(64);
 await assert.rejects(verifyComponentSelection(changed,scope,{language:'javascript'}));
});
test('atomic allocation sums exactly to maximum and is independent of selection ordering',async()=>{
 const r=release();r.pricing.max_amount_atomic='7';
 const menu=await componentMenu(r);
 assert.equal(menu.components.reduce((sum,c)=>sum+BigInt(c.amount_atomic),0n),7n);
 assert.deepEqual(await prepareComponentSelection(r,['optional','core']),await prepareComponentSelection(r,['core','optional']));
 r.pricing.max_amount_atomic='1';await assert.rejects(componentMenu(r),/component_below_currency_precision/);
});
test('malformed weights, dependencies and conflicting files cannot form a priced release',async()=>{
 const bad=release();bad.components[0].share_bps=2000;await assert.rejects(componentMenu(bad));
 const cycle=release();cycle.components[0].requires=['optional'];await assert.rejects(componentMenu(cycle),/cyclic_component_dependency/);
 const missing=release();missing.components[0].requires=['absent'];await assert.rejects(componentMenu(missing),/unknown_component_dependency/);
 const conflicting=release();conflicting.components[1].files=[{...file('core.js'),sha256:'b'.repeat(64)}];await assert.rejects(componentMenu(conflicting),/conflicting_component_file/);
 const traversal=release();traversal.components[0].files[0].path='../secret';await assert.rejects(componentMenu(traversal),/invalid_component_file/);
});
