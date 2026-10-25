import { Stack, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.queue_name!=='string'||!c.queue_name)throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindQueueStack');
 const fifo=c.fifo===true;
 if(c.queue_name.endsWith('.fifo')!==fifo)throw new Error('invalid_configuration');
 let dlq;
 if(c.dead_letter_queue) dlq=new sqs.Queue(stack,'DeadLetterQueue',{queueName:`${c.queue_name.replace(/\.fifo$/,'')}-dlq${fifo?'.fifo':''}`,fifo,retentionPeriod:Duration.days(14),encryption:sqs.QueueEncryption.SQS_MANAGED,removalPolicy:RemovalPolicy.RETAIN});
 const queue=new sqs.Queue(stack,'Queue',{queueName:c.queue_name,fifo,visibilityTimeout:Duration.seconds(c.visibility_timeout_seconds??30),retentionPeriod:Duration.days(4),encryption:sqs.QueueEncryption.SQS_MANAGED,deadLetterQueue:dlq?{queue:dlq,maxReceiveCount:5}:undefined,removalPolicy:RemovalPolicy.RETAIN});
 const consumerRole=new iam.Role(stack,'QueueConsumerRole',{assumedBy:new iam.ServicePrincipal('lambda.amazonaws.com')});
 queue.grantSendMessages(consumerRole);queue.grantConsumeMessages(consumerRole);
 if(c.cross_account_id) queue.addToResourcePolicy(new iam.PolicyStatement({principals:[new iam.AccountPrincipal(c.cross_account_id)],actions:['sqs:SendMessage'],resources:[queue.queueArn]}));
 return {stack,queue,consumerRole};
}
