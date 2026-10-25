"""Private offline Chalice analysis; never execute the application or call AWS."""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SLUG = 'chalice-automatic-iam-policy-generator'


def _reject_send(**kwargs):
    raise RuntimeError('offline_preview_network_forbidden')


def preview(configuration=None, selected_components=None):
    if (not isinstance(configuration, dict)
            or set(configuration) - {'language', 'stage'}
            or configuration.get('language') != 'python'
            or not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', configuration.get('stage', 'dev'))
            or selected_components not in (None, [])):
        return {'slug': SLUG, 'ok': False, 'status': 'invalid',
                'diagnostic_codes': ['configuration_invalid']}
    try:
        import botocore.session
        from chalice.analyzer import get_client_calls_for_app
        from chalice.policy import PolicyBuilder
    except ImportError:
        return {'slug': SLUG, 'ok': False, 'status': 'unavailable',
                'diagnostic_codes': ['dependency_unavailable']}

    # Chalice's CLI uses this same analyzer and PolicyBuilder. Supply an
    # isolated SDK session because the builder constructs clients solely to
    # inspect their method/API metadata. These are inert placeholders, never
    # account credentials; no credential provider or profile is needed.
    session = botocore.session.Session()
    session.set_config_variable('config_file', os.devnull)
    session.set_config_variable('credentials_file', os.devnull)
    session.set_config_variable('profile', None)
    session.set_credentials('offline-preview', 'offline-preview')
    session.register('before-send.*.*', _reject_send)
    source = (ROOT / 'app.py').read_text(encoding='utf-8')
    calls = get_client_calls_for_app(source)
    policy = PolicyBuilder(session=session).build_policy_from_api_calls(calls)
    statements = policy['Statement']
    action_count = sum(len(statement.get('Action', [])) for statement in statements)
    return {'slug': SLUG, 'ok': True, 'status': 'valid',
            'policy_count': len(statements), 'action_count': action_count,
            'diagnostic_codes': []}


def main():
    try:
        result = preview(json.loads(sys.stdin.read()), [])
    except (ValueError, TypeError):
        result = {'slug': SLUG, 'ok': False, 'status': 'invalid',
                  'diagnostic_codes': ['configuration_invalid']}
    except Exception:
        # This is the private result boundary: never expose source or raw SDK
        # exceptions to a buyer. Local analysis errors are not service results.
        result = {'slug': SLUG, 'ok': False, 'status': 'unavailable',
                  'diagnostic_codes': ['validation_failed']}
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    main()
