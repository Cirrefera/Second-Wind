import { Stack, aws_lambda as lambda, aws_apigatewayv2 as apigw2 } from 'aws-cdk-lib';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';

export function buildStack(scope: Construct, id = 'HttpIntegrationStack'): Stack {
  const stack = new Stack(scope, id);
  const handler = new lambda.Function(stack, 'Handler', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler=async()=>({statusCode:200})'),
  });
  const api = new apigw2.HttpApi(stack, 'Api');
  api.addRoutes({
    path: '/health',
    methods: [apigw2.HttpMethod.GET],
    integration: new HttpLambdaIntegration('HealthLambda', handler),
  });
  return stack;
}
