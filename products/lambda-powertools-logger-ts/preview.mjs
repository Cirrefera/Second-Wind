import { createRequestLogger, logRequest } from './src/logger.mjs';

const SLUG = 'lambda-powertools-logger-ts';

/** Native Node preview: exercise Powertools Logger with synthetic context only. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.service_name !== 'string'
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  const captured = [];
  const originals = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(key => [key, console[key]]));
  const originalWrite = process.stdout.write;
  try {
    for (const key of Object.keys(originals)) console[key] = (...args) => { captured.push(args.map(String).join(' ')); };
    process.stdout.write = (chunk, encoding, callback) => { captured.push(String(chunk)); if (typeof encoding === 'function') encoding(); else if (callback) callback(); return true; };
    const logger = createRequestLogger(configuration);
    logRequest(logger, { awsRequestId: 'protected-preview' }, 'preview');
    if (captured.length < 1) throw new Error('logger_output_missing');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: 1, diagnostic_codes: ['synthetic_lambda_context'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  } finally {
    process.stdout.write = originalWrite;
    for (const [key, original] of Object.entries(originals)) console[key] = original;
  }
}
