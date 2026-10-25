import { createRequestLogger, logRequest } from './src/logger.mjs';

const SLUG = 'lambda-powertools-logger-ts';

/** Runs the purchased Logger helper with a synthetic request ID and no event payload. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.service_name !== 'string'
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  const previous = process.env.POWERTOOLS_DEV;
  const originals = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(key => [key, console[key]]));
  let outputCount = 0;
  try {
    process.env.POWERTOOLS_DEV = 'true';
    for (const key of Object.keys(originals)) console[key] = () => { outputCount++; };
    const logger = createRequestLogger(configuration);
    logRequest(logger, { awsRequestId: 'protected-preview' }, 'preview');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: outputCount, diagnostic_codes: [], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  } finally {
    for (const [key, original] of Object.entries(originals)) console[key] = original;
    if (previous === undefined) delete process.env.POWERTOOLS_DEV; else process.env.POWERTOOLS_DEV = previous;
  }
}
