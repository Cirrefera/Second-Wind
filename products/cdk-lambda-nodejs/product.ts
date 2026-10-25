import { Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export function buildStack(scope: Construct, id = 'NodejsLambdaStack', code?: lambda.Code): Stack {
  const stack = new Stack(scope, id);
  new NodejsFunction(stack, 'Worker', {
    runtime: lambda.Runtime.NODEJS_22_X,
    entry: fileURLToPath(new URL('./handler.ts', import.meta.url)),
    handler: code ? 'index.handler' : 'handler',
    ...(code ? { code } : {}),
    bundling: { minify: true, sourceMap: true },
  });
  return stack;
}
