import * as cdk from 'aws-cdk-lib';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-elasticache', { env: config.env });
  const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 2, natGateways: 1 });
  const subnetGroup = new elasticache.CfnSubnetGroup(stack, 'CacheSubnets', { description: 'Private subnets for Redis', subnetIds: vpc.privateSubnets.map(s => s.subnetId) });
  const cache = new elasticache.CfnReplicationGroup(stack, 'Redis', { replicationGroupDescription: 'Application cache', engine: 'redis', cacheNodeType: 'cache.t4g.micro', numCacheClusters: 2, automaticFailoverEnabled: true, multiAzEnabled: true, atRestEncryptionEnabled: true, transitEncryptionEnabled: true, cacheSubnetGroupName: subnetGroup.ref });
  cache.addResourceDependency(subnetGroup);
  return stack;
}
