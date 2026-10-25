"""Exercise the real Chalice application locally; do not package or deploy it."""
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SLUG = 'chalice-rest-api-decorator-pattern'


def preview(configuration=None, selected_components=None):
    if (not isinstance(configuration, dict)
            or set(configuration) - {'language', 'stage'}
            or configuration.get('language') != 'python'
            or not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', configuration.get('stage', 'dev'))
            or selected_components not in (None, [])):
        return {'slug': SLUG, 'ok': False, 'status': 'invalid',
                'diagnostic_codes': ['configuration_invalid']}
    spec = importlib.util.spec_from_file_location('protected_rest_app', ROOT / 'app.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = module.app
    verified = 0
    # Synthetic API Gateway events exercise Chalice routing and the purchased
    # handler. API Gateway IAM authentication is outside this local preview.
    for resource_id, expected_status in [('preview-resource', 200), ('x' * 129, 400)]:
        event = {
            'resource': '/resources/{resource_id}', 'path': '/resources/' + resource_id,
            'httpMethod': 'GET', 'headers': {}, 'queryStringParameters': None,
            'multiValueQueryStringParameters': None,
            'pathParameters': {'resource_id': resource_id},
            'requestContext': {'resourcePath': '/resources/{resource_id}',
                               'httpMethod': 'GET', 'stage': configuration.get('stage', 'dev'),
                               'identity': {}},
            'body': None, 'isBase64Encoded': False, 'stageVariables': None,
        }
        response = app(event, None)
        if response.get('statusCode') != expected_status:
            raise RuntimeError('route_validation_failed')
        verified += 1
    return {'slug': SLUG, 'ok': True, 'status': 'valid',
            'route_count': sum(len(methods) for methods in app.routes.values()),
            'verification_count': verified, 'diagnostic_codes': []}


def main():
    try:
        result = preview(json.loads(sys.stdin.read()), [])
    except (ValueError, TypeError):
        result = {'slug': SLUG, 'ok': False, 'status': 'invalid',
                  'diagnostic_codes': ['configuration_invalid']}
    except Exception:
        result = {'slug': SLUG, 'ok': False, 'status': 'unavailable',
                  'diagnostic_codes': ['validation_failed']}
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    main()
