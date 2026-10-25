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

## Protected preview and boundary

The protected JavaScript preview bundles the exact Powertools Batch 2.36.0 dependency closure and runs its real `BatchProcessor` and `processPartialResponse` in the private Worker Loader. It supplies two synthetic SQS-shaped records, with one deliberately failing record, and returns only the partial-failure count. The preview never calls SQS or Lambda and does not assert service behavior. The hosted build disables Powertools' Node-only multi-invocation `AsyncLocalStorage` branch; each preview invocation uses the library's single-invocation store. The native delivered module remains the supported Node.js Lambda integration.

## Files and source

Original integration code is Apache-2.0. The bundled Powertools Batch 2.36.0 and Commons dependency closure is MIT-0; see `LICENSE-Powertools-MIT-0`. The pinned repository revision, published npm integrity, and preview bundle hash are recorded in `source-provenance.json`.
