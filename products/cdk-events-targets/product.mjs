import { Stack } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||(['lambda','sqs','sns','stepfunctions'].includes(c.target_type)&&typeof c.target_arn!=='string')||(c.target_type==='ecs'&&typeof c.image!=='string'))throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindEventTargetStack');
 const rule=new events.Rule(stack,'Rule',{ruleName:c.rule_name,eventPattern:{source:[c.event_source||'secondwind.application'],detailType:[c.detail_type||'ApplicationEvent']}});
 const target=c.target_type==='lambda'?new targets.LambdaFunction(lambda.Function.fromFunctionArn(stack,'Target',c.target_arn))
  :c.target_type==='sqs'?new targets.SqsQueue(sqs.Queue.fromQueueArn(stack,'Target',c.target_arn))
  :c.target_type==='sns'?new targets.SnsTopic(sns.Topic.fromTopicArn(stack,'Target',c.target_arn))
  :c.target_type==='stepfunctions'?new targets.SfnStateMachine(sfn.StateMachine.fromStateMachineArn(stack,'Target',c.target_arn))
  :c.target_type==='ecs'?(()=>{const vpc=new ec2.Vpc(stack,'TargetVpc',{maxAzs:2,natGateways:0,subnetConfiguration:[{name:'public',subnetType:ec2.SubnetType.PUBLIC}]});const cluster=new ecs.Cluster(stack,'TargetCluster',{vpc});const task=new ecs.FargateTaskDefinition(stack,'TargetTask');task.addContainer('Worker',{image:ecs.ContainerImage.fromRegistry(c.image)});return new targets.EcsTask({cluster,taskDefinition:task,taskCount:1,subnetSelection:{subnetType:ec2.SubnetType.PUBLIC}})})()
  :null;
 if(!target)throw new Error('unsupported_target_type');
 rule.addTarget(target);
 return stack;
}
