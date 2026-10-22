"""Original Second Wind wiring example for Powertools Python 3.36.0.

The supplied payment function must enforce its own durable idempotency key.
This example does not implement a payment processor or a transaction spanning it.
"""
import re
from functools import wraps
from aws_lambda_powertools.utilities.idempotency import DynamoDBPersistenceLayer, IdempotencyConfig, idempotent


def build_handler(*, language, table_name, charge_customer, dynamodb_client=None, expires_after_seconds=3600):
    if language != 'python':
        raise ValueError('unsupported_language' if language else 'explicit_language_required')
    if not isinstance(table_name, str) or re.fullmatch(r'[A-Za-z0-9_.-]{3,255}', table_name) is None:
        raise ValueError('invalid_table_name')
    if not callable(charge_customer):
        raise ValueError('payment_function_required')
    if not isinstance(expires_after_seconds, int) or isinstance(expires_after_seconds, bool) or expires_after_seconds < 1:
        raise ValueError('invalid_deduplication_window')
    persistence = DynamoDBPersistenceLayer(table_name=table_name, boto3_client=dynamodb_client)
    config = IdempotencyConfig(event_key_jmespath='body.orderId',
                              payload_validation_jmespath='body.[customerId,amount,currency]',
                              raise_on_no_idempotency_key=True,
                              expires_after_seconds=expires_after_seconds)

    @idempotent(persistence_store=persistence, config=config)
    def protected(event, context):
        body = event['body']
        return charge_customer(order_id=body['orderId'], customer_id=body['customerId'],
                               amount=body['amount'], currency=body['currency'], idempotency_key=body['orderId'])

    @wraps(protected)
    def handler(event, context):
        body = event.get('body') if isinstance(event, dict) else None
        if not isinstance(body, dict):
            raise ValueError('decoded_json_body_required')
        # Validate required business fields before attempting either persistence or payment.
        if not isinstance(body.get('orderId'), str) or not 1 <= len(body['orderId']) <= 128:
            raise ValueError('business_order_id_required')
        if not isinstance(body.get('customerId'), str) or not body['customerId']:
            raise ValueError('customer_id_required')
        if not isinstance(body.get('amount'), int) or isinstance(body['amount'], bool) or body['amount'] <= 0:
            raise ValueError('positive_integer_amount_required')
        if not isinstance(body.get('currency'), str) or re.fullmatch(r'[A-Z]{3}', body['currency']) is None:
            raise ValueError('currency_required')
        return protected(event, context)

    return handler
