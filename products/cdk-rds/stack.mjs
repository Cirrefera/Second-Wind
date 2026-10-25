import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-rds', { env: config.env });
  const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 2, natGateways: 1 });
  const db = new rds.DatabaseInstance(stack, 'Database', { engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_3 }), instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO), vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, databaseName: config.databaseName ?? 'app', credentials: rds.Credentials.fromGeneratedSecret('appuser'), storageEncrypted: true, deletionProtection: true, publiclyAccessible: false, backupRetention: cdk.Duration.days(7), removalPolicy: cdk.RemovalPolicy.SNAPSHOT });
  return stack;
}
