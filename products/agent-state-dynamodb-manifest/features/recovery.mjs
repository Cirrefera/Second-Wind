export const feature = {id:'recovery',apply({TableName,steps,verification}) {
  steps.push({id:'recovery',operation:'UpdateContinuousBackups',input:{TableName,PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true}},depends_on:['active']});
  verification.push({operation:'DescribeContinuousBackups',input:{TableName},checks:{'ContinuousBackupsDescription.ContinuousBackupsStatus':'ENABLED','ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus':'ENABLED'}});
}};
