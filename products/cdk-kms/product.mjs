import { Stack, RemovalPolicy, Duration } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

export function createStack(app,{configuration:c,selected_components}) {
  if (!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack') throw new Error('invalid_selection');
  if (!c||typeof c.key_alias!=='string'||!/^alias\/[A-Za-z0-9/_-]{1,250}$/.test(c.key_alias)) throw new Error('invalid_configuration');
  const stack=new Stack(app,'SecondWindKmsStack');
  const key=new kms.Key(stack,'Key',{description:c.description||'Managed application encryption key',enableKeyRotation:c.enable_key_rotation!==false,pendingWindow:Duration.days(30),removalPolicy:RemovalPolicy.RETAIN});
  key.addToResourcePolicy(new iam.PolicyStatement({principals:[new iam.AccountRootPrincipal()],actions:['kms:*'],resources:['*']}));
  new kms.Alias(stack,'Alias',{aliasName:c.key_alias,targetKey:key});
  const consumerRole=new iam.Role(stack,'EncryptionClientRole',{assumedBy:new iam.ServicePrincipal('lambda.amazonaws.com')});
  key.grantEncryptDecrypt(consumerRole);
  return {stack,key,consumerRole};
}
