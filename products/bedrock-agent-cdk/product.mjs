import { App, Stack } from 'aws-cdk-lib';
import { Agent, BedrockFoundationModel } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock/index.js';

export function createStack(app, { configuration: c }) {
  if (!c || typeof c.agent_name !== 'string' || typeof c.instruction !== 'string'
      || c.instruction.length < 40 || typeof c.foundation_model_id !== 'string') {
    throw new Error('invalid_configuration');
  }
  const stack = new Stack(app, 'BedrockAgentStack');
  const foundationModel = BedrockFoundationModel.fromCdkFoundationModelId(
    { modelId: c.foundation_model_id }, { supportsAgents: true },
  );
  new Agent(stack, 'Agent', {
    name: c.agent_name,
    instruction: c.instruction,
    foundationModel,
    shouldPrepareAgent: c.should_prepare_agent ?? false,
    userInputEnabled: c.user_input_enabled ?? false,
    codeInterpreterEnabled: c.code_interpreter_enabled ?? false,
  });
  return stack;
}

export function synthesize(configuration) {
  const app = new App({ analyticsReporting: false });
  createStack(app, { configuration });
  return app.synth();
}
