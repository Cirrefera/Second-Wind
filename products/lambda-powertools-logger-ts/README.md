# Powertools Logger for Lambda (TypeScript/JavaScript)

Create a structured JSON logger with a stable service name and bind only the AWS Lambda request ID to a log event. The integration uses the actual `@aws-lambda-powertools/logger` package; it does not implement a substitute logger.

## Install and use

Install the exact direct dependency with `npm install`. The upstream package brings its pinned `@aws-lambda-powertools/commons` dependency. Use Node.js 20 or newer in AWS Lambda.

```js
import { createRequestLogger, logRequest } from './src/logger.mjs';

const logger = createRequestLogger({ service_name: 'payments-api', log_level: 'INFO' });
export const handler = async (_event, context) => {
  logRequest(logger, context);
  return { statusCode: 200 };
};
```

The helper never logs the complete event or response. Do not pass secrets or personal data in `outcome`. Powertools Logger emits structured logs to the Lambda runtime's output stream; it does not configure CloudWatch retention, access policy, or redaction for fields you explicitly log.

## Native private preview and boundary

`preview.mjs` runs the actual Powertools Logger helper in Node.js with a synthetic Lambda request ID and captures the emitted JSON line before returning bounded counts. It does not log a caller event or send data to CloudWatch. Hosted preview remains unavailable because the gateway Worker Loader does not provide this package's native dependency runtime; the preview does not prove Lambda behavior.

## Files and source

See `config.schema.json` and `package.json`. Original Second Wind integration code is Apache-2.0. It imports Powertools Logger 2.36.0, MIT-0, from [the pinned upstream repository revision](https://github.com/aws-powertools/powertools-lambda-typescript/tree/0595159ed90c72cc9a004a98923b9778b876726a/packages/logger). The exact published npm tarball integrity is recorded in `source-provenance.json`.
