"""Exercise actual Powertools with deterministic fake DynamoDB I/O, never AWS."""
import copy
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace
import unittest
from botocore.exceptions import ClientError
from aws_lambda_powertools.utilities.idempotency.exceptions import IdempotencyAlreadyInProgressError, IdempotencyValidationError

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from example import build_handler


class DynamoDBFake:
    """I/O boundary fixture, not an AWS service behavior validation."""
    def __init__(self):
        self.items = {}
        self.calls = []

    def put_item(self, **request):
        self.calls.append(('put', request))
        key = request['Item']['id']['S']
        prior = self.items.get(key)
        if prior and int(prior['expiration']['N']) >= int(time.time()):
            raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}, 'Item': copy.deepcopy(prior)}, 'PutItem')
        self.items[key] = copy.deepcopy(request['Item'])
        return {}

    def get_item(self, **request):
        self.calls.append(('get', request))
        item = self.items.get(request['Key']['id']['S'])
        return {'Item': copy.deepcopy(item)} if item else {}

    def update_item(self, **request):
        self.calls.append(('update', request))
        item = self.items[request['Key']['id']['S']]
        for assignment in request['UpdateExpression'].removeprefix('SET ').split(', '):
            name, value = assignment.split(' = ')
            item[request['ExpressionAttributeNames'][name]] = copy.deepcopy(request['ExpressionAttributeValues'][value])
        return {}

    def delete_item(self, **request):
        self.calls.append(('delete', request))
        self.items.pop(request['Key']['id']['S'], None)
        return {}


class ExampleTests(unittest.TestCase):
    def setUp(self):
        self.client = DynamoDBFake()
        self.charges = []
        self.context = SimpleNamespace(aws_request_id='request-one', get_remaining_time_in_millis=lambda: 30000)
        self.event = {'body': {'orderId': 'ORDER-001', 'customerId': 'CUSTOMER-001', 'amount': 100, 'currency': 'USD'}}

    def payment(self, **payment):
        self.charges.append(payment)
        return {'payment_id': 'payment-1'}

    def handler(self, payment=None):
        return build_handler(language='python', table_name='IdempotencyTable', charge_customer=payment or self.payment, dynamodb_client=self.client)

    def test_completed_duplicate_replays_response_with_different_request_id(self):
        handler = self.handler()
        first = handler(self.event, self.context)
        self.context.aws_request_id = 'request-two'
        self.assertEqual(handler(self.event, self.context), first)
        self.assertEqual(len(self.charges), 1)
        self.assertEqual(self.charges[0]['idempotency_key'], 'ORDER-001')
        self.assertEqual(len(self.client.items), 1)

    def test_changed_amount_or_customer_is_rejected(self):
        handler = self.handler()
        handler(self.event, self.context)
        for key, value in [('amount', 101), ('customerId', 'other'), ('currency', 'EUR')]:
            other = copy.deepcopy(self.event)
            other['body'][key] = value
            with self.assertRaises(IdempotencyValidationError):
                handler(other, self.context)
        self.assertEqual(len(self.charges), 1)

    def test_invalid_business_fields_fail_before_persistence_or_payment(self):
        handler = self.handler()
        for key, value in [('orderId', None), ('customerId', ''), ('amount', True), ('amount', -1), ('currency', 'usd')]:
            other = copy.deepcopy(self.event)
            other['body'][key] = value
            with self.assertRaises(ValueError):
                handler(other, self.context)
        with self.assertRaises(ValueError):
            handler({'body': json.dumps(self.event['body'])}, self.context)
        self.assertEqual(self.client.calls, [])
        self.assertEqual(self.charges, [])

    def test_inflight_duplicate_propagates_retryable_error(self):
        handler = None
        def payment(**value):
            with self.assertRaises(IdempotencyAlreadyInProgressError):
                handler(self.event, self.context)
            return self.payment(**value)
        handler = self.handler(payment)
        handler(self.event, self.context)
        self.assertEqual(len(self.charges), 1)

    def test_handler_failure_allows_retry_and_cannot_undo_external_effect(self):
        def payment(**value):
            self.payment(**value)
            raise RuntimeError('lost result after external effect')
        handler = self.handler(payment)
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                handler(self.event, self.context)
        self.assertEqual(len(self.charges), 2)
        self.assertEqual(self.client.items, {})

    def test_expired_record_allows_execution_again(self):
        handler = self.handler()
        handler(self.event, self.context)
        next(iter(self.client.items.values()))['expiration'] = {'N': '1'}
        handler(self.event, self.context)
        self.assertEqual(len(self.charges), 2)

    def test_language_and_configuration_are_explicit(self):
        for language in [None, '', 'typescript', 'javascript', 'java', 'dotnet']:
            with self.assertRaises(ValueError):
                build_handler(language=language, table_name='IdempotencyTable', charge_customer=self.payment, dynamodb_client=self.client)
        with self.assertRaises(TypeError):
            build_handler(table_name='IdempotencyTable', charge_customer=self.payment, dynamodb_client=self.client)
        self.assertEqual(self.client.calls, [])


if __name__ == '__main__':
    assert {name: importlib.metadata.version(name) for name in ('aws-lambda-powertools', 'boto3', 'botocore')} == {'aws-lambda-powertools': '3.36.0', 'boto3': '1.43.114', 'botocore': '1.43.114'}, 'tested_dependency_version_mismatch'
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ExampleTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        sys.exit(1)
    report = {'sku': 'SW-PT-0006', 'version': 2, 'result': 'passed', 'tests': result.testsRun,
              'language': 'python', 'python_version': sys.version.split()[0],
              'dependencies': {name: importlib.metadata.version(name) for name in ('aws-lambda-powertools', 'boto3', 'botocore')},
              'source_hashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in ('example.py', 'requirements.txt', 'scripts/example_test.py')},
              'scope': 'Actual Powertools decorator and DynamoDB persistence adapter with deterministic fake I/O. No AWS deployment, network calls, payment processor or external exactly-once guarantee.'}
    (root / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
