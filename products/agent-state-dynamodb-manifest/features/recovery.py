def apply(state):
    name = state['TableName']
    state['steps'].append({'id': 'recovery', 'operation': 'UpdateContinuousBackups', 'input': {'TableName': name, 'PointInTimeRecoverySpecification': {'PointInTimeRecoveryEnabled': True}}, 'depends_on': ['active']})
    state['verification'].append({'operation': 'DescribeContinuousBackups', 'input': {'TableName': name}, 'checks': {'ContinuousBackupsDescription.ContinuousBackupsStatus': 'ENABLED', 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus': 'ENABLED'}})


feature = {'id': 'recovery', 'apply': apply}
