/** Original Second Wind planner. Imports only the feature modules bought by the caller. */
const optional = ['status-index','expiry','recovery','change-stream'];
export function prepare(config, features = []) {
  if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('configuration_required');
  if (Object.keys(config).some(key => !['language','table_name'].includes(key))) throw new Error('unknown_configuration_field');
  if (config.language !== 'javascript') throw new Error(config.language ? 'unsupported_language' : 'explicit_language_required');
  if (typeof config.table_name !== 'string' || !/^[A-Za-z0-9_.-]{3,255}$/.test(config.table_name)) throw new Error('invalid_table_name');
  if (!Array.isArray(features) || [...features].some(feature => !feature || !optional.includes(feature.id) || typeof feature.apply !== 'function')
      || new Set(features.map(feature => feature.id)).size !== features.length) throw new Error('invalid_feature_modules');
  const implementations = new Map(features.map(feature => [feature.id,feature]));
  const selected = ['table',...implementations.keys()];
  const TableName = config.table_name;
  const input = {TableName,BillingMode:'PAY_PER_REQUEST',
    AttributeDefinitions:[{AttributeName:'agent_id',AttributeType:'S'},{AttributeName:'session_id',AttributeType:'S'}],
    KeySchema:[{AttributeName:'agent_id',KeyType:'HASH'},{AttributeName:'session_id',KeyType:'RANGE'}],
    SSESpecification:{Enabled:true,SSEType:'KMS'}};
  const steps = [{id:'create',operation:'CreateTable',input},
    {id:'active',operation:'DescribeTable',input:{TableName},depends_on:['create'],wait_for:{path:'Table.TableStatus',equals:'ACTIVE',timeout_seconds:600,poll_seconds:5}}];
  const checks = {'Table.TableStatus':'ACTIVE','Table.TableName':TableName,
    'Table.BillingModeSummary.BillingMode':'PAY_PER_REQUEST',
    'Table.AttributeDefinitions':input.AttributeDefinitions.map(value => ({...value})),
    'Table.KeySchema':input.KeySchema.map(value => ({...value})),
    'Table.SSEDescription.Status':'ENABLED','Table.SSEDescription.SSEType':'KMS'};
  const verification = [{operation:'DescribeTable',input:{TableName},checks}];
  for (const id of optional) if (implementations.has(id)) implementations.get(id).apply({TableName,input,steps,checks,verification});
  return {schema_version:'1',sku:'AWS-0568',target:'aws-dynamodb-api',components:[...selected].sort(),steps,verification,
    execution:'buyer-controlled',recovery:'Inspect existing table configuration after a lost response. Do not treat a name collision as proof that the intended table was created.'};
}
