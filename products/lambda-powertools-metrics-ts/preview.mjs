import { createMetrics, recordCount, flushMetrics } from './src/metrics.mjs';

const SLUG = 'lambda-powertools-metrics-ts';

/** Native Node preview: exercise Powertools Metrics and parse its local EMF output. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.namespace !== 'string' || typeof configuration.service_name !== 'string'
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  const captured = [];
  const originals = Object.fromEntries(['log', 'info', 'warn', 'error'].map(key => [key, console[key]]));
  const originalWrite = process.stdout.write;
  try {
    for (const key of Object.keys(originals)) console[key] = (...args) => { captured.push(args.map(String).join(' ')); };
    process.stdout.write = (chunk, encoding, callback) => { captured.push(String(chunk)); if (typeof encoding === 'function') encoding(); else if (callback) callback(); return true; };
    const metrics = createMetrics(configuration);
    recordCount(metrics, 'ProtectedPreviewCount', 1);
    flushMetrics(metrics);
    const emf = captured.map(line => { try { return JSON.parse(line); } catch { return null; } }).find(row => row?._aws?.CloudWatchMetrics);
    if (!emf || emf.ProtectedPreviewCount !== 1) throw new Error('emf_output_missing');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: 1, diagnostic_codes: ['local_emf_output_only'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  } finally {
    process.stdout.write = originalWrite;
    for (const [key, original] of Object.entries(originals)) console[key] = original;
  }
}
