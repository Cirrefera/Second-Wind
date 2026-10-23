# Jev routing: question design and composition audit

The owner asked us to assess the questions behind unsuccessful probability readings and explicitly requested the [TypeSafe skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md). This audit applies that instruction to the existing resolver using actual `jev-1.14.0` API calls. It starts from main `a499b596243e0ec1172f21061b0d22b72988fa38`, after the accepted PR #8 release.

**The corrected resolver passes 60/60 fixed regression outcomes: 38/38 model-called cases and 22/22 application-only cases. All 219 gateway tests and both builds pass.** The original excluded-deployment failure is resolved in this regression. Production semantic assistance remains disabled pending the separate catalog and acceptance work described below.

## Finding and correction

The original routing questions combined three different decisions: relative candidate preference, whether any candidate supported something in the request, and whether a particular product satisfied the requested task. A global existence reading did not establish support for each returned product. The meaning of “supports the request” also changed between a single required outcome, several independent tasks, and topic browsing.

The correction separates those decisions while keeping compatibility and result composition in code:

1. A **Choice** reads the structure of the stated goal: one task or combined outcome, multiple independent tasks, topic discovery, or unknown. This first request contains only the goal.
2. A second request asks an independent **Noul for each candidate**, using the question appropriate to that request structure. Candidate Choice remains a relative ordering signal.
3. Code validates every typed response, applies deterministic constraints, and composes the result. A relative preference cannot establish support, discard another supported candidate, select a delivery language, or authorize execution.

This follows the skill's distinction between one competing category and independently applicable predicates. See the official [state guidance](https://docs.typesafe.ai/concepts/state), [Choice](https://docs.typesafe.ai/primitives/choice), [Noul](https://docs.typesafe.ai/primitives/noul), and [skill-suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion). A Score is unnecessary here: the application needs evidence about whether a defined predicate holds, rather than an ordinal quality rating. Typed output makes the contract inspectable; it does not establish that the judgment is correct.

| Request structure | Candidate question | What code may do with the answer |
| --- | --- | --- |
| One task or combined outcome | Does this candidate itself satisfy the requested task, including its required deliverable or action, within its boundary and exclusions? | Promote clear support; reject a clearly unsupported task; preserve lexical membership for an intermediate reading. |
| Multiple independent tasks | Does this candidate satisfy at least one **complete** requested task, including that task's required action? | Evaluate each candidate separately so two useful products can both survive. |
| Topic discovery | Does this candidate address a stated topic within its supported scope? | Promote/rank a useful discovery result. A negative topic reading does not veto an existing lexical browse result. |
| Uncertain between known structures | Ask the corresponding candidate predicates for every known structure with nonzero probability. | Require agreement for promotion or task rejection; disagreement retains existing lexical membership without promoting a new candidate. |

The exact templates are in `workers/gateway/src/clef.js`. They refer explicitly to `intent.goal` and indexed `candidates[i]` paths. Candidate state includes the actual product kind, summary, supported boundary, exclusions, SKU, and release reference. A topic followed by a required deployment remains one task; the presence of a relevant heading does not create a separately satisfiable guidance request.

### Uncertainty and bounds

The provisional positive Noul boundary remains `>= 0.7`, the negative boundary remains `< 0.35`, and the existing Choice confidence cutoff remains `0.5`. The request-structure Choice uses that same provisional confidence cutoff; it has not been independently calibrated.

When structure confidence is below `0.5`, the selected structure is known, and the `unknown` probability is zero, the reader asks all known structures with nonzero probability in the same second request. For a candidate, every branch must be positive to promote it. Every branch must be negative, with no topic-discovery branch, to reject it. Mixed or intermediate readings retain existing membership only. No average, product, or other invented probability replaces the raw Nouls. A winning unknown or uncertainty containing unknown probability keeps the existing uncertain-reading fallback.

The chain uses at most two provider requests and one shared five-second caller deadline. The existing 20-candidate, 48 KB request, and 64-question limits remain enforced. Large ambiguous contexts fail within those bounds. Both stages use a snapshot of the same intent, candidate evidence, and provider identity captured before the first await. Each stage retains its own request/question hashes; a chain hash binds their order and snapshot. The second-stage support mapping identifies which raw answer belongs to each candidate and structure.

Hard compatibility conflicts, exact identifiers, explicit language requirements, missing configuration, and the bounded candidate pool remain application rules. Only candidates actually evaluated can receive a semantic negative. An unavailable provider still follows the existing deterministic fallback; this audit does not establish that fallback is semantically correct for every unseen request.

## Frozen experiments, including failures

Every experiment froze its request set before live calls. None changed the original case labels or probability bands. All successful calls used `POST https://api.typesafe.ai/v1/systemone` with the pinned model `jev-1.14.0`. The evidence includes actual requests, typed answers, endpoint/model identity, provider request IDs, usage, and hashes. No run was repeated until it happened to pass.

