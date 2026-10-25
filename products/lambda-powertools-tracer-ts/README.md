# Powertools Tracer for Lambda (TypeScript/JavaScript)

Use Powertools Tracer to capture a Lambda handler and instrument AWS SDK v3 clients for AWS X-Ray. The helper disables response capture so handler output is not copied into trace metadata by default.

## Install and use

Install the exact direct dependency with `npm install`. Powertools Tracer brings its pinned Commons, AWS Lambda Invoke Store, and AWS X-Ray SDK dependencies. Run on Node.js 20 or newer in Lambda; enable active tracing on the function and grant the Lambda execution role the required X-Ray write actions.

```js
import middy from '@middy/core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createTracing } from './src/tracer.mjs';

const tracing = createTracing({ service_name: 'orders' });
const dynamodb = tracing.captureAwsV3Client(new DynamoDBClient({}));
const handler = middy(async () => {
  // Use dynamodb.send(command) inside the handler.
  return { statusCode: 200 };
}).use(tracing.middleware);
export { handler };
```

The package does not install Middy or an AWS service client for you. Use the service-specific SDK client you already need and pin it in your application lockfile. Do not add secrets, full payloads, or personal data as X-Ray annotations. Tracing is not enabled until Lambda active tracing and IAM are configured.

## Native private preview and boundary

`preview.mjs` calls the actual Powertools Tracer middleware around a synthetic handler request and an in-memory X-Ray segment fixture. It verifies middleware open/close behavior only; the fixture does not create or send an AWS X-Ray trace. Hosted preview remains unavailable because the gateway Worker Loader does not provide the native Node/X-Ray runtime.

## Files and source

Original Second Wind integration code is Apache-2.0. It uses Powertools Tracer 2.36.0, MIT-0, from [the pinned upstream repository revision](https://github.com/aws-powertools/powertools-lambda-typescript/tree/0595159ed90c72cc9a004a98923b9778b876726a/packages/tracer). Exact npm package integrity is in `source-provenance.json`.
