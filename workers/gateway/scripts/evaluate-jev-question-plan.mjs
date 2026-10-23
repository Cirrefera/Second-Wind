import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256} from '../src/contracts.js';
import {createJevAi,JEV_ENDPOINT} from '../src/jev.js';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const probability=value=>Number.isFinite(value)&&value>=0&&value<=1;
const equal=(left,right)=>canonicalJson(left)===canonicalJson(right);
const check=(condition,message)=>{if(!condition) throw new Error(message);};

/** Validate native answers before treating an HTTP success as a valid reading. */
export function validateQuestionAnswers(request,response) {
  check(object(response)&&response.model===request.model&&object(response.answers),'invalid_answer_envelope');
  const entries=Object.entries(request.questions);
  check(Object.keys(response.answers).length===entries.length,'invalid_answer_keys');
  for(const [id,question] of entries) {
    const answer=response.answers[id];
    check(Object.hasOwn(response.answers,id)&&object(answer)&&answer.type===question.type,'invalid_answer_type');
    if(question.type==='noul') check(probability(answer.noul),'invalid_noul');
    else {
      check(question.type==='choice'&&object(question.criteria),'unsupported_question_type');
      const options=Object.keys(question.criteria);
      check(typeof answer.choice==='string'&&Object.hasOwn(question.criteria,answer.choice)
        &&probability(answer.confidence)&&object(answer.probabilities)
        &&Object.keys(answer.probabilities).length===options.length,'invalid_choice');
      check(options.every(option=>Object.hasOwn(answer.probabilities,option)&&probability(answer.probabilities[option]))
        &&Math.abs(options.reduce((sum,option)=>sum+answer.probabilities[option],0)-1)<=0.001
        &&options.every(option=>answer.probabilities[option]<=answer.probabilities[answer.choice]+1e-8),'invalid_choice_distribution');
    }
  }
  check(object(response.usage)&&['input_tokens','output_tokens'].every(key=>Number.isSafeInteger(response.usage[key])&&response.usage[key]>=0),'invalid_usage');
  return entries.length;
}

export async function validateQuestionPlan(plan) {
  const {plan_ref,...body}=plan;
  check(plan_ref==='sha256:'+await sha256(canonicalJson(body)),'plan_hash_mismatch');
  check(/^jev-\d+\.\d+\.\d+$/.test(plan.model),'unpinned_model');
  const flat=Array.isArray(plan.requests),staged=Array.isArray(plan.cases);
  check(flat!==staged,'invalid_plan_shape');
  const count=flat?plan.requests.length:plan.cases.length*2;
  check(count>0&&count<=200,'request_budget_exceeded');
  if(staged) check(object(plan.shapeQuestion)&&object(plan.templates)&&probability(plan.thresholds?.shape_confidence),'invalid_staged_plan');
  const requests=flat?plan.requests.map(entry=>entry.request):plan.cases.map(entry=>shapeRequest(plan,entry));
  for(const request of requests) check(object(request)&&request.model===plan.model
    &&Object.keys(request).every(key=>['model','state','questions'].includes(key))&&object(request.questions)
    &&Object.keys(request.questions).length>0&&Object.keys(request.questions).length<=64,'invalid_plan_request');
  return {flat,max_requests:count};
}

function shapeRequest(plan,entry) {
  return {model:plan.model,state:{goal:entry.state.intent.goal},questions:{request_shape:plan.shapeQuestion}};
}
function supportRequest(plan,entry,shape) {
  if(!shape||shape.confidence<plan.thresholds.shape_confidence||!Object.hasOwn(plan.templates,shape.choice)) return null;
  const template=plan.templates[shape.choice],questions={};
  entry.state.candidates.forEach((candidate,index)=>{
    questions[`candidate_fit_${index}`]={...template,instructions:template.instructions.replace('candidates[0]',`candidates[${index}]`)};
  });
  return {model:plan.model,state:entry.state,questions};
}

/** Verify saved evidence offline. Response digests cannot be recomputed without
 * raw HTTP bytes; their presence/format is checked, not claimed independently. */
