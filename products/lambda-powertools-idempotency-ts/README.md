# Powertools Idempotency for Lambda (TypeScript/JavaScript)

Wrap a Lambda business handler with the actual Powertools Idempotency utility and DynamoDB persistence layer. Choose a stable business key in the event (such as `body.orderId`); Lambda request IDs change across retries and are unsuitable as idempotency keys.

## Install and use

Install these exact direct versions: Powertools Idempotency 2.36.0 and AWS SDK DynamoDB client 3.1156.0. Run Node.js 20 or newer in Lambda. Create a DynamoDB table with a string partition key named `id`; the Lambda role needs `dynamodb:GetItem`, `PutItem`, `UpdateItem`, and `DeleteItem` on that table.

```js
import { makeDynamoIdempotent } from './src/idempotency.mjs';

async function chargeOrder(event) {
  const { orderId, amount } = event.body;
  return chargeCustomer({ orderId, amount, idempotencyKey: orderId });
}
export const handler = makeDynamoIdempotent(chargeOrder, {
  table_name: process.env.IDEMPOTENCY_TABLE,
  event_key_jmespath: 'body.orderId',
  payload_validation_jmespath: 'body.[customerId,amount,currency]',
  expires_after_seconds: 3600,
});
```

Powertools stores the completed response in DynamoDB and can replay it for a duplicate. It cannot make an external payment provider atomic with DynamoDB. If the provider succeeds and Lambda fails before the idempotency result is persisted, a retry may call the provider again. Pass the same business key to a provider that supports idempotency and reconcile uncertain outcomes.

## Native private preview and boundary

`preview.mjs` runs the real Powertools DynamoDB persistence layer and idempotency wrapper twice using real AWS SDK command objects whose `send` method is replaced with a fixed in-memory DynamoDB command fixture. The fixture exercises local idempotency logic and duplicate replay; it does not contact or verify DynamoDB, durable storage, IAM, or cross-Lambda coordination. The result carries `local_fixture_only` for this reason.

## Files and source

Original integration code is Apache-2.0. Powertools Idempotency 2.36.0 and its `@aws-lambda-powertools/jmespath` dependency are MIT-0; exact source revision and npm integrity are listed in `source-provenance.json`.
