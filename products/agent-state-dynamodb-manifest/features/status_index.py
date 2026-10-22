def apply(state):
    request, checks = state['input'], state['checks']
    request['AttributeDefinitions'].append({'AttributeName': 'status', 'AttributeType': 'S'})
    request['GlobalSecondaryIndexes'] = [{'IndexName': 'status-index', 'KeySchema': [{'AttributeName': 'status', 'KeyType': 'HASH'}, {'AttributeName': 'session_id', 'KeyType': 'RANGE'}], 'Projection': {'ProjectionType': 'KEYS_ONLY'}}]
    checks['Table.AttributeDefinitions'] = [dict(value) for value in request['AttributeDefinitions']]
    checks['Table.GlobalSecondaryIndexes'] = [{'IndexName': 'status-index', 'IndexStatus': 'ACTIVE', 'KeySchema': [dict(value) for value in request['GlobalSecondaryIndexes'][0]['KeySchema']], 'Projection': {'ProjectionType': 'KEYS_ONLY'}}]


feature = {'id': 'status-index', 'apply': apply}
