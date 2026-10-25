import { Stack, aws_lambda as lambda, aws_apigateway as apigw } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'RestApiStack'): Stack {
  const stack = new Stack(scope, id);
  const handler = new lambda.Function(stack, 'Handler', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler=async()=>({statusCode:200})'),
  });
  new apigw.LambdaRestApi(stack, 'Api', {
    handler,
    proxy: true,
    deployOptions: { stageName: 'v1', tracingEnabled: true },
  });
  return stack;
}
