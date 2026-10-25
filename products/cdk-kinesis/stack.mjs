import * as cdk from 'aws-cdk-lib';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-kinesis', { env: config.env });
  new kinesis.Stream(stack, 'Events', { streamName: config.streamName ?? 'app-events', streamMode: kinesis.StreamMode.ON_DEMAND, retention: cdk.Duration.hours(config.retentionHours ?? 24), encryption: kinesis.StreamEncryption.MANAGED, enforceSSL: true });
  return stack;
}
