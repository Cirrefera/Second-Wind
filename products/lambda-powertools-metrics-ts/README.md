# Powertools Metrics for Lambda (TypeScript/JavaScript)

Record count metrics with the actual Powertools Metrics implementation and flush them as CloudWatch Embedded Metric Format (EMF) JSON. CloudWatch extracts EMF asynchronously from the Lambda log stream; this helper does not call `PutMetricData`.

## Install and use

Install `@aws-lambda-powertools/metrics` at exactly 2.36.0 and run in Node.js 20 or newer in Lambda.

```js
import { createMetrics, recordCount, flushMetrics } from './src/metrics.mjs';
const metrics = createMetrics({ namespace: 'Payments', service_name: 'capture' });
export const handler = async (event) => {
  try {
    recordCount(metrics, 'PaymentAccepted');
    return { statusCode: 200 };
  } finally {
    flushMetrics(metrics);
  }
};
```

Use low-cardinality dimensions such as environment or service. Do not put customer IDs, request IDs, or other high-cardinality values in dimensions; use metadata when appropriate. Powertools enforces EMF metric and dimension limits. `publishStoredMetrics()` writes to stdout; it is not proof CloudWatch has ingested the document.

## Hosted preview and boundary

Hosted preview is unavailable. The gateway package has no exact Powertools Commons dependency graph and the library's Node console output behavior has not been exercised in the private Workerd sandbox. No hosted result claims EMF emission or CloudWatch ingestion.

## Files and source

Original integration code is Apache-2.0. Powertools Metrics 2.36.0 is MIT-0; its pinned repository revision and published tarball integrity are recorded in `source-provenance.json`.
