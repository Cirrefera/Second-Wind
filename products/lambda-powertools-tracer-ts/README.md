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

The private preview.mjs bundle runs the purchased createTracing helper, the pinned Powertools handler middleware, and real X-Ray Segment/Subsegment objects on a synthetic, unsampled request. It verifies that the configured service annotation is attached, the handler subsegment closes and restores its parent, and response capture remains disabled. Readable preview.source.mjs contains the fixture source. A request-local CommonJS factory defers X-Ray dependency initialization until a Worker request exists; the dependency logic and real Node builtins are preserved.

The middleware hooks in this pinned version are synchronous, so their complete lifecycle stays inside the real CLS namespace run scope. The fixture's segment is unsampled and no trace is sent to a daemon, Lambda or AWS. This does not verify live AWS SDK instrumentation, X-Ray ingestion, credentials, IAM, or Lambda behavior. The bounded result carries local_fixture_only.

## Files and source

Original Second Wind integration code is Apache-2.0. It uses Powertools Tracer 2.36.0, MIT-0, from [the pinned upstream repository revision](https://github.com/aws-powertools/powertools-lambda-typescript/tree/0595159ed90c72cc9a004a98923b9778b876726a/packages/tracer). Exact npm package integrity is in `source-provenance.json`.