| Experiment | HTTP requests | Result and decision |
| --- | ---: | --- |
| [Wording and candidate kind](evidence/jev-routing/question-audit/wording-and-kind.results.json) | 24 | Simpler wording increased support for the excluded deployment to `0.78`/`0.80`, compared with global existence `0.54`/`0.56`. Merely adding the candidate kind did not solve it. Rejected. |
| [Direct task fit and intent kind](evidence/jev-routing/question-audit/direct-fit-and-intent-kind.results.json) | 12 | Asking whether the candidate itself satisfied the required task put the excluded deployment at `0.06`/`0.05`, while supported guidance examples remained `0.85`/`0.83` and `0.92`/`0.92`. Removing the intent's product-kind field did not change decisions. |
| [Direct-fit validation](evidence/jev-routing/question-audit/direct-fit-validation.results.json) | 32 | Candidate-band agreement was **35/43**. All 13 judgments in the eight then-unseen examples agreed, but several existing and paraphrased requests for two tasks lost legitimate candidates. A single-task question could not serve every request. Rejected as a universal question. |
| [Task quantifier comparison](evidence/jev-routing/question-audit/task-quantifier.results.json) | 6 | “At least one task” repaired multiple-task readings, but the excluded deployment moved back into uncertainty (`0.48`). A topic clause did not resolve all request types. Rejected as a universal question. |
| [Request-structure probe](evidence/jev-routing/question-audit/request-shape-probe.results.json) | 12 | Six two-stage probes separated single-task and multiple-task meanings. The deployment read `0.05`; supported guidance and independent tasks remained positive. Topic discovery still needed the existing browse behavior. |
| Initial integrated evaluation, before the two composition corrections | 75 | **58/60 application outcomes** passed. The two failures were a topic result wrongly removed and a low-confidence single/multiple split that skipped all candidate-support questions. Both failures remain in the saved reports. |

The first five experiments concern question readings, not whole-application accuracy. Their plans are saved alongside their reports: [wording](evidence/jev-routing/question-audit/wording-and-kind.plan.json), [direct fit](evidence/jev-routing/question-audit/direct-fit-and-intent-kind.plan.json), [validation](evidence/jev-routing/question-audit/direct-fit-validation.plan.json), [quantifier](evidence/jev-routing/question-audit/task-quantifier.plan.json), and [structure probe](evidence/jev-routing/question-audit/request-shape-probe.plan.json).

The initial integrated run is preserved separately in [its frozen plan](evidence/jev-routing/question-audit/staged-before-consensus.plan.json) and four reports: [original 34](evidence/jev-routing/question-audit/staged-before-consensus-original.json), [12 paraphrases](evidence/jev-routing/question-audit/staged-before-consensus-paraphrases.json), [eight question regressions](evidence/jev-routing/question-audit/staged-before-consensus-question-regressions.json), and [six new examples](evidence/jev-routing/question-audit/staged-before-consensus-question-holdouts.json).

The two observed failures directly determined the final composition changes:

- `two-pending-candidates`: topic discovery gave the guide `0.98` and the planner `0.27`. The task-rejection rule removed the planner from a valid browse result. Topic readings now preserve lexical browse membership.
- `holdout-execute-lambda`: the goal asked to log into AWS and deploy the handler. Structure probabilities were single task `0.59` and multiple tasks `0.41`, with Choice confidence `0.45`. Skipping the support stage retained an incorrect lexical match. The reader now evaluates both known interpretations and code requires their agreement.

