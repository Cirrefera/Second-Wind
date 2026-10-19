import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare} from '../plan.mjs';
import './variants.test.mjs';

const optional=['status-index','expiry','recovery','change-stream'];

test('all 16 selections declare final state for the requested features',()=>{
 for(let mask=0;mask<16;mask++) {
  const components=['table',...optional.filter((_,index)=>mask&(1<<index))];
  const plan=prepare({table_name:'agent-state-test',components});
  const create=plan.steps[0];
  const checks=plan.verification[0].checks;
  assert.equal(create.operation,'CreateTable');
  assert.equal(checks['Table.TableName'],'agent-state-test');
  assert.equal(checks['Table.TableStatus'],'ACTIVE');
  assert.equal(checks['Table.BillingModeSummary.BillingMode'],'PAY_PER_REQUEST');
  assert.deepEqual(checks['Table.KeySchema'],[
   {AttributeName:'agent_id',KeyType:'HASH'},
   {AttributeName:'session_id',KeyType:'RANGE'}]);
  assert.deepEqual(checks['Table.AttributeDefinitions'],[
   {AttributeName:'agent_id',AttributeType:'S'},
   {AttributeName:'session_id',AttributeType:'S'},
   ...(components.includes('status-index')?[{AttributeName:'status',AttributeType:'S'}]:[])]);
  assert.equal(checks['Table.SSEDescription.Status'],'ENABLED');
  assert.equal(checks['Table.SSEDescription.SSEType'],'KMS');
  if(components.includes('status-index')) assert.deepEqual(checks['Table.GlobalSecondaryIndexes'],[{
   IndexName:'status-index',IndexStatus:'ACTIVE',
   KeySchema:[{AttributeName:'status',KeyType:'HASH'},{AttributeName:'session_id',KeyType:'RANGE'}],
   Projection:{ProjectionType:'KEYS_ONLY'}}]);
  else assert.equal(Object.hasOwn(checks,'Table.GlobalSecondaryIndexes'),false);
  if(components.includes('change-stream')) assert.deepEqual(checks['Table.StreamSpecification'],{
   StreamEnabled:true,StreamViewType:'NEW_AND_OLD_IMAGES'});
  else assert.equal(Object.hasOwn(checks,'Table.StreamSpecification'),false);
  for(const [component,update,describe,path] of [
   ['expiry','UpdateTimeToLive','DescribeTimeToLive','TimeToLiveDescription.TimeToLiveStatus'],
   ['recovery','UpdateContinuousBackups','DescribeContinuousBackups','ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus']]) {
   const selected=components.includes(component);
   assert.equal(plan.steps.some(step=>step.operation===update),selected);
   const check=plan.verification.find(step=>step.operation===describe);
   assert.equal(Boolean(check),selected);
   if(selected) assert.equal(check.checks[path],'ENABLED');
  }
  assert.equal(Object.hasOwn(create.input,'TimeToLiveSpecification'),false);
  assert.equal(Object.hasOwn(create.input,'PointInTimeRecoverySpecification'),false);
  assert.deepEqual(plan.steps[1].depends_on,['create']);
  for(const step of plan.steps.slice(2)) assert.deepEqual(step.depends_on,['active']);
 }
});

test('invalid selections, including sparse arrays, never become a partial plan',()=>{
 const sparse=['table'];sparse.length=2;
 for(const components of [sparse,['table',undefined],['table',null],['table','table'],['table','unknown'],[],['expiry']]) {
  assert.throws(()=>prepare({table_name:'agent-state',components}));
 }
 for(const table_name of ['ab','a'.repeat(256),'has space','valid\n','valid\r','valid\u2028','valid\u2029']) {
  assert.throws(()=>prepare({table_name,components:['table']}));
 }
 assert.throws(()=>prepare({table_name:'agent-state',components:['table'],credentials:'unused'}));
});

test('expectations and create requests remain independent and deterministic',()=>{
 const config={table_name:'agent-state',components:['table','status-index','change-stream']};
 const before=JSON.stringify(config);
 const plan=prepare(config);
 assert.deepEqual(plan,prepare({...config,components:[...config.components].reverse()}));
 assert.equal(JSON.stringify(config),before);
 plan.steps[0].input.KeySchema[0].AttributeName='wrong';
 plan.steps[0].input.AttributeDefinitions[0].AttributeType='N';
 plan.steps[0].input.GlobalSecondaryIndexes[0].KeySchema[0].AttributeName='wrong';
 assert.equal(plan.verification[0].checks['Table.KeySchema'][0].AttributeName,'agent_id');
 assert.equal(plan.verification[0].checks['Table.AttributeDefinitions'][0].AttributeType,'S');
 assert.equal(plan.verification[0].checks['Table.GlobalSecondaryIndexes'][0].KeySchema[0].AttributeName,'status');
});
