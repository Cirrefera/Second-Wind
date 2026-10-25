import { App, Stack } from 'aws-cdk-lib';
import { Guardrail, ContentFilterStrength, ContentFilterType, GuardrailAction } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock';

export function createStack(app, { configuration: c }) {
  if (!c || typeof c.guardrail_name !== 'string' || !Array.isArray(c.categories) || !c.categories.length) {
    throw new Error('invalid_configuration');
  }
  const allowed = new Set(Object.values(ContentFilterType));
  if (c.categories.some((entry) => !allowed.has(entry.type) || !['LOW', 'MEDIUM', 'HIGH'].includes(entry.strength))) {
    throw new Error('invalid_filter');
  }
  const stack = new Stack(app, 'BedrockGuardrailStack');
  new Guardrail(stack, 'Guardrail', {
    name: c.guardrail_name,
    description: c.description,
    blockedInputMessaging: c.blocked_input_message,
    blockedOutputsMessaging: c.blocked_output_message,
    contentFilters: c.categories.map(({ type, strength }) => ({
      type,
      inputStrength: ContentFilterStrength[strength],
      outputStrength: ContentFilterStrength[strength],
      inputAction: GuardrailAction.BLOCK,
      outputAction: GuardrailAction.BLOCK,
    })),
  });
  return stack;
}

export function synthesize(configuration) {
  const app = new App({ analyticsReporting: false });
  createStack(app, { configuration });
  return app.synth();
}
