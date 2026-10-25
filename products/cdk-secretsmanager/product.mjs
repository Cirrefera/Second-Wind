import { Stack, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.secret_name!=='string'||!c.secret_name)throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindSecretStack');
 const secret=new secrets.Secret(stack,'Secret',{secretName:c.secret_name,description:'Application credential managed in Secrets Manager',generateSecretString:{passwordLength:40,excludePunctuation:c.exclude_punctuation!==false},removalPolicy:RemovalPolicy.RETAIN});
 const readerRole=new iam.Role(stack,'SecretReaderRole',{assumedBy:new iam.ServicePrincipal('lambda.amazonaws.com')});
 secret.grantRead(readerRole);
 if(c.rotation_lambda_arn){
  const fn=lambda.Function.fromFunctionArn(stack,'RotationFunction',c.rotation_lambda_arn);
  secret.addRotationSchedule('RotationSchedule',{rotationLambda:fn,automaticallyAfter:Duration.days(c.rotation_days||30),rotateImmediatelyOnUpdate:false});
 }
 return stack;
}
