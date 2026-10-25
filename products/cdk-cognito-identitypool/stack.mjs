import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-cognito-identitypool', { env: config.env });
  const pool = new cognito.CfnIdentityPool(stack, 'IdentityPool', { allowUnauthenticatedIdentities: false, allowClassicFlow: false, identityPoolName: config.identityPoolName ?? 'application-identities' });
  const role = new iam.Role(stack, 'AuthenticatedRole', { assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', { StringEquals: { 'cognito-identity.amazonaws.com:aud': pool.ref }, 'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' } }, 'sts:AssumeRoleWithWebIdentity') });
  new cognito.CfnIdentityPoolRoleAttachment(stack, 'RoleAttachment', { identityPoolId: pool.ref, roles: { authenticated: role.roleArn } });
  return stack;
}
