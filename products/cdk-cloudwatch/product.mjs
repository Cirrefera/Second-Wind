import { Stack, Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export function createStack(app,{configuration:c,selected_components}) {
 if(!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')throw new Error('invalid_selection');
 if(!c||c.language!=='javascript'||typeof c.namespace!=='string'||typeof c.metric_name!=='string'||typeof c.alarm_name!=='string'||typeof c.threshold!=='number')throw new Error('invalid_configuration');
 const stack=new Stack(app,'SecondWindMonitoringStack');
 const metric=new cloudwatch.Metric({namespace:c.namespace,metricName:c.metric_name,statistic:'Average',period:Duration.minutes(5)});
 const math=new cloudwatch.MathExpression({expression:'m1',usingMetrics:{m1:metric},period:Duration.minutes(5)});
 const alarm=metric.createAlarm(stack,'Alarm',{alarmName:c.alarm_name,threshold:c.threshold,evaluationPeriods:c.evaluation_periods||2,comparisonOperator:cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,treatMissingData:cloudwatch.TreatMissingData.NOT_BREACHING});
 const dashboard=new cloudwatch.Dashboard(stack,'Dashboard',{dashboardName:`${c.alarm_name}-dashboard`});
 dashboard.addWidgets(new cloudwatch.GraphWidget({title:c.metric_name,left:[metric,math]}));
 new cloudwatch.CompositeAlarm(stack,'CompositeAlarm',{alarmRule:cloudwatch.AlarmRule.anyOf(alarm)});
 return stack;
}
