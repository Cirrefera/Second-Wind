import { createTracing } from './src/tracer.mjs';
import AWSXRay from 'aws-xray-sdk-core';

const SLUG = 'lambda-powertools-tracer-ts';

/** Execute the actual middleware on a local, unsampled X-Ray segment. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.service_name !== 'string'
      || configuration.capture_response !== false
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0,
      diagnostic_codes: ['configuration_invalid'] };
  }
  const keys = ['AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME', 'AWS_XRAY_TRACING_NAME', '_X_AMZN_TRACE_ID'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const namespace = AWSXRay.getNamespace();
  const segment = new AWSXRay.Segment('protected-preview');
  // An unsampled local segment exercises construction and middleware without
  // sending to a daemon or claiming that remote X-Ray ingestion was verified.
  segment.notTraced = true;
  try {
    Object.assign(process.env, {
      AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs20.x',
      AWS_LAMBDA_FUNCTION_NAME: 'protected-preview',
      AWS_XRAY_TRACING_NAME: configuration.service_name,
      _X_AMZN_TRACE_ID: 'Root=1-65f00000-0123456789abcdef01234567;Parent=0123456789abcdef;Sampled=0',
    });
    const tracing = createTracing(configuration);
    const request = { event: {}, context: {}, internal: {}, response: { private_response: 'must-not-be-captured' } };
    // The pinned middleware hooks are synchronous. Keep their complete lifecycle
    // inside the real CLS run scope, without exiting it at an unnecessary await.
    namespace.run(() => {
      tracing.tracer.setSegment(segment);
      tracing.middleware.before(request);
      const handlerSegment = tracing.tracer.getSegment();
      if (!handlerSegment || handlerSegment === segment
          || handlerSegment.annotations?.Service !== configuration.service_name) {
        throw new Error('handler_segment_not_created');
      }
      tracing.middleware.after(request);
      if (tracing.tracer.getSegment() !== segment || !handlerSegment.end_time
          || JSON.stringify(handlerSegment.metadata ?? {}).includes('must-not-be-captured')) {
        throw new Error('trace_lifecycle_or_response_capture_invalid');
      }
    });
    return { ok: true, status: 'valid', slug: SLUG, operation_count: 1,
      verification_count: 2, diagnostic_codes: ['local_fixture_only'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0,
      diagnostic_codes: ['runtime_unavailable'] };
  } finally {
    segment.close();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
