# Retries double charge customers

Use this guidance when a Python Lambda handler can receive a logical payment more than once. This release supports **Python only**, tested with Python 3.12, Powertools 3.36.0 and boto3 1.43.114. Explicitly select `target_language: "python"` when resolving this product and `language="python"` when constructing the example. Other languages require a separately implemented and tested variant. The v1 catalog guidance's TypeScript, Java and .NET examples are retained in history, outside this release's supported contract.

The example accepts a **decoded JSON object** whose `body` has globally unique `orderId`, `customerId`, positive integer `amount` in your processor's minor units, and uppercase three-letter `currency`. Decode and authenticate an API Gateway body before calling it. The handler is for one payment event per invocation. It does not implement SQS batch failure reporting, event authentication or a payment processor.

## Prepare the state table

Use an existing reviewed table or create a new one using your own AWS role:

```sh
aws dynamodb create-table --table-name IdempotencyTable \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
aws dynamodb wait table-exists --table-name IdempotencyTable
aws dynamodb update-time-to-live --table-name IdempotencyTable \
  --time-to-live-specification Enabled=true,AttributeName=expiration
```

Inspect the table after the waiter succeeds and before using it. These commands incur your own AWS resource charges. TTL removes old records asynchronously. Powertools evaluates record expiration itself; TTL deletion timing does not define the deduplication window.

The Lambda role needs these table actions. Replace `REGION` and `ACCOUNT_ID` with your own values and keep the exact table ARN. This policy does not create a role or a table:

```json
{"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem"],"Resource":"arn:aws:dynamodb:REGION:ACCOUNT_ID:table/IdempotencyTable"}
```

## Wire the logical payment

Install the tested dependency versions:

```sh
pip install aws-lambda-powertools==3.36.0 boto3==1.43.114
```

Place the following in `example.py`. It validates required business fields before persistence or payment, keys on `body.orderId`, rejects a duplicate with changed customer/amount/currency, and passes the same durable business key to your downstream payment function:

```python
{{EXAMPLE}}
```

Construct the handler once during initialization:

```python
from example import build_handler
from your_payments import charge_customer
handler = build_handler(language='python', table_name='IdempotencyTable',
                        charge_customer=charge_customer,
                        expires_after_seconds=3600)
```

`charge_customer` must accept the shown keyword arguments, enforce the supplied `idempotency_key` at the payment provider, and return a small JSON-serializable result. Use an order ID that is globally unique for this logical payment; when tenant or operation boundaries require a composite key, normalize that business key before this handler. A Lambda request ID changes on retry and is unsuitable.

## Understand the failure boundary

A completed duplicate inside the configured window replays the saved response. An in-flight duplicate raises `IdempotencyAlreadyInProgressError`; propagate or map that to a retryable outcome appropriate to your caller. Payload changes raise `IdempotencyValidationError` and need investigation. Missing or malformed business fields fail before payment. Do not swallow these errors and return a success response.

Powertools does **not** provide an atomic transaction with an external payment provider. If a provider accepted a charge but the handler failed before completion was persisted, a retry can execute the payment function again. The example's test demonstrates this failure explicitly. Reuse the business key at a provider that offers durable idempotency, and reconcile an uncertain provider outcome before initiating a new charge. Moving an email before or after the charge does not by itself solve this problem.

After the configured record expiration, the same logical event can execute again. Choose the window from the entire redelivery, redrive and manual replay horizon of your workload and the payment provider's key-retention policy. A one-hour value is a sample, not a universal safe setting. Failed execution releases its record so a retry may run. Timeout and in-progress expiry require application-level recovery; never treat an old INPROGRESS record as proof that no external effect happened.

The returned response is stored in DynamoDB. Return the minimum result you need, avoid secrets, and apply your normal table encryption, retention and access controls. Payload validation compares selected request fields; it does not encrypt or remove stored response data.

## Verify before using real payments

With a fake payment function, invoke twice using the same decoded event and different Lambda request IDs:

```json
{"body":{"orderId":"TEST-1","customerId":"TEST-CUSTOMER","amount":100,"currency":"USD"}}
```

Confirm one completed payment call and equal responses. Then test changed amount, missing key, an overlapping duplicate, an expired record, and a failure after an external effect. Inspect both the idempotency state and your provider's state. These are separate observations.

The checked-in seven-case test runs the actual Powertools decorator and DynamoDB adapter against fake DynamoDB I/O. It verifies completed replay, payload mismatch, malformed inputs, in-flight duplicate rejection, post-effect failure retry, expiration and explicit language selection. It performs no AWS calls and no payment operation. A passing offline test does not establish that your IAM, table, network, event adapter or payment provider works in your AWS account.

## Attribution and source boundary

This corrected guidance and wiring example are original Second Wind work under Apache-2.0. They depend on the separately installed Powertools Python package (MIT-0). The source record pins the upstream repository revision and inspected interface/example file hashes. No Powertools implementation is vendored into the paid guidance.

- https://github.com/aws-powertools/powertools-lambda-python
- https://docs.powertools.aws.dev/lambda/python/latest/utilities/idempotency/
- https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html

This is version 2. Historical version 1 guidance and existing purchase records remain preserved separately.
