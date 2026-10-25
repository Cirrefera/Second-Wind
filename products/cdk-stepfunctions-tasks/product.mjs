import { Stack, Duration, Size } from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||(['lambda-invoke','dynamodb-get','dynamodb-put','sns-publish','sqs-send'].includes(c.task_type)&&typeof c.target_arn!=='string')||(c.task_type==='sagemaker-training'&&typeof c.artifacts_bucket!=='string'))throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindStateTaskStack');
 let task;
 if(c.task_type==='lambda-invoke') task=new tasks.LambdaInvoke(stack,'InvokeLambda',{lambdaFunction:lambda.Function.fromFunctionArn(stack,'Lambda',c.target_arn),payload:sfn.TaskInput.fromJsonPathAt('$'),resultPath:'$.taskResult'});
 else if(c.task_type==='dynamodb-get') task=new tasks.DynamoGetItem(stack,'GetItem',{table:dynamodb.Table.fromTableArn(stack,'Table',c.target_arn),key:{pk:tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.id'))},resultPath:'$.item'});
 else if(c.task_type==='dynamodb-put') task=new tasks.DynamoPutItem(stack,'PutItem',{table:dynamodb.Table.fromTableArn(stack,'Table',c.target_arn),item:{pk:tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.id')),payload:tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.payload'))},resultPath:sfn.JsonPath.DISCARD});
 else if(c.task_type==='sns-publish') task=new tasks.SnsPublish(stack,'Publish',{topic:sns.Topic.fromTopicArn(stack,'Topic',c.target_arn),message:sfn.TaskInput.fromJsonPathAt('$'),resultPath:sfn.JsonPath.DISCARD});
 else if(c.task_type==='bedrock-invoke') task=new tasks.BedrockInvokeModel(stack,'InvokeModel',{model:bedrock.FoundationModel.fromFoundationModelId(stack,'Model',bedrock.FoundationModelIdentifier.AMAZON_TITAN_TEXT_G1_EXPRESS_V1),body:sfn.TaskInput.fromObject({inputText:sfn.JsonPath.stringAt('$.prompt'),textGenerationConfig:{maxTokenCount:128,temperature:0.2}}),resultPath:'$.modelResult'});
 else if(c.task_type==='sagemaker-training') task=new tasks.SageMakerCreateTrainingJob(stack,'TrainingJob',{trainingJobName:sfn.JsonPath.stringAt('$.trainingJobName'),algorithmSpecification:{algorithmName:'BlazingText',trainingInputMode:tasks.InputMode.FILE},inputDataConfig:[{channelName:'train',dataSource:{s3DataSource:{s3DataType:tasks.S3DataType.S3_PREFIX,s3Location:tasks.S3Location.fromJsonExpression('$.trainingDataUri')}}}],outputDataConfig:{s3OutputLocation:tasks.S3Location.fromBucket(s3.Bucket.fromBucketName(stack,'ModelArtifacts',c.artifacts_bucket),c.artifacts_prefix||'training-output')},resourceConfig:{instanceCount:1,instanceType:new ec2.InstanceType('ml.m5.large'),volumeSize:Size.gibibytes(50)},stoppingCondition:{maxRuntime:Duration.hours(1)},resultPath:sfn.JsonPath.DISCARD});
 else if(c.task_type==='sqs-send') task=new tasks.SqsSendMessage(stack,'SendMessage',{queue:sqs.Queue.fromQueueArn(stack,'Queue',c.target_arn),messageBody:sfn.TaskInput.fromJsonPathAt('$'),resultPath:sfn.JsonPath.DISCARD});
 else throw new Error('unsupported_task_type');
 const machine=new sfn.StateMachine(stack,'StateMachine',{stateMachineName:c.state_machine_name,definitionBody:sfn.DefinitionBody.fromChainable(task)});
 return stack;
}
