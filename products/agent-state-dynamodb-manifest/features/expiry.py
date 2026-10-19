def apply(state):
    name = state['TableName']
    state['steps'].append({'id': 'expiry', 'operation': 'UpdateTimeToLive', 'input': {'TableName': name, 'TimeToLiveSpecification': {'AttributeName': 'expires_at', 'Enabled': True}}, 'depends_on': ['active']})
    state['verification'].append({'operation': 'DescribeTimeToLive', 'input': {'TableName': name}, 'checks': {'TimeToLiveDescription.TimeToLiveStatus': 'ENABLED', 'TimeToLiveDescription.AttributeName': 'expires_at'}})


feature = {'id': 'expiry', 'apply': apply}
