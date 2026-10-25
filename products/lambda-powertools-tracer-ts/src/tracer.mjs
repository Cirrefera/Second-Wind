import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';

const SERVICE = /^[A-Za-z0-9_.-]{1,64}$/;

export function createTracing({ service_name } = {}) {
  if (typeof service_name !== 'string' || !SERVICE.test(service_name)) throw new Error('invalid_service_name');
  const tracer = new Tracer({ serviceName: service_name });
  return {
    tracer,
    /** Plug into middy(handler).use(middleware); response capture stays disabled. */
    middleware: captureLambdaHandler(tracer, { captureResponse: false }),
    captureAwsV3Client(client) {
      if (!client || typeof client.send !== 'function') throw new Error('aws_sdk_v3_client_required');
      return tracer.captureAWSv3Client(client);
    },
  };
}
