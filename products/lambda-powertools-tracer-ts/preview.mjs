import { createTracing } from './src/tracer.mjs';

const SLUG = 'lambda-powertools-tracer-ts';

/** Native Node preview: exercise Powertools middleware against a local X-Ray segment fixture. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.service_name !== 'string'
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  try {
    const tracing = createTracing(configuration);
    let subsegments = 0, closed = 0, annotations = 0;
    const parent = { addNewSubsegment() { subsegments++; return { close() { closed++; } }; } };
    tracing.tracer.isTracingEnabled = () => true;
    tracing.tracer.getSegment = () => parent;
    tracing.tracer.setSegment = () => {};
    tracing.tracer.annotateColdStart = () => { annotations++; };
    tracing.tracer.addServiceNameAnnotation = () => { annotations++; };
    const request = { event: {}, context: {}, internal: {}, response: { statusCode: 200 } };
    await tracing.middleware.before(request);
    await tracing.middleware.after(request);
    if (subsegments !== 1 || closed !== 1 || annotations < 1) throw new Error('tracer_fixture_failed');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: subsegments, verification_count: closed, diagnostic_codes: ['local_xray_segment_fixture'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  }
}
