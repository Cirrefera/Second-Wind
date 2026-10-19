export const feature={id:'expiry',apply({steps,verification,TableName}) {
  steps.push({id:'expiry',operation:'UpdateTimeToLive',input:{TableName,TimeToLiveSpecification:{AttributeName:'expires_at',Enabled:true}},depends_on:['active']});
  verification.push({operation:'DescribeTimeToLive',input:{TableName},checks:{'TimeToLiveDescription.TimeToLiveStatus':'ENABLED','TimeToLiveDescription.AttributeName':'expires_at'}});
}};
