import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepare} from '../planner.mjs';
import {prepare as legacyPrepare} from '../plan.mjs';
const ids=['status-index','expiry','recovery','change-stream'];
const modules=await Promise.all(ids.map(async id=>(await import(`../features/${id}.mjs`)).feature));
const root=new URL('../',import.meta.url);
const all=[];
test('the real JavaScript modules implement all 16 feature selections with explicit language',()=>{
 for(let mask=0;mask<16;mask++) {
  const features=modules.filter((_,index)=>mask&(1<<index));
  const config={language:'javascript',table_name:'agent-state-test'};
  const result=prepare(config,features);
  assert.deepEqual(result,legacyPrepare({table_name:config.table_name,components:['table',...features.map(f=>f.id)]}));
  assert.deepEqual(prepare(config,[...features].reverse()),result);
  all.push(result);
  for(const feature of features) assert.equal(prepare(config,features.filter(value=>value!==feature)).components.includes(feature.id),false);
 }
});
test('selection refuses missing or unsupported languages and incorrect module grants',()=>{
 const config={language:'javascript',table_name:'agent-state-test'};
 for(const language of [undefined,null,'','python','typescript','java']) assert.throws(()=>prepare({...config,language}));
 assert.throws(()=>prepare(config,[modules[0],modules[0]]),/invalid_feature_modules/);
 assert.throws(()=>prepare(config,[{id:'other',apply(){}}]),/invalid_feature_modules/);
 assert.throws(()=>prepare({...config,credentials:'secret'}),/unknown_configuration_field/);
 const sparse=['table'];sparse.length=2;
 for(const components of [sparse,['table',null],['table','table'],['table',{}],['unknown'],[]]) assert.throws(()=>prepare({...config,components}));
 for(const table_name of ['ab','a'.repeat(256),'has space','valid\n','valid\r','valid\u2028','valid\u2029']) assert.throws(()=>prepare({...config,table_name}));
});
test('Python independently executes the same 16 plans and refuses unsupported selections',()=>{
 const value=JSON.parse(execFileSync(process.env.PYTHON||'python',['scripts/variants.py'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}));
 assert.equal(value.language,'python');
 assert.equal(value.selections.length,16);
 for(let mask=0;mask<16;mask++) {
  const features=modules.filter((_,index)=>mask&(1<<index));
  assert.deepEqual(value.selections[mask],prepare({language:'javascript',table_name:'agent-state-test'},features));
 }
 assert.ok(value.rejections>=20);
});
test('a purchased base-only file subset executes without optional source files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sw-dynamodb-subset-'));
 try {
  await cp(new URL('planner.mjs',root),join(dir,'planner.mjs'));
  const isolated=await import(pathToFileURL(join(dir,'planner.mjs')));
  const plan=isolated.prepare({language:'javascript',table_name:'base-only-table'});
  assert.equal(plan.steps.length,2);
  assert.equal(Object.hasOwn(plan.steps[0].input,'GlobalSecondaryIndexes'),false);
  assert.deepEqual(plan.components,['table']);
  await cp(new URL('planner.py',root),join(dir,'planner.py'));
  const python=execFileSync(process.env.PYTHON||'python',['-c',"from planner import prepare; import json; print(json.dumps(prepare({'language':'python','table_name':'base-only-table'})))"],{cwd:dir,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.deepEqual(JSON.parse(python),plan);
 } finally {await rm(dir,{recursive:true,force:true});}
});
