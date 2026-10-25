# Powertools Batch Processing for Lambda (TypeScript/JavaScript)

Process SQS records independently with Powertools BatchProcessor and return `batchItemFailures` for only the records that failed. This preserves successful records when a message needs retry.

## Install and use

Install the exact direct dependencies in `package.json`. Run Node.js 20 or newer in Lambda. Enable `ReportBatchItemFailures` on the event source mapping as well as returning the Powertools response; without both sides, Lambda retries the whole batch.

```js
import { createSqsBatchHandler, parseJsonRecord } from './src/batch.mjs';

export const handler = createSqsBatchHandler(async (record) => {
  const message = parseJsonRecord(record);
  await processOrder(message);
});
```

The record handler should throw for a retryable record failure. Do not catch an error and return normally unless the record has been handled. For FIFO queues preserve ordering and stop processing later messages after a failure; this helper targets standard SQS queues and does not configure the event source mapping.

## Hosted preview and boundary

Hosted preview is unavailable for this package. The gateway has no complete pinned Powertools dependency closure staged for the private Worker Loader. The example does not invoke Lambda, SQS, or an AWS account and makes no claim about an event source mapping.

## Files and source

Original integration code is Apache-2.0. Powertools Batch 2.36.0 is MIT-0; its exact pinned repository revision and published tarball integrity are recorded in `source-provenance.json`.