export async function validateRecordedQuestionAudit(plan,report) {
  const {flat}=await validateQuestionPlan(plan);
  check(report.plan_ref===plan.plan_ref,'report_plan_mismatch');
  const entries=flat?plan.requests:plan.cases,observed=flat?report.calls:report.cases;
  check(Array.isArray(observed)&&observed.length===entries.length,'incomplete_audit');
  let calls=0,answers=0,input_tokens=0,output_tokens=0;
  const validate=async(request,call)=>{
    check(object(call)&&!call.error,'failed_provider_call');
    const requestHash=await sha256(canonicalJson(request));
    check(call.request_hash===requestHash&&call.questions_hash===await sha256(canonicalJson(request.questions)),'recorded_request_mismatch');
    if(call.request) check(equal(call.request,request),'recorded_request_body_mismatch');
    check(call.receipt?.provider==='typesafe-live'&&call.receipt.endpoint===JEV_ENDPOINT
      &&call.receipt.request_hash===requestHash&&call.receipt.ok===true&&call.receipt.http_status===200
      &&call.receipt.model===plan.model&&call.receipt.response_model===plan.model
      &&/^[a-f0-9]{64}$/.test(call.receipt.response_hash||''),'invalid_receipt');
    answers+=validateQuestionAnswers(request,call.response);
    check(equal(call.receipt.usage,call.response.usage),'usage_receipt_mismatch');
    calls++;input_tokens+=call.response.usage.input_tokens;output_tokens+=call.response.usage.output_tokens;
  };
  for(let index=0;index<entries.length;index++) {
    const expected=entries[index],actual=observed[index];
    check(actual.case_id===expected.case_id&&equal(actual.expected,expected.expected),'recorded_case_mismatch');
    if(flat) {
      check(actual.state_variant===expected.state_variant,'recorded_state_variant_mismatch');
      check(actual.cohort===expected.cohort,'recorded_cohort_mismatch');
      await validate(expected.request,actual);
    } else {
      check(Array.isArray(actual.calls)&&actual.calls.length>0,'missing_shape_call');
      await validate(shapeRequest(plan,expected),actual.calls[0]);
      const shape=actual.calls[0].response.answers.request_shape;
      check(equal(shape,actual.shape),'recorded_shape_mismatch');
      const next=supportRequest(plan,expected,shape);
      check(actual.calls.length===(next?2:1),'unexpected_stage_count');
      if(next) await validate(next,actual.calls[1]);
      if(Object.hasOwn(actual,'support')) check(Boolean(next)&&equal(actual.support,
        expected.state.candidates.map((candidate,index)=>({sku:candidate.sku,noul:actual.calls[1].response.answers[`candidate_fit_${index}`].noul}))),
        'recorded_support_summary_mismatch');
    }
  }
  return {plan_ref:plan.plan_ref,cases:entries.length,http_successes:calls,validated_answers:answers,usage:{input_tokens,output_tokens}};
}

/** Explicit live rerun of a frozen plan. No retries, labels in requests, or
 * production configuration changes. The fixed-endpoint adapter owns secrets. */
export async function evaluateQuestionPlan(plan,{apiKey,onCheckpoint=async()=>{}}={}) {
  const {flat}=await validateQuestionPlan(plan);
  const report={schema_version:'1',plan_ref:plan.plan_ref,started_at:new Date().toISOString(),model:plan.model,...(flat?{calls:[]}:{cases:[]})};
  const send=async request=>{
    const call={request_hash:await sha256(canonicalJson(request)),questions_hash:await sha256(canonicalJson(request.questions))};
    const ai=createJevAi({apiKey,model:plan.model,onResponse:value=>{call.receipt=value;}});
    try {call.response=await ai.run(plan.model,request);validateQuestionAnswers(request,call.response);}
    catch {call.error='provider_or_answer_validation_failed';}
    return call;
  };
  for(const entry of flat?plan.requests:plan.cases) {
    if(flat) report.calls.push({case_id:entry.case_id,state_variant:entry.state_variant,expected:entry.expected,
      ...(entry.cohort?{cohort:entry.cohort}:{}),...await send(entry.request)});
    else {
      const first=await send(shapeRequest(plan,entry)),shape=first.response?.answers.request_shape;
      const row={case_id:entry.case_id,expected:entry.expected,shape,calls:[first]};
      const next=!first.error&&supportRequest(plan,entry,shape);
      if(next) row.calls.push(await send(next));
      report.cases.push(row);
    }
    await onCheckpoint(report);
  }
  report.finished_at=new Date().toISOString();await onCheckpoint(report);
  return report;
}

async function main() {
  const [mode,planPath,resultPath,...extra]=process.argv.slice(2);
  check(['--validate','--jev-live'].includes(mode)&&planPath&&resultPath&&!extra.length,
    'Usage: node scripts/evaluate-jev-question-plan.mjs --validate|--jev-live plan.json report.json');
  const plan=JSON.parse(await readFile(planPath,'utf8'));
  let report;
  if(mode==='--validate') report=JSON.parse(await readFile(resultPath,'utf8'));
  else {
    await validateQuestionPlan(plan);
    check(Boolean(process.env.TYPESAFE_API_KEY),'TYPESAFE_API_KEY_required');
    await writeFile(resultPath,'{}\n',{flag:'wx',mode:0o600});
    report=await evaluateQuestionPlan(plan,{apiKey:process.env.TYPESAFE_API_KEY,
      onCheckpoint:value=>writeFile(resultPath,JSON.stringify(value,null,2)+'\n',{mode:0o600})});
  }
  console.log(JSON.stringify(await validateRecordedQuestionAudit(plan,report)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
