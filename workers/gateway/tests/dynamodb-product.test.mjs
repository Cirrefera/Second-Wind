import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare} from '../../../products/agent-state-dynamodb-manifest/plan.mjs';
import '../../../products/agent-state-dynamodb-manifest/scripts/plan.test.mjs';
const optional=['status-index','expiry','recovery','change-stream'];
test('DynamoDB package preserves the boundary of every component combination',()=>{
 for(let mask=0;mask<16;mask++) {
  const components=['table',...optional.filter((_,i)=>mask&(1<<i))];
  const plan=prepare({table_name:'agent-state-test',components});
  const create=plan.steps[0];
  assert.equal(create.operation,'CreateTable');
  assert.equal(Object.hasOwn(create.input,'TimeToLiveSpecification'),false);
  assert.equal(Object.hasOwn(create.input,'PointInTimeRecoverySpecification'),false);
  assert.equal(Boolean(create.input.GlobalSecondaryIndexes),components.includes('status-index'));
  assert.equal(Boolean(create.input.StreamSpecification),components.includes('change-stream'));
  assert.equal(plan.steps.some(s=>s.operation==='UpdateTimeToLive'),components.includes('expiry'));
  assert.equal(plan.steps.some(s=>s.operation==='UpdateContinuousBackups'),components.includes('recovery'));
  for(const step of plan.steps.slice(2)) assert.deepEqual(step.depends_on,['active']);
  const defined=create.input.AttributeDefinitions.map(a=>a.AttributeName).sort();
  const keys=[...new Set([...create.input.KeySchema,...(create.input.GlobalSecondaryIndexes||[]).flatMap(i=>i.KeySchema)].map(k=>k.AttributeName))].sort();
  assert.deepEqual(defined,keys);
 }
});
test('DynamoDB planner rejects ambiguous configuration and never accepts credentials',()=>{
 for(const config of [null,{}, {table_name:'x',components:['table']},{table_name:'valid',components:['expiry']},
  {table_name:'valid',components:['table','table']},{table_name:'valid',components:['table'],credentials:'secret'}]) assert.throws(()=>prepare(config));
 const config={table_name:'agent-state',components:['table','expiry']};
 const before=JSON.stringify(config);assert.deepEqual(prepare(config),prepare(config));assert.equal(JSON.stringify(config),before);
});
