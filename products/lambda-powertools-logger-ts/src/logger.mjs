import { Logger } from '@aws-lambda-powertools/logger';

const LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);
const SERVICE = /^[A-Za-z0-9_.-]{1,64}$/;

export function createRequestLogger({ service_name, log_level = 'INFO' } = {}) {
  if (typeof service_name !== 'string' || !SERVICE.test(service_name)) throw new Error('invalid_service_name');
  if (!LEVELS.has(log_level)) throw new Error('invalid_log_level');
  return new Logger({ serviceName: service_name, logLevel: log_level });
}

/** Add only stable Lambda request metadata; never serialize the whole event. */
export function logRequest(logger, context, outcome = 'started') {
  if (!logger || typeof logger.appendKeys !== 'function' || typeof logger.info !== 'function') throw new Error('logger_required');
  if (!context || typeof context.awsRequestId !== 'string') throw new Error('lambda_context_required');
  logger.appendKeys({ aws_request_id: context.awsRequestId });
  logger.info('lambda_request', { outcome });
}
