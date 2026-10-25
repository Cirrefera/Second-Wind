import { App, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { MonitoringFacade } from 'cdk-monitoring-constructs';

export function createStack(app, { configuration: c }) {
  if (!c || !/^arn:[^:]+:lambda:[^:]*:\d{12}:function:.+$/.test(c.lambda_function_arn)
      || typeof c.table_name !== 'string' || !c.table_name || !c.dashboard_name) {
    throw new Error('invalid_configuration');
  }
  const stack = new Stack(app, 'CloudWatchMonitoringStack');
  const lambdaFunction = lambda.Function.fromFunctionArn(stack, 'MonitoredFunction', c.lambda_function_arn);
  const table = dynamodb.Table.fromTableName(stack, 'MonitoredTable', c.table_name);
  const facade = new MonitoringFacade(stack, 'Monitoring', {
    alarmFactoryDefaults: { actionsEnabled: false, alarmNamePrefix: c.dashboard_name },
  });
  facade.monitorLambdaFunction({ lambdaFunction });
  facade.monitorDynamoTable({ table });
  return stack;
}

export function synthesize(configuration) {
  const app = new App({ analyticsReporting: false });
  createStack(app, { configuration });
  return app.synth();
}
