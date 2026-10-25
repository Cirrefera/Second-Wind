import { BatchProcessor, EventType, processPartialResponse } from '@aws-lambda-powertools/batch';

export function createSqsBatchHandler(recordHandler) {
  if (typeof recordHandler !== 'function') throw new Error('record_handler_required');
  const processor = new BatchProcessor(EventType.SQS);
  return async function handler(event, context) {
    if (!event || !Array.isArray(event.Records)) throw new Error('sqs_records_required');
    return processPartialResponse(event, recordHandler, processor, { context });
  };
}

/** Parse one SQS record only after Powertools has isolated it for processing. */
export function parseJsonRecord(record) {
  if (!record || typeof record.body !== 'string') throw new Error('sqs_body_required');
  return JSON.parse(record.body);
}
