export const feature={id:'recovery',apply({steps,verification,TableName}) {
  steps.push({id:'recovery',operation:'UpdateContinuousBackups',input:{TableName,PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true}},depends_on:['active']});
  verification.push({operation:'DescribeContinuousBackups',input:{TableName},checks:{'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus':'ENABLED'}});
}};
