import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.topic_name!=='string'||!c.topic_name)throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindTopicStack');
 const key=new kms.Key(stack,'TopicKey',{enableKeyRotation:true});
 const topic=new sns.Topic(stack,'Topic',{topicName:c.topic_name,fifo:c.fifo===true,contentBasedDeduplication:c.fifo===true,masterKey:key});
 const publisherRole=new iam.Role(stack,'TopicPublisherRole',{assumedBy:new iam.ServicePrincipal('lambda.amazonaws.com')});
 topic.grantPublish(publisherRole);
 if(c.email_subscription) topic.addSubscription(new subs.EmailSubscription(c.email_subscription));
 topic.applyRemovalPolicy(RemovalPolicy.RETAIN);
 return {stack,topic,publisherRole};
}
