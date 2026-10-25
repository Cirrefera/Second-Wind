import { App } from 'aws-cdk-lib';
import { buildStack } from './product.js';

const app = new App();
buildStack(app, 'cdk-s3');
app.synth();
