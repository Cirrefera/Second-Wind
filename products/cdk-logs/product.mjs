import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.log_group_name!=='string'||!c.retention_days)throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindLogGroupStack');
 const group=new logs.LogGroup(stack,'LogGroup',{logGroupName:c.log_group_name,retention:c.retention_days, encryptionKey:c.kms_key_arn?kms.Key.fromKeyArn(stack,'Key',c.kms_key_arn):undefined,removalPolicy:RemovalPolicy.RETAIN});
 if(c.subscription_lambda_arn) group.addSubscriptionFilter('Subscription',{destination:new destinations.LambdaDestination(lambda.Function.fromFunctionArn(stack,'Subscriber',c.subscription_lambda_arn)),filterPattern:logs.FilterPattern.allEvents()});
 return stack;
}
