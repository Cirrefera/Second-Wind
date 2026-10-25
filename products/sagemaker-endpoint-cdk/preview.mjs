import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { createStack } from './product.mjs';

// Trusted, private native Node preview. It synthesizes the actual product stack
// locally and returns only bounded counts; no CloudFormation template or AWS
// API call leaves this module. The gateway Worker currently cannot execute it.
export async function preview({ configuration, selected_components }) {
  let outdir;
  try {
    if (!Array.isArray(selected_components) || selected_components.length !== 1 || selected_components[0] !== 'stack') {
      return { ok: false, status: 'invalid', slug: 'sagemaker-endpoint-cdk', selected_components: [], resource_count: 0, diagnostic_codes: ['invalid_selection'] };
    }
    if (!configuration || configuration.language !== 'javascript') {
      return { ok: false, status: 'invalid', slug: 'sagemaker-endpoint-cdk', selected_components: ['stack'], resource_count: 0, diagnostic_codes: ['configuration_invalid'] };
    }
    outdir = mkdtempSync(join(tmpdir(), 'secondwind-private-cdk-preview-'));
    const app = new App({ outdir, analyticsReporting: false });
    createStack(app, { configuration, selected_components });
    const assembly = app.synth();
    const resource_count = assembly.stacks.reduce((sum, stack) => sum + Object.keys(stack.template?.Resources || {}).length, 0);
    return { ok: true, status: 'complete', slug: 'sagemaker-endpoint-cdk', selected_components: ['stack'], resource_count };
  } catch {
    return { ok: false, status: 'invalid', slug: 'sagemaker-endpoint-cdk', selected_components: ['stack'], resource_count: 0, diagnostic_codes: ['validation_failed'] };
  } finally {
    if (outdir) rmSync(outdir, { recursive: true, force: true });
  }
}