Before the final corrected regression, this audit contained **161 successful HTTP 200 responses**, with **195,222 input tokens and 12,147 output tokens**. Those counts include development experiments and are not independent test-case counts. They are separate from the 49 successful requests in the [initial PR #8 evaluation](JEV_ROUTING_EVALUATION.md).

## Final regression and implementation verification

The corrected resolver passed **60/60 application outcomes**, including **38/38 model-called cases** and **22/22 application-only cases**. The [final plan](evidence/jev-routing/question-audit/final.plan.json) froze all three implementation files and four corpora at **2026-10-23 00:13:09 UTC / October 22, 8:13:09 p.m. EDT**, before the run. Actual results are:

| Corpus | Expected application outcomes | Model-called cases | Actual HTTP requests |
| --- | ---: | ---: | ---: |
| [Original cases](evidence/jev-routing/question-audit/final-original.json) | **34/34** | **12/12** | 24 |
| [Paraphrases](evidence/jev-routing/question-audit/final-paraphrases.json) | **12/12** | **12/12** | 24 |
| [Question regressions](evidence/jev-routing/question-audit/final-question-regressions.json) | **8/8** | **8/8** | 16 |
| [Additional six cases](evidence/jev-routing/question-audit/final-question-holdouts.json) | **6/6** | **6/6** | 12 |
| **Total** | **60/60** | **38/38** | **76** |

All 76 responses were HTTP 200 with valid typed readings; the final run reported **60,910 input tokens and 4,432 output tokens**. The five development experiments, initial 58/60 staged run, and final complete run together preserve all native receipts for **237 successful requests**, **256,132 input tokens**, and **16,579 output tokens**.

An additional, earlier corrected run also completed **60/60**, but filesystem verification found only intermediate checkpoints for three of its four reports. Its [process-completion summary](evidence/jev-routing/question-audit/first-corrected-process-summary.json), [plan](evidence/jev-routing/question-audit/first-corrected.plan.json), and surviving checkpoint files are retained. Those checkpoints contain 58 of its 76 native HTTP receipts; 18 are represented only by the observed process summary. The final run above repeated the **identical source, questions, labels, and thresholds once to obtain complete saved evidence**, using final writes and readback verification. This was not a question-tuning retry. Counting that additional run, the audit issued **313 successful requests**, **317,042 input tokens**, and **21,011 output tokens**. Of those 313 requests, 295 have individually retained native receipts. These development and repeat requests are not independent test examples.

The original excluded-deployment regression returns `no_match` with candidate support `0.05`. The previously ambiguous `holdout-execute-lambda` also returns `no_match`: its single-task and multiple-task support readings for the guidance candidate are `0.02` and `0.05`; the other candidate reads `0.02` under both interpretations. Both interpretations reject the required execution action. The topic-discovery regression retains both products and requests the missing delivery language, despite the planner's topic reading of `0.27`. This validates the intended application decisions without claiming that every individual candidate probability is calibrated.

The 60 examples are a **regression set**: the eight question-regression cases and six cases retaining “holdout” in their filenames have already been observed during development. Their earlier first-use results remain visible above. The corrected rerun is not fresh holdout accuracy. It also does not establish 100% correctness for future requests.

All **219/219 gateway tests** and both gateway/Pages builds pass locally. Focused coverage includes 27 reader tests, 11 native-provider tests, six frozen-audit verification tests, and the routing/evaluation composition regressions. The first full-suite attempt exposed one stale single-stage provider mock, which was updated to verify both native requests and their separate receipts. The environment also blocked the existing Python subprocess checks; the identical approved offline suite passed with those subprocesses available. No product test was weakened or skipped.

Exact GitHub verification and accepted release evidence are recorded here after the existing workflow completes.

## Reproduce and inspect

From `workers/gateway`, the frozen historical requests and receipts can be verified without an API key:

```bash
node scripts/evaluate-jev-question-plan.mjs --validate \
  ../../docs/evidence/jev-routing/question-audit/direct-fit-validation.plan.json \
  ../../docs/evidence/jev-routing/question-audit/direct-fit-validation.results.json
```

The same command accepts each of the five plan/report pairs. It verifies the plan digest, declared corpus/cohort, exact native request, questions, validated typed answers, endpoint/provider/model receipt, usage, and staged request reconstruction. Historical staged support summaries are checked against their actual answers. The helper can execute a frozen plan only through explicit `--jev-live`, with an operator-supplied `TYPESAFE_API_KEY` and a new output path; it checkpoints failures and does not retry or overwrite a previous report.

The production resolver path can be evaluated with the four fixed corpora:

```bash
node --use-env-proxy scripts/evaluate-routing.mjs --jev-live /tmp/jev-original.json tests/fixtures/routing-evaluation.json
node --use-env-proxy scripts/evaluate-routing.mjs --jev-live /tmp/jev-paraphrases.json tests/fixtures/routing-evaluation-paraphrases.json
node --use-env-proxy scripts/evaluate-routing.mjs --jev-live /tmp/jev-question-regressions.json tests/fixtures/routing-question-regressions.json
node --use-env-proxy scripts/evaluate-routing.mjs --jev-live /tmp/jev-question-holdouts.json tests/fixtures/routing-question-holdouts.json
```

Use `--use-env-proxy` only where the execution environment requires its configured proxy. API credentials are read into memory from the operator's environment; neither CI nor the checked-in fixtures contain the supplied credential. Normal CI uses deterministic and mocked provider tests. Those tests verify application behavior and contracts, not model accuracy.

## What remains before production semantic assistance

The evaluation uses two source-reviewed **draft v2** candidates, not the live v1 catalog:

- **SW-PT-0006 v2**: Python Lambda idempotency guidance, payload hash `80a57963f64ae52ab0f75ad9b58bbab737db9891b13d7a87961f0b5947239fbf`.
- **AWS-0568 v2**: offline DynamoDB table-request planning, payload hash `57ce8e7d4e78fdb24d7bd6c3327ce4ea9eb95912af8ed32f666ebb6f914e5d10`.

Their source boundaries and original labels are unchanged. The original two fixture files gain per-candidate mocked readings; that fixture metadata changes the file hashes, but does not relabel intents or alter source evidence. The live SW-PT-0006 v1 payload has a different hash and no registered selectable delivery-language contract. Its routing record cannot be borrowed from v2.

FIX-07 still requires truthful version-matched production routing/configuration coverage, or controlled publication of reviewed candidates through the existing workflow. Genuine product review and the planner's component allocation remain separate catalog work. The product definition is settled: original selection, combination, structure, and adaptation of public information form the assembled payload.

FIX-12 has stronger question and composition evidence, but this bounded engineering regression is not independent human adjudication, traffic measurement, or probability calibration. Unknown structures, provider fallback, and other catalog/request combinations need acceptance against the intended production behavior before enabling semantic assistance. This source change adds no production inference flag, Jev credential, product activation, price change, or funded purchase.
