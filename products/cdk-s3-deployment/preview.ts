import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { buildStack } from './product.js';

export function preview(configuration: Record<string, unknown> = {}) {
  try {
    const app = new App();
    const stack = buildStack(app, 'ProtectedPreviewStack');
    const resources = Object.values((Template.fromStack(stack).toJSON().Resources ?? {}) as Record<string, any>);
    return { ok: true, resource_count: resources.length, bucket_deployments: resources.filter((resource: any) => resource.Type === 'Custom::CDKBucketDeployment').length };
  } catch {
    return { ok: false, error_code: 'preview_failed' };
  }
}
