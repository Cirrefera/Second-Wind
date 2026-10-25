import { Stack, Duration, aws_bedrockagentcore as agentcore } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'AgentCoreStack'): Stack {
  const stack = new Stack(scope, id);
  new agentcore.Memory(stack, 'Memory', {
    memoryName: 'sessionMemory',
    expirationDuration: Duration.days(30),
  });
  return stack;
}
