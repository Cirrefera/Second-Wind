/** Original Second Wind planner. No credentials, networking or AWS mutation. */
export function prepareWith(config, available) {
  if(!config || Array.isArray(config) || typeof config!=='object') throw new Error('configuration_required');
  const allowed=new Set(['table_name','features','components','language','runtime']);
  if(Object.keys(config).some(k=>!allowed.has(k))) throw new Error('unknown_configuration_field');
  if(config.language!==undefined && config.language!=='javascript') throw new Error('unsupported_delivery_language');
  if(config.runtime!==undefined && config.runtime!=='nodejs22') throw new Error('unsupported_delivery_runtime');
  if(typeof config.table_name!=='string'||!/^[A-Za-z0-9_.-]{3,255}$/.test(config.table_name)) throw new Error('invalid_table_name');
  if(config.features!==undefined && config.components!==undefined) throw new Error('ambiguous_selection');
  const selected=config.features ?? config.components;
  const supported=new Map(available.map(feature=>[feature.id,feature]));
  if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length
    ||selected.some(id=>id!=='table'&&!supported.has(id))) throw new Error('unsupported_selection');
  if(!selected.includes('table')) throw new Error('table_required');
  const TableName=config.table_name;
  const input={TableName,BillingMode:'PAY_PER_REQUEST',
    AttributeDefinitions:[{AttributeName:'agent_id',AttributeType:'S'},{AttributeName:'session_id',AttributeType:'S'}],
    KeySchema:[{AttributeName:'agent_id',KeyType:'HASH'},{AttributeName:'session_id',KeyType:'RANGE'}],
    SSESpecification:{Enabled:true,SSEType:'KMS'}};
  const steps=[{id:'create',operation:'CreateTable',input},
    {id:'active',operation:'DescribeTable',input:{TableName},depends_on:['create'],wait_for:{path:'Table.TableStatus',equals:'ACTIVE',timeout_seconds:600,poll_seconds:5}}];
  const verification=[{operation:'DescribeTable',input:{TableName},checks:{'Table.TableStatus':'ACTIVE','Table.BillingModeSummary.BillingMode':'PAY_PER_REQUEST',
    'Table.KeySchema':input.KeySchema,'Table.SSEDescription.Status':'ENABLED'}}];
  for(const feature of available) if(selected.includes(feature.id)) feature.apply({input,steps,verification,TableName});
  return {schema_version:'1',sku:'AWS-0568',target:'aws-dynamodb-api',components:[...selected].sort(),features:[...selected].sort(),steps,verification,
    execution:'buyer-controlled',recovery:'Inspect existing table configuration after a lost response. Do not treat a name collision as proof that the intended table was created.'};
}
