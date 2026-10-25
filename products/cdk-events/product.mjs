import { Stack } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.rule_name!=='string'||!['schedule','pattern'].includes(c.mode))throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindEventRuleStack');
 const rule=new events.Rule(stack,'Rule',{ruleName:c.rule_name,schedule:c.mode==='schedule'?events.Schedule.expression(c.schedule_expression):undefined,eventPattern:c.mode==='pattern'?{source:[c.event_source],detailType:[c.detail_type]}:undefined});
 return stack;
}
