import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.pool_name!=='string'||typeof c.domain_prefix!=='string')throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindUserPoolStack');
 const pool=new cognito.UserPool(stack,'UserPool',{userPoolName:c.pool_name,selfSignUpEnabled:false,signInAliases:{email:true},standardAttributes:{email:{required:true,mutable:false}},removalPolicy:RemovalPolicy.RETAIN});
 const google=!!(c.google_client_secret_name&&c.google_client_id&&c.callback_url);
 if(google) new cognito.UserPoolIdentityProviderGoogle(stack,'GoogleProvider',{userPool:pool,clientId:c.google_client_id,clientSecretValue:secrets.Secret.fromSecretNameV2(stack,'GoogleClientSecret',c.google_client_secret_name).secretValue,scopes:['profile','email'],attributeMapping:{email:cognito.ProviderAttribute.GOOGLE_EMAIL}});
 pool.addClient('ApplicationClient',{authFlows:{userSrp:true},preventUserExistenceErrors:true,supportedIdentityProviders:google?[cognito.UserPoolClientIdentityProvider.COGNITO,cognito.UserPoolClientIdentityProvider.GOOGLE]:[cognito.UserPoolClientIdentityProvider.COGNITO],oAuth:google?{flows:{authorizationCodeGrant:true},scopes:[cognito.OAuthScope.OPENID,cognito.OAuthScope.EMAIL],callbackUrls:[c.callback_url]}:undefined});
 pool.addDomain('Domain',{cognitoDomain:{domainPrefix:c.domain_prefix}});
 return stack;
}
