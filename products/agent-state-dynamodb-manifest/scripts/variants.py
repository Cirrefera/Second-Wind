"""Execute each real Python feature selection; never shells out to JavaScript."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from planner import prepare
from features.status_index import feature as status
from features.expiry import feature as expiry
from features.recovery import feature as recovery
from features.change_stream import feature as stream

modules = [status, expiry, recovery, stream]
plans = []
rejections = 0


def reject(config, features=()):
    global rejections
    try:
        prepare(config, features)
    except ValueError:
        rejections += 1
    else:
        raise AssertionError('invalid configuration was accepted')


for mask in range(16):
    chosen = [feature for index, feature in enumerate(modules) if mask & (1 << index)]
    config = {'language': 'python', 'table_name': 'agent-state-test'}
    result = prepare(config, chosen)
    assert result == prepare(config, list(reversed(chosen)))
    plans.append(result)
    for feature in chosen:
        assert feature['id'] not in prepare(config, [f for f in chosen if f is not feature])['components']
base = {'language': 'python', 'table_name': 'agent-state-test'}
for language in (None, '', 'javascript', 'java', 'typescript'):
    reject({**base, 'language': language})
for components in (None, [], ['table', None], ['table', {}], ['table', 'table'], ['table', 'other'], ['expiry']):
    reject({**base, 'components': components})
for name in ('ab', 'a' * 256, 'has space', 'valid\n', 'valid\r', 'valid\u2028', 'valid\u2029'):
    reject({**base, 'table_name': name})
reject({**base, 'credentials': 'secret'})
reject(base, [status, status])
reject(base, [None])
reject({**base, 'components': ['table', 'expiry']}, [expiry, expiry])
assert plans[15]['verification'][0]['checks']['Table.AttributeDefinitions'][0]['AttributeType'] == 'S'
plans[15]['steps'][0]['input']['AttributeDefinitions'][0]['AttributeType'] = 'N'
assert plans[15]['verification'][0]['checks']['Table.AttributeDefinitions'][0]['AttributeType'] == 'S'
plans[15] = prepare({'language': 'python', 'table_name': 'agent-state-test'}, modules)
print(json.dumps({'language': 'python', 'selections': plans, 'rejections': rejections}))
