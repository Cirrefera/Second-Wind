import { Stack, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.service_name!=='string'||typeof c.image!=='string')throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindEcsStack');
 const vpc=new ec2.Vpc(stack,'Vpc',{maxAzs:2,natGateways:0,subnetConfiguration:[{name:'public',subnetType:ec2.SubnetType.PUBLIC}]});
 const cluster=new ecs.Cluster(stack,'Cluster',{vpc,clusterName:`${c.service_name}-cluster`});
 const task=new ecs.FargateTaskDefinition(stack,'TaskDefinition',{cpu:c.cpu||256,memoryLimitMiB:c.memory_mib||512});
 task.addContainer('Application',{image:ecs.ContainerImage.fromRegistry(c.image),logging:ecs.LogDrivers.awsLogs({streamPrefix:c.service_name,logRetention:logs.RetentionDays.ONE_MONTH})});
 new ecs.FargateService(stack,'Service',{cluster,taskDefinition:task,serviceName:c.service_name,desiredCount:c.desired_count||1,assignPublicIp:true,vpcSubnets:{subnetType:ec2.SubnetType.PUBLIC}});
 return stack;
}
