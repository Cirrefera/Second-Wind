import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

const SERVICE = /^[A-Za-z0-9_.-]{1,64}$/;
const METRIC = /^[A-Za-z][A-Za-z0-9_.-]{0,254}$/;

export function createMetrics({ namespace, service_name, default_dimensions = {} } = {}) {
  if (typeof namespace !== 'string' || !namespace.trim() || namespace.length > 255) throw new Error('invalid_namespace');
  if (typeof service_name !== 'string' || !SERVICE.test(service_name)) throw new Error('invalid_service_name');
  if (!default_dimensions || Array.isArray(default_dimensions) || typeof default_dimensions !== 'object'
      || Object.keys(default_dimensions).length > 8
      || Object.values(default_dimensions).some(value => typeof value !== 'string' || value.length > 250)) {
    throw new Error('invalid_default_dimensions');
  }
  return new Metrics({ namespace, serviceName: service_name, defaultDimensions: default_dimensions });
}

export function recordCount(metrics, name, value = 1) {
  if (!metrics || typeof metrics.addMetric !== 'function') throw new Error('metrics_instance_required');
  if (typeof name !== 'string' || !METRIC.test(name)) throw new Error('invalid_metric_name');
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('invalid_metric_value');
  metrics.addMetric(name, MetricUnit.Count, value);
}

/** Emits an EMF JSON document to stdout; CloudWatch ingestion is asynchronous. */
export function flushMetrics(metrics) {
  if (!metrics || typeof metrics.publishStoredMetrics !== 'function') throw new Error('metrics_instance_required');
  metrics.publishStoredMetrics();
}
