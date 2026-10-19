/** Second Wind original artifact: deterministic DynamoDB API request planning.
 * No credentials, SDK, network calls or resource mutation. */
export function prepare(config) {
  if(!config || Array.isArray(config) || typeof config!=='object') throw new Error('configuration_required');
  const allowed=new Set(['table_name','components']);
  if(Object.keys(config).some(k=>!allowed.has(k))) throw new Error('unknown_configuration_field');
  if(typeof config.table_name!=='string'||!/^[A-Za-z0-9_.-]{3,255}$/.test(config.table_name)) throw new Error('invalid_table_name');
  const components=config.components;
  if(!Array.isArray(components)||!components.length||new Set(components).size!==components.length
    ||components.some(c=>!['table','status-index','expiry','recovery','change-stream'].includes(c))) throw new Error('invalid_components');
  if(!components.includes('table')) throw new Error('table_component_required');
  const selected=new Set(components),TableName=config.table_name;
  const input={TableName,BillingMode:'PAY_PER_REQUEST',
    AttributeDefinitions:[{AttributeName:'agent_id',AttributeType:'S'},{AttributeName:'session_id',AttributeType:'S'}],
    KeySchema:[{AttributeName:'agent_id',KeyType:'HASH'},{AttributeName:'session_id',KeyType:'RANGE'}],
    SSESpecification:{Enabled:true,SSEType:'KMS'}};
  if(selected.has('status-index')) {
    input.AttributeDefinitions.push({AttributeName:'status',AttributeType:'S'});
    input.GlobalSecondaryIndexes=[{IndexName:'status-index',KeySchema:[{AttributeName:'status',KeyType:'HASH'},{AttributeName:'session_id',KeyType:'RANGE'}],Projection:{ProjectionType:'KEYS_ONLY'}}];
  }
  if(selected.has('change-stream')) input.StreamSpecification={StreamEnabled:true,StreamViewType:'NEW_AND_OLD_IMAGES'};
  const steps=[{id:'create',operation:'CreateTable',input},
    {id:'active',operation:'DescribeTable',input:{TableName},depends_on:['create'],wait_for:{path:'Table.TableStatus',equals:'ACTIVE',timeout_seconds:600,poll_seconds:5}}];
  if(selected.has('expiry')) steps.push({id:'expiry',operation:'UpdateTimeToLive',input:{TableName,TimeToLiveSpecification:{AttributeName:'expires_at',Enabled:true}},depends_on:['active']});
  if(selected.has('recovery')) steps.push({id:'recovery',operation:'UpdateContinuousBackups',input:{TableName,PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true}},depends_on:['active']});
  const verification=[{operation:'DescribeTable',input:{TableName},checks:{'Table.TableStatus':'ACTIVE','Table.BillingModeSummary.BillingMode':'PAY_PER_REQUEST'}}];
  if(selected.has('expiry')) verification.push({operation:'DescribeTimeToLive',input:{TableName},checks:{'TimeToLiveDescription.TimeToLiveStatus':'ENABLED','TimeToLiveDescription.AttributeName':'expires_at'}});
  if(selected.has('recovery')) verification.push({operation:'DescribeContinuousBackups',input:{TableName},checks:{'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus':'ENABLED'}});
  return {schema_version:'1',sku:'AWS-0568',target:'aws-dynamodb-api',components:[...selected].sort(),steps,verification,
    execution:'buyer-controlled',recovery:'Inspect existing table configuration after a lost response. Do not treat a name collision as proof that the intended table was created.'};
}
