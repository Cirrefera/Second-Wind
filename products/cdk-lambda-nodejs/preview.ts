import { App, aws_lambda as lambda } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { buildStack } from './product.js';

export function preview(configuration: Record<string, unknown> = {}, artifacts: {prebuiltHandler?: string} = {}) {
  try {
    const app = new App();
    const stack = buildStack(app, 'ProtectedPreviewStack', artifacts.prebuiltHandler === undefined
      ? undefined : lambda.Code.fromInline(artifacts.prebuiltHandler));
    const resources = Object.values((Template.fromStack(stack).toJSON().Resources ?? {}) as Record<string, any>);
    return { ok: true, resource_count: resources.length, lambda_functions: resources.filter((resource: any) => resource.Type === 'AWS::Lambda::Function').length };
  } catch {
    return { ok: false, error_code: 'preview_failed' };
  }
}
