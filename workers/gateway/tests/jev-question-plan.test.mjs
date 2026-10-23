import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateQuestionPlan,validateQuestionAnswers,validateRecordedQuestionAudit} from '../scripts/evaluate-jev-question-plan.mjs';

const evidence=new URL('../../../docs/evidence/jev-routing/question-audit/',import.meta.url);
async function fixture(name='wording-and-kind') {
  return {plan:JSON.parse(await readFile(new URL(`${name}.plan.json`,evidence),'utf8')),
    report:JSON.parse(await readFile(new URL(`${name}.results.json`,evidence),'utf8'))};
}

test('saved native question audits validate their frozen plans, answer contracts and receipt binding offline',async()=>{
  for(const [name,calls] of [['wording-and-kind',24],['direct-fit-and-intent-kind',12],['direct-fit-validation',32],['task-quantifier',6],['request-shape-probe',12]]) {
    const {plan,report}=await fixture(name),result=await validateRecordedQuestionAudit(plan,report);
    assert.equal(result.http_successes,calls);assert.ok(result.validated_answers>=calls);
    assert.ok(result.usage.input_tokens>0);assert.ok(result.usage.output_tokens>0);
  }
});

test('changing an intent or label after plan freezing invalidates its digest',async()=>{
  for(const field of ['intent','label']) {
    const {plan}=await fixture();
    if(field==='intent') plan.requests[0].request.state.intent.goal='An unrelated replacement goal';
    else plan.requests[0].expected.products=[];
    await assert.rejects(validateQuestionPlan(plan),/plan_hash_mismatch/);
  }
});

test('success evidence cannot be rebound to another question, case or HTTP request',async()=>{
  for(const mutate of [
    report=>{report.calls[0].questions_hash=report.calls[1].questions_hash.slice(1)+'0';},
    report=>{report.calls[0].receipt.request_hash=report.calls[1].receipt.request_hash;},
    report=>{report.calls[0].case_id='different-case';},
    report=>{report.calls[0].expected.products=[];},
    report=>{report.calls[0].receipt.usage.input_tokens++;},
    report=>{report.calls[0].cohort='unearned-holdout';},
    report=>{report.calls[0].receipt.provider='scripted-fixture';},
    report=>{report.calls[0].receipt.endpoint='https://example.invalid';},
  ]) {
    const {plan,report}=await fixture();mutate(report);
    await assert.rejects(validateRecordedQuestionAudit(plan,report),/mismatch|invalid_receipt/);
  }
});

test('HTTP 200 does not excuse malformed native answers',async()=>{
  const {plan,report}=await fixture(),request=plan.requests[0].request,original=report.calls[0].response;
  for(const mutate of [
    response=>{delete response.answers.answer_exists;},
    response=>{response.answers.answer_exists.noul=1.1;},
    response=>{response.answers.answer_exists.type='choice';},
    response=>{response.answers.candidate.choice='outside-supplied-candidates';},
    response=>{response.answers.candidate.probabilities.unknown=0.5;},
    response=>{response.answers.candidate.confidence=-1;},
  ]) {
    const response=structuredClone(original);mutate(response);
    assert.throws(()=>validateQuestionAnswers(request,response),/invalid/);
  }
});

test('partial or failed audits cannot validate as complete success',async()=>{
  for(const mutate of [report=>report.calls.pop(),report=>{report.calls[0].error='provider_call_failed';},report=>{report.calls[0].receipt.http_status=503;}]) {
    const {plan,report}=await fixture();mutate(report);
    await assert.rejects(validateRecordedQuestionAudit(plan,report),/incomplete_audit|failed_provider_call|invalid_receipt/);
  }
});

test('staged evidence must use the question selected by its actual first answer',async()=>{
  const {plan,report}=await fixture('request-shape-probe');
  report.cases[0].shape={...report.cases[0].shape,choice:'multiple_tasks'};
  await assert.rejects(validateRecordedQuestionAudit(plan,report),/recorded_shape_mismatch/);
  const second=await fixture('request-shape-probe');
  second.report.cases[0].calls[1].request.questions.candidate_fit_0.instructions='Does a different question hold?';
  await assert.rejects(validateRecordedQuestionAudit(second.plan,second.report),/recorded_request_body_mismatch/);
  const third=await fixture('request-shape-probe');
  third.report.cases[0].support[0].sku='OTHER-PRODUCT';
  await assert.rejects(validateRecordedQuestionAudit(third.plan,third.report),/recorded_support_summary_mismatch/);
});
