"""Original Second Wind planner. No SDK, subprocess, credentials or network calls."""
import re

OPTIONAL = ('status-index', 'expiry', 'recovery', 'change-stream')


def prepare(config, features=()):
    if not isinstance(config, dict):
        raise ValueError('configuration_required')
    if set(config) - {'language', 'table_name'}:
        raise ValueError('unknown_configuration_field')
    if config.get('language') != 'python':
        raise ValueError('unsupported_language' if config.get('language') else 'explicit_language_required')
    table_name = config.get('table_name')
    if not isinstance(table_name, str) or re.fullmatch(r'[A-Za-z0-9_.-]{3,255}', table_name) is None:
        raise ValueError('invalid_table_name')
    if not isinstance(features, (list, tuple)) or any(not isinstance(feature, dict) or feature.get('id') not in OPTIONAL or not callable(feature.get('apply')) for feature in features):
        raise ValueError('invalid_feature_modules')
    implementations = {feature['id']: feature['apply'] for feature in features}
    if len(implementations) != len(features):
        raise ValueError('invalid_feature_modules')
    selected = ['table', *implementations]
    request = {'TableName': table_name, 'BillingMode': 'PAY_PER_REQUEST',
               'AttributeDefinitions': [{'AttributeName': 'agent_id', 'AttributeType': 'S'}, {'AttributeName': 'session_id', 'AttributeType': 'S'}],
               'KeySchema': [{'AttributeName': 'agent_id', 'KeyType': 'HASH'}, {'AttributeName': 'session_id', 'KeyType': 'RANGE'}],
               'SSESpecification': {'Enabled': True, 'SSEType': 'KMS'}}
    steps = [{'id': 'create', 'operation': 'CreateTable', 'input': request},
             {'id': 'active', 'operation': 'DescribeTable', 'input': {'TableName': table_name}, 'depends_on': ['create'],
              'wait_for': {'path': 'Table.TableStatus', 'equals': 'ACTIVE', 'timeout_seconds': 600, 'poll_seconds': 5}}]
    checks = {'Table.TableStatus': 'ACTIVE', 'Table.TableName': table_name, 'Table.BillingModeSummary.BillingMode': 'PAY_PER_REQUEST',
              'Table.AttributeDefinitions': [dict(value) for value in request['AttributeDefinitions']],
              'Table.KeySchema': [dict(value) for value in request['KeySchema']],
              'Table.SSEDescription.Status': 'ENABLED', 'Table.SSEDescription.SSEType': 'KMS'}
    verification = [{'operation': 'DescribeTable', 'input': {'TableName': table_name}, 'checks': checks}]
    state = {'TableName': table_name, 'input': request, 'steps': steps, 'checks': checks, 'verification': verification}
    for name in OPTIONAL:
        if name in implementations:
            implementations[name](state)
    return {'schema_version': '1', 'sku': 'AWS-0568', 'target': 'aws-dynamodb-api', 'components': sorted(selected),
            'steps': steps, 'verification': verification, 'execution': 'buyer-controlled',
            'recovery': 'Inspect existing table configuration after a lost response. Do not treat a name collision as proof that the intended table was created.'}
