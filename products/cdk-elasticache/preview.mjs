const SLUG = 'cdk-elasticache';
const ALLOWED = new Set(["language"]);
export async function preview({ configuration = {}, selected_components = [] } = {}) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration) || configuration.language !== 'javascript' || Object.keys(configuration).some(k => !ALLOWED.has(k) && k !== 'env')) {
    return { ok: false, status: 'invalid', slug: SLUG, resource_count: 0, diagnostic_codes: ['invalid_configuration'] };
  }
  if (!Array.isArray(selected_components) || selected_components.length !== 0) {
    return { ok: false, status: 'invalid', slug: SLUG, resource_count: 0, diagnostic_codes: ['unsupported_components'] };
  }
  try {
    const { App } = await import('aws-cdk-lib');
    const { createStack } = await import('./stack.mjs');
    const app = new App({ analyticsReporting: false });
    const stack = createStack(app, configuration);
    const template = app.synth().getStackArtifact(stack.artifactId).template;
    const resource_count = Object.keys(template.Resources ?? {}).length;
    return { ok: true, status: 'ok', slug: SLUG, resource_count, diagnostic_codes: [] };
  } catch (error) {
    const missing = /cannot find package|cannot find module|module not found/i.test(String(error?.message ?? error));
    return { ok: false, status: missing ? 'unavailable' : 'error', slug: SLUG, resource_count: 0, diagnostic_codes: [missing ? 'runtime_dependency_unavailable' : 'cdk_synthesis_failed'] };
  }
}
