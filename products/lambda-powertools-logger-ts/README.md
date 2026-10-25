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

## Hosted preview and boundary

Hosted preview is unavailable for this release. The gateway does not have the exact Powertools transitive dependency graph staged for its private Worker Loader, and this package has not been run as a real hosted preview. The delivered module runs in the Node.js Lambda runtime after installing its pinned dependency. It does not create a function, deploy a Lambda, or configure CloudWatch.

## Files and source

See `config.schema.json` and `package.json`. Original Second Wind integration code is Apache-2.0. It imports Powertools Logger 2.36.0, MIT-0, from [the pinned upstream repository revision](https://github.com/aws-powertools/powertools-lambda-typescript/tree/0595159ed90c72cc9a004a98923b9778b876726a/packages/logger). The exact published npm tarball integrity is recorded in `source-provenance.json`.
