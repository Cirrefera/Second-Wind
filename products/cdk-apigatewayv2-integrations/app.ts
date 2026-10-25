import { App } from 'aws-cdk-lib';
import { buildStack } from './product.js';

const app = new App();
buildStack(app, 'cdk-apigatewayv2-integrations');
app.synth();
