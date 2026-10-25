import { Stack, Duration, aws_lambda as lambda } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface LambdaConfiguration { timeoutSeconds?: number }
export function buildStack(scope: Construct, id = 'LambdaStack', configuration: LambdaConfiguration = {}): Stack {
  const timeoutSeconds = configuration.timeoutSeconds;
  if (timeoutSeconds !== undefined && (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 900)) {
    throw new Error('invalid_configuration');
  }
  const stack = new Stack(scope, id);
  new lambda.Function(stack, 'Worker', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler=async()=>({statusCode:200})'),
    ...(timeoutSeconds !== undefined ? { timeout: Duration.seconds(timeoutSeconds) } : {}),
  });
  return stack;
}
