import { Stack, aws_bedrock as bedrock } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'BedrockStack'): Stack {
  const stack = new Stack(scope, id);
  new bedrock.CfnGuardrail(stack, 'Guardrail', {
    name: 'review-guardrail',
    blockedInputMessaging: 'Input blocked by policy.',
    blockedOutputsMessaging: 'Output blocked by policy.',
  });
  return stack;
}
