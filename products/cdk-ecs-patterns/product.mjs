import { Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||!['load-balanced','queue-processing','scheduled'].includes(c.pattern)||typeof c.image!=='string')throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindEcsPatternsStack');
 const vpc=new ec2.Vpc(stack,'Vpc',{maxAzs:2,natGateways:1});
 const cluster=new ecs.Cluster(stack,'Cluster',{vpc});
 const image=ecs.ContainerImage.fromRegistry(c.image);
 if(c.pattern==='load-balanced') new patterns.ApplicationLoadBalancedFargateService(stack,'Service',{cluster,serviceName:c.service_name,publicLoadBalancer:true,taskImageOptions:{image,containerPort:8080}});
 else if(c.pattern==='queue-processing') {const queue=new sqs.Queue(stack,'WorkQueue');new patterns.QueueProcessingFargateService(stack,'Worker',{cluster,serviceName:c.service_name,queue,image,desiredTaskCount:1});}
 else {const task=new ecs.FargateTaskDefinition(stack,'TaskDefinition');task.addContainer('Worker',{image});new patterns.ScheduledFargateTask(stack,'ScheduledTask',{cluster,scheduledFargateTaskDefinitionOptions:{taskDefinition:task},schedule:events.Schedule.expression(c.schedule_expression||'rate(1 hour)')});}
 return stack;
}
