import { createTracing } from './src/tracer.mjs';
import AWSXRay from 'aws-xray-sdk-core';

const SLUG = 'lambda-powertools-tracer-ts';

/** Runs Powertools Tracer middleware inside a local synthetic Lambda/X-Ray context. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || typeof configuration.service_name !== 'string'
      || configuration.capture_response !== false
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  const envKeys = ['AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME', 'AWS_XRAY_TRACING_NAME', '_X_AMZN_TRACE_ID'];
  const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const namespace = AWSXRay.getNamespace();
  const segment = new AWSXRay.Segment('protected-preview');
  try {
    Object.assign(process.env, {
      AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs20.x',
      AWS_LAMBDA_FUNCTION_NAME: 'protected-preview',
      AWS_XRAY_TRACING_NAME: configuration.service_name,
      _X_AMZN_TRACE_ID: 'Root=1-65f00000-0123456789abcdef01234567;Parent=0123456789abcdef;Sampled=1',
    });
    const tracing = createTracing(configuration);
    const request = { event: {}, context: {}, internal: {}, response: { statusCode: 200 } };
    await new Promise((resolve, reject) => namespace.run(async () => {
      try {
        tracing.tracer.setSegment(segment);
        await tracing.middleware.before(request);
        await tracing.middleware.after(request);
        if (tracing.tracer.getSegment() !== segment) throw new Error('xray_segment_unavailable');
        resolve();
      } catch (error) { reject(error); }
    }));
    return { ok: true, status: 'valid', slug: SLUG, operation_count: 1,
      diagnostic_codes: ['local_fixture_only'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  } finally {
    segment.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
