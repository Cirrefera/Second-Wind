import { Stack, aws_lambda as lambda, aws_apigatewayv2 as apigw2 } from 'aws-cdk-lib';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'HttpApiStack'): Stack {
  const stack = new Stack(scope, id);
  const handler = new lambda.Function(stack, 'Handler', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler=async()=>({statusCode:200})'),
  });
  new apigw2.HttpApi(stack, 'Api', {
    defaultIntegration: new HttpLambdaIntegration('LambdaIntegration', handler),
  });
  return stack;
}
