# Initial Jev structured-routing evaluation — October 22, 2026

**Subsequent question-design audit:** [JEV_QUESTION_AUDIT.md](JEV_QUESTION_AUDIT.md) supersedes the question design and remaining-failure assessment in this historical PR #8 report. The corrected two-stage, per-candidate resolver passes **60/60 fixed regression outcomes**, including **38/38 model-called cases** and **22/22 application-only cases**, using 76 actual API requests in the final complete run. All 219 gateway tests and both builds pass. The previously failing original deployment request now returns `no_match`. The audit retains all rejected alternatives, the intermediate 58/60 result, and the distinction between regressions and unseen examples. Production manifest coverage and optional semantic enablement remain separate work.

The subsequent corrections are merged in PRs #9 and #10 and accepted as application release `d8541816a4242cdab1aaceea9dd2640edc19b676`, through [production run 39880042324](https://github.com/Cirrefera/Second-Wind/actions/runs/39880042324). The linked audit records the exact source/test/release trees, initial stopped attempt, timeout correction, and final gateway/Pages identities.

## Historical PR #8 result

**Real Jev API calls were used to test and improve the existing structured resolver.** On the unchanged 34-case corpus, the resolver improved from **31/34 to 33/34** expected outcomes while reducing model calls from **24 to 12**. A separate 12-case paraphrase regression set passed **12/12**. One known uncertain reading still falls back to an incorrect lexical match; it remains an explicit limitation before optional semantic assistance can be enabled in production.

This work starts from consolidated main `c8b8991393ba3a304adb44726dabe5f57b6551ca`. It does not establish that either evaluated v2 draft has been published or that the live v1 product has a reviewed routing manifest. See [FIX-07 and FIX-12 in the tracker](SECONDWIND_FIX_TRACKER.md).

## Source and release status

