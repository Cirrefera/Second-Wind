export const feature={id:'status-index',apply({input,verification}) {
  input.AttributeDefinitions.push({AttributeName:'status',AttributeType:'S'});
  input.GlobalSecondaryIndexes=[{IndexName:'status-index',KeySchema:[{AttributeName:'status',KeyType:'HASH'},{AttributeName:'session_id',KeyType:'RANGE'}],Projection:{ProjectionType:'KEYS_ONLY'}}];
  verification[0].checks['Table.GlobalSecondaryIndexes[?IndexName==`status-index`].IndexStatus']=['ACTIVE'];
  verification[0].checks['Table.GlobalSecondaryIndexes[?IndexName==`status-index`].KeySchema']=[input.GlobalSecondaryIndexes[0].KeySchema];
  verification[0].checks['Table.GlobalSecondaryIndexes[?IndexName==`status-index`].Projection.ProjectionType']=['KEYS_ONLY'];
}};
