import { App, Stack, RemovalPolicy } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { fileURLToPath } from 'node:url';

export function createStack(app, { configuration: c, prebuiltHandlers }) {
  if (!c || !/^https:\/\/[A-Za-z0-9.-]+$/.test(c.allowed_origin)
      || !/^[A-Za-z][A-Za-z0-9-]{1,62}$/.test(c.stack_name)
      || !/^\d{12}$/.test(c.account) || !c.region) throw new Error('invalid_configuration');
  const stack = new Stack(app, c.stack_name, { env: { account: c.account, region: c.region } });
  const table = new dynamodb.Table(stack, 'Items', {
    partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
    pointInTimeRecovery: true,
  });
  const handler = (file, id) => new NodejsFunction(stack, id, {
    entry: fileURLToPath(new URL(`./handlers/${file}.mjs`, import.meta.url)),
    handler: prebuiltHandlers ? 'index.handler' : 'handler', runtime: Runtime.NODEJS_20_X,
    ...(prebuiltHandlers ? {code: Code.fromInline(prebuiltHandlers[file])} : {}),
    environment: { TABLE_NAME: table.tableName, ALLOWED_ORIGIN: c.allowed_origin },
    bundling: { minify: true, sourceMap: false },
  });
  const create = handler('create', 'CreateItem');
  const getOne = handler('get-one', 'GetItem');
  const getAll = handler('get-all', 'GetItems');
  const update = handler('update-one', 'UpdateItem');
  const remove = handler('delete-one', 'DeleteItem');
  table.grantWriteData(create);
  table.grantReadData(getOne);
  table.grantReadData(getAll);
  table.grantReadWriteData(update);
  table.grantReadWriteData(remove);
  const api = new apigateway.RestApi(stack, 'ItemsApi', {
    restApiName: c.api_name,
    defaultCorsPreflightOptions: {
      allowOrigins: [c.allowed_origin],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    },
  });
  const items = api.root.addResource('items');
  items.addMethod('POST', new apigateway.LambdaIntegration(create));
  items.addMethod('GET', new apigateway.LambdaIntegration(getAll));
  const item = items.addResource('{id}');
  item.addMethod('GET', new apigateway.LambdaIntegration(getOne));
  item.addMethod('PUT', new apigateway.LambdaIntegration(update));
  item.addMethod('DELETE', new apigateway.LambdaIntegration(remove));
  return stack;
}

export function synthesize(configuration) {
  const app = new App({ analyticsReporting: false });
  createStack(app, { configuration });
  return app.synth();
}
