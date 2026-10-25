import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { KubectlV32Layer } from '@aws-cdk/lambda-layer-kubectl-v32';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-eks', { env: config.env });
  const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 2, natGateways: 1 });
  const cluster = new eks.Cluster(stack, 'Cluster', { clusterName: config.clusterName ?? 'preview-eks', version: eks.KubernetesVersion.V1_32, kubectlLayer: new KubectlV32Layer(stack, 'KubectlLayer'), vpc, vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }], endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE });
  cluster.addNodegroupCapacity('Workers', { minSize: 1, desiredSize: config.nodeCount ?? 2, maxSize: 4, instanceTypes: [new ec2.InstanceType('t3.medium')] });
  return stack;
}