**[PR #8](https://github.com/Cirrefera/Second-Wind/pull/8) is merged and the follow-up application release is accepted in production.** The owner's consolidation authorization was carried through the existing GitHub verification and deployment workflow. Optional production model assistance remains disabled.

| Evidence | Identity / result |
| --- | --- |
| Reviewed source commit | `448daac64eb58ba70b46a884868e9bf98892d931` |
| Local, published, CI test-merge, and released tree | `3f69ab4ea93f37d3270a5ccfc8ea1576925aeb01` |
| GitHub CI checkout | `30085fb612e62c2360c4eec9a502bfe8e76a7595`, matching tree above |
| Pull-request verification | [Run 39867861178](https://github.com/Cirrefera/Second-Wind/actions/runs/39867861178), job `120134502329`: completed/success; check from GitHub Actions app `15368` for the exact source head |
| Merged application release | `dadca82c5cf43ef6be0ebb62b3553e41b46198b8` |
| Production verification and deployment | [Run 39868083324](https://github.com/Cirrefera/Second-Wind/actions/runs/39868083324), job `120135263361`: completed/success |
| Accepted at | October 22, 2026, **22:53:39 UTC / 6:53:39 p.m. EDT** |
| Gateway version | `7bd4c4bf-8f77-45e9-af17-9428bf95419c` |
| Pages deployment | `6c883a05-6f82-479b-8d8b-77b582791ecc` |

Both GitHub runs passed **198 gateway tests, 32 release-acceptance tests, 21 Pages ingress tests, the legacy utility checks, all 16 actual Dynamic Worker feature selections, and both builds**. The production workflow also passed release-input preflight, all four existing additive migrations, both deployments, and release acceptance. The accepted record is:

```json
{
  "accepted": true,
  "expected_commit": "dadca82c5cf43ef6be0ebb62b3553e41b46198b8",
  "gateway_version": "7bd4c4bf-8f77-45e9-af17-9428bf95419c",
  "pages_deployment": "6c883a05-6f82-479b-8d8b-77b582791ecc",
  "origin": "https://secondwindai.com",
  "live_products": 1,
  "funded_purchase_verified": false
}
```

The live catalog still contains one product. The follow-up performs no candidate registration/activation and adds no inference flag, production model credential, or new binding. A later documentation-only commit records this acceptance without changing the released application identity above.

## Skill and question design

The owner explicitly requested the [TypeSafe skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md) and supplied access to the Jev API. The live [documentation index](https://docs.typesafe.ai/llms.txt), [HTTP contract](https://docs.typesafe.ai/api), [Choice](https://docs.typesafe.ai/primitives/choice), [Noul](https://docs.typesafe.ai/primitives/noul), [state guidance](https://docs.typesafe.ai/concepts/state), [confidence guidance](https://docs.typesafe.ai/confidence), and [function-calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling) informed this implementation.

Each semantic request supplies the buyer intent and bounded candidate metadata: SKU, release reference, summary, supported boundary, and exclusions. It asks two independent questions together:

1. **Choice:** Which supplied candidate supports a task actually requested, including its required deliverable or action? An explicit `unknown` option remains available.
2. **Noul:** Does any supplied candidate support such a task within its boundary and exclusions? Missing configuration can require clarification without making the goal unsupported.

The questions now consistently distinguish a requested task from a topic mentioned in the request. Exact identity does not establish that a product supports a contradictory goal. Written guidance about an excluded execution or deployment action does not perform that action. A product may support one of several independent requested tasks.

Exact SKU/slug/alias lookups and supplied structured constraints stay in code. Model output does not supply a product version, language selection, price, publication approval, payment authorization, or execution authority. The existing mandatory language clarification and deterministic compatibility checks remain in force.

## Actual API evidence

All successful calls used `POST https://api.typesafe.ai/v1/systemone` and returned the pinned model **`jev-1.14.0`**. There were **49 successful HTTP 200 requests**, comprising the initial six-question request and the three resolver evaluations below. The successful requests reported **65,129 input tokens and 2,733 output tokens** in total.

| Run | Time in America/New_York | API requests | Expected resolver outcomes | Model-called cases | Mean request latency |
| --- | --- | ---: | --- | --- | ---: |
| Initial question check | October 22, 5:51:21 p.m. EDT | 1 | Three intent probes, six judgments; not part of corpus accuracy | Not a resolver run | 173.1 ms |
| Existing corpus, before corrections | October 22, 5:58:16–5:58:20 p.m. EDT | 24 | **31/34** | **21/24** | 168.4 ms |
| Same corpus, after corrections | October 22, 6:02:00–6:02:02 p.m. EDT | 12 | **33/34** | **11/12** | 105.7 ms |
| Fresh paraphrase regression set | October 22, 6:02:00–6:02:02 p.m. EDT | 12 | **12/12** | **12/12** | 117.5 ms |

These are observed timings for these runs, not a latency benchmark or service-level promise. Application-only successes are excluded from the model-called accuracy denominator. The two corrected evaluation runs were issued concurrently, with at most two requests in flight.

The evidence files preserve case labels, actual typed answers, final resolver outcomes, model/provider identity, token usage, request/question hashes, source-file hashes, candidate-snapshot references, HTTP receipts, and TypeSafe request IDs:

- [Initial questions and native response](evidence/jev-routing/20261022/initial-questions.json)
- [Baseline resolver report](evidence/jev-routing/20261022/baseline.json)
- [Corrected resolver report](evidence/jev-routing/20261022/corrected.json)
- [Fresh paraphrase report](evidence/jev-routing/20261022/paraphrases.json)

Example provider request IDs:

- Baseline: `req_01a1659f3ad8726a92f50b52d9d32f90`
- Corrected corpus: `req_01a165a2a792716eb9c813e1aa2e8cf3`
- Fresh paraphrases: `req_01a165a2a78a7019ae878a5747372edf`

A preliminary Node run lacked the workspace proxy setting and was stopped after transport failures. It produced no observed successful HTTP responses and is excluded from all model-quality measurements above. The successful Node runs used `--use-env-proxy`; the initial direct Python request also used the workspace proxy.

## What the evidence changed

| Finding | Correction or disposition |
| --- | --- |
| Pure typed requests and exact identities were unnecessarily sent to inference | Only an informative stated goal triggers the optional semantic reader. On the original corpus, calls fell from 24 to 12 with all 22 application-only outcomes passing. |
| A confident relative preference discarded other candidates when every candidate still needed configuration | The chosen candidate is promoted while other pending candidates are retained, subject to the existing result limit. |
| Exact SKU plus a contradictory goal produced an incorrect match | Choice and Noul now judge goal support consistently. The unchanged exact-identity/wrong-goal case passes in the corrected live run. |
| Another product's valid manifest could make a requested live SKU/slug with absent or stale metadata appear to have no match | The resolver now returns `routing_not_configured` for that explicitly requested live version. A mixed-coverage regression exercises both absent and stale records, HTTP, and the shared capability service. |
| A request to perform an excluded deployment still produced a lexical match after an uncertain reading | Kept as an open evaluation failure. No threshold adjustment or corpus relabeling was used to hide it. |

The existing 34-case corpus and its product source hashes are unchanged. The fresh 12-case labels were fixed before their live run. Their references are:

- Existing: `sha256:d2a8e813ceba0a2d7a0cc455961f56263bb276b5ad0aa98137b693476e7ee87f`
- Fresh: `sha256:4e689eba31b64861b1e483f9d3d85ccf08990cdabc0bba2433e0dbcbec60355b`

Both use engineering labels grounded in the checked-in product boundaries. Neither is independent human adjudication, production-traffic measurement, or held-out threshold calibration.

## Remaining semantic failure

The original case `prompt-text-cannot-grant-execution` asks for Lambda idempotency and then demands production deployment outside the guidance product's scope. After the question correction, Jev returned:

- Candidate: `candidate_0`, probability **0.73**, Choice confidence **0.46**.
- Existence Noul: **0.45**, an uncertain reading.
- Resolver result: **`match`**, because the existing uncertainty policy retains the deterministic lexical fallback.
- Source-grounded expected result: **`no_match`**.

This is an observed unresolved interaction between a model reading and fallback composition. It does not authorize or perform a deployment: execution and payment remain separate. It still prevents claiming complete semantic-routing readiness. The provisional thresholds remain unchanged: Choice confidence `0.5`, existence present `0.7`, and existence absent below `0.35`.

Before enabling semantic assistance, resolve the uncertain-goal/fallback policy and validate it on additional fixed examples. Repeating inference until this case happens to pass would not resolve the issue. The fresh excluded-action paraphrase passed, but does not erase the original failure.

## Implementation and verification

- `workers/gateway/src/jev.js`: native TypeSafe transport, exact model pin, fixed endpoint, bounded request/response size and deadline, no redirect following, safe observation metadata.
- `workers/gateway/src/clef.js`: shared typed-answer validation preserves the actual selected model; existing Cloudflare callers retain their default behavior.
- `workers/gateway/src/routing.js`: deterministic lookup bypass, pending-candidate preservation, and missing-manifest handling for explicit identities in partially reviewed catalogs.
- `workers/gateway/scripts/evaluate-routing.mjs`: explicit `--jev-live` mode, actual HTTP evidence and raw typed readings, separate model-called/application-only results, and honest failure accounting.

Local verification passed **198/198 gateway tests**, including **28 routing tests**, **31 reader/provider tests**, and **8 evaluator tests**; both gateway and Pages builds passed. The focused tests cover transport/model identity, immutable snapshots, deadlines, malformed responses, secret-safe errors, deterministic compatibility, multiple pending candidates, and HTTP/capability agreement. Mocked provider tests never claim measured model accuracy.

From `workers/gateway`, with the API key supplied through the environment by the operator:

```bash
node scripts/evaluate-routing.mjs --jev-live /tmp/jev-existing.json
node scripts/evaluate-routing.mjs --jev-live /tmp/jev-paraphrases.json tests/fixtures/routing-evaluation-paraphrases.json
```

Use Node's `--use-env-proxy` option when the execution environment requires its configured proxy. Normal CI uses deterministic and mocked provider tests; it does not read the owner's uploaded credential or make paid model calls.

## Production prerequisite remains separate

The evaluation creates a disposable local projection of two source-reviewed **draft v2** candidates. The accepted production catalog at the start of this work contains **SW-PT-0006 v1**, whose hash and fixed guidance differ from the v2 release. The v2 routing record cannot be relabeled as v1.

The existing v1 guidance contains snippets in several languages but has no registered selectable language/runtime contract. Adding a routing row alone would not enforce a new language promise through configuration and quotation. Completing FIX-07 therefore still requires truthful version-matched registration and consistent release/configuration evidence, or controlled publication of an approved candidate through FIX-08/10/11.

Jev was used as requested in this engineering evaluation. No runtime enabling flag, production Jev credential, product activation, price change, or funded purchase was added by this follow-up. FIX-07 and FIX-12 remain open for their stated remaining acceptance criteria.
