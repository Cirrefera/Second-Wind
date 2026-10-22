export const feature = {id:'status-index',apply({input,checks}) {
  input.AttributeDefinitions.push({AttributeName:'status',AttributeType:'S'});
  input.GlobalSecondaryIndexes=[{IndexName:'status-index',KeySchema:[{AttributeName:'status',KeyType:'HASH'},{AttributeName:'session_id',KeyType:'RANGE'}],Projection:{ProjectionType:'KEYS_ONLY'}}];
  checks['Table.AttributeDefinitions']=input.AttributeDefinitions.map(value=>({...value}));
  checks['Table.GlobalSecondaryIndexes']=[{IndexName:'status-index',IndexStatus:'ACTIVE',KeySchema:input.GlobalSecondaryIndexes[0].KeySchema.map(value=>({...value})),Projection:{ProjectionType:'KEYS_ONLY'}}];
}};
