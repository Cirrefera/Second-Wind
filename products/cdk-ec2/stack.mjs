import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-ec2', { env: config.env });
  const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 2, natGateways: 1 });
  const sg = new ec2.SecurityGroup(stack, 'InstanceSecurityGroup', { vpc, allowAllOutbound: false, description: 'No inbound access; add reviewed rules explicitly' });
  new ec2.Instance(stack, 'Instance', { vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), machineImage: ec2.MachineImage.latestAmazonLinux2023(), securityGroup: sg, requireImdsv2: true, blockDevices: [{ deviceName: '/dev/xvda', volume: ec2.BlockDeviceVolume.ebs(8, { encrypted: true, deleteOnTermination: true }) }] });
  return stack;
}
