import { Stack, aws_iam as iam } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'IamStack'): Stack {
  const stack = new Stack(scope, id);
  const role = new iam.Role(stack, 'WorkerRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });
  role.addToPolicy(new iam.PolicyStatement({
    actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: ['arn:aws:logs:*:*:log-group:/aws/lambda/worker:*'],
  }));
  return stack;
}
