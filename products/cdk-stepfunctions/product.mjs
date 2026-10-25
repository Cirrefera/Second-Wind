import { Stack, Duration } from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.state_machine_name!=='string')throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindStateMachineStack');
 const accepted=new sfn.Pass(stack,'Accepted');
 const wait=new sfn.Wait(stack,'Wait',{time:sfn.WaitTime.duration(Duration.seconds(c.wait_seconds||5))});
 const parallel=new sfn.Parallel(stack,'ParallelChecks');
 parallel.branch(new sfn.Pass(stack,'CheckOne'));
 parallel.branch(new sfn.Pass(stack,'CheckTwo'));
 const map=new sfn.Map(stack,'ProcessItems',{itemsPath:'$.items',maxConcurrency:5});
 map.itemProcessor(new sfn.Pass(stack,'ProcessItem'));
 const failed=new sfn.Fail(stack,'Rejected',{error:'Rejected',cause:'Input did not satisfy the workflow condition'});
 const choice=new sfn.Choice(stack,'Route').when(sfn.Condition.stringEquals('$.status','ready'),wait.next(parallel).next(map).next(new sfn.Succeed(stack,'Completed'))).otherwise(failed);
 const machine=new sfn.StateMachine(stack,'StateMachine',{stateMachineName:c.state_machine_name,stateMachineType:c.workflow_type==='EXPRESS'?sfn.StateMachineType.EXPRESS:sfn.StateMachineType.STANDARD,definitionBody:sfn.DefinitionBody.fromChainable(accepted.next(choice)),timeout:Duration.minutes(5)});
 return stack;
}
