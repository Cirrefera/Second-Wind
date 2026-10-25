import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.parameter_name!=='string'||typeof c.value!=='string')throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindParameterStack');
 const tier=c.tier==='Advanced'?ssm.ParameterTier.ADVANCED:ssm.ParameterTier.STANDARD;
 let parameter;
 if(c.parameter_type==='StringList') parameter=new ssm.StringListParameter(stack,'Parameter',{parameterName:c.parameter_name,stringListValue:c.value.split(',').map(x=>x.trim()),tier,description:'Application configuration parameter',simpleName:false});
 else parameter=new ssm.StringParameter(stack,'Parameter',{parameterName:c.parameter_name,stringValue:c.value,tier,description:'Application configuration parameter',simpleName:false});
 const reader=new iam.Role(stack,'ParameterReaderRole',{assumedBy:new iam.ServicePrincipal('lambda.amazonaws.com')});
 parameter.grantRead(reader);
 return {stack,parameter,reader};
}
