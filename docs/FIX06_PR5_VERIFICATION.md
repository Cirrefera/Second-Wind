# FIX-06 — Draft PR #5 exact-commit verification

Observed October 22, 2026; final ref check at approximately 1:26 p.m. EDT (17:26 UTC).

## Outcome

**The exact current draft head passes its existing offline verification, but PR #5 is not ready to merge or release.** The verification/assessment required by FIX-06 is complete. It does not authorize or establish integration, deployment, product publication, live model quality, or funded commerce success.

The head's reported 146-test result was reproduced, together with the additional product, Dynamic Worker, routing-fixture, source-preparation and build checks below. A read-only merge simulation against current `main` has two content conflicts, in commerce and discovery. Resolution must preserve the accepted FIX-01–03 release and then rerun tests on the actual combined commit. That integration work has not been performed under this assessment.

## Exact identities

| Object | Observed identity |
| --- | --- |
| [PR #5](https://github.com/Cirrefera/Second-Wind/pull/5) | Open, draft, not merged |
| Draft branch | `feat/proportional-product-scope` |
| Verified draft commit | `8711cdcf2dc31b16dc599da6db7cd0afd783a537` |
| Verified draft tree | `f7aebfa09422e061fba558a817af258c9ba08c06` |
| Current main used for comparison | `a853b9edbdb00be21b7ba157e7deb3ed36782643` |
| Accepted application release | `048f08853e863391cf8652cafdd464140e810616` |
| Actual common ancestor of draft/main | `82fe671add6468176134a344d38d2cbc3686b90e` |
| Divergence | 13 draft-only commits; 5 main-only commits |

The GitHub connector and local fetched refs agreed. A final connector check still returned the same PR #5 head and draft status. No repository `AGENTS.md` was present in the verified tree, and no parent-directory `AGENTS.md` applied to the isolated checkout.

## Reproduced verification

Environment: Node `v24.19.0`, npm `11.9.0`, Python `3.12.14`. Both repository lockfiles were installed with `npm ci --ignore-scripts --no-audit --no-fund`. A separate temporary Python virtual environment installed the candidate's pinned requirements: Powertools `3.36.0`, boto3 `1.43.114`, botocore `1.43.114`.

| Check | Command/context | Result |
| --- | --- | --- |
| Gateway suite | `npm test`, `workers/gateway` | **146/146 pass**, zero failures/skips |
| Legacy and actual Pages ingress | `npm run selftest`, root | **55 legacy assertions and 21/21 Pages tests pass** |
| Gateway bundle | `npm run build`, `workers/gateway` | Pass; esbuild reports approximately 1.1 MB |
| Pages bundle | `npm run build:worker`, root | Pass; 860 bytes |
| Actual local Dynamic Worker | `npm run test:dynamic-worker`, `workers/gateway` | Pass; scoped provider/module smoke case and all **16** actual AWS-0568 feature selections run in local workerd; omitted modules and gateway secrets remain absent |
| JavaScript/Python product behavior | `node --test scripts/plan.test.mjs scripts/variants.test.mjs`, AWS-0568 product directory | **11 test executions pass**; four tests execute twice because the plan test imports the variants test; this is not a claim of 11 unique cases |
| AWS model validation | `python scripts/validate-aws.py`, exact product copy with pinned botocore | **32 plans, 160 operation inputs and 64 partial response shapes pass**; no AWS calls |
| Actual Powertools example | `python scripts/example_test.py`, exact product copy and pinned requirements | **7/7 pass**, including failure after an external side effect |
| Deterministic routing corpus | `node scripts/evaluate-routing.mjs --deterministic <report.json>` | **34/34 fallback-contract expectations pass**, zero model calls |
| Scripted typed routing corpus | `node scripts/evaluate-routing.mjs --fixture <report.json>` | **34/34 scripted expectations pass**, 24 fake provider calls |
| Source-preparation evidence | `node review/verify-source-preparations.mjs`, `workers/gateway` | Both products source-ready, publication blocked; generated evidence remains identical to tracked bytes |
| Source/working tree integrity | `git status --porcelain`; `git diff --check` | Clean tracked source and no whitespace errors at completion |

Restricted execution initially blocked offline Python child processes and local workerd listening on loopback with `EPERM`. The identical test commands passed with permitted local process/loopback execution. These environment failures were not counted as product defects. The routing CLI requires an output filename; its documented invocation above was used for the recorded successful runs.

Product validation scripts write evidence files. They were run against copies of the exact tracked product trees outside the checkout, preserving the verified source tree. Both regenerated validation files exactly match the checked-in files:

| Product | Validation SHA-256 |
| --- | --- |
| AWS-0568 | `022bfb17c2cdf78fc06f38f8dbc65d344d31a4226d63420c99dea3ad4eac3869` |
| SW-PT-0006 v2 | `2f88620e794f05883445ef85dccc4e8c87b1b9c838724f97a50316c76e7ed257` |

Source preparation returned payload hashes `57ce8e7d4e78fdb24d7bd6c3327ce4ea9eb95912af8ed32f666ebb6f914e5d10` for AWS-0568 v2 and `80a57963f64ae52ab0f75ad9b58bbab737db9891b13d7a87961f0b5947239fbf` for SW-PT-0006 v2, with `publication: blocked` for both. Passing local source/staging fixtures does not create production R2 objects or genuine publication approvals.

## CI distinction

GitHub's exact-head PR workflow-run query returned `workflow_runs: []`. Its combined-status query returned `statuses: []`. The exact commit's [check-runs endpoint](https://api.github.com/repos/Cirrefera/Second-Wind/commits/8711cdcf2dc31b16dc599da6db7cd0afd783a537/check-runs) returned `total_count: 0`.

The results above are fresh **local exact-head evidence**, not GitHub CI evidence. The draft workflow only triggers on main pushes or manual dispatch. It was not dispatched to obtain tests, because it also contains production mutations.

## Integration and release blockers

### 1. Demonstrated source conflicts with the accepted release

Reproduction in an isolated checkout with both immutable commits fetched:

```bash
git merge-tree --write-tree a853b9edbdb00be21b7ba157e7deb3ed36782643 8711cdcf2dc31b16dc599da6db7cd0afd783a537
```

The command returns exit status `1` with content conflicts in:

- `workers/gateway/src/commerce.js`: the accepted release moves prepared-purchase settlement into fenced recovery/settlement helpers, while the draft modifies the earlier inline settlement/delivery path to carry journey observations. A correct integration must preserve prepared-state recovery, private-token authentication, one-owner settlement, uncertainty handling, and the draft's applicable delivery/event changes.
- `workers/gateway/src/discovery.js`: accepted readiness imports and draft observation imports overlap. Both required behaviors must survive resolution.

The generated conflict tree was `8f795d3d3877c080903f448f49ebcf0e3d99cea9`. `git merge-tree` writes Git objects but does not merge a branch, update the index, or alter working files. No conflict was resolved in this task and no combined-source test result is claimed.

**Suggested new stable backlog item:** Integrate PR #5 with the accepted main release while preserving FIX-01–03; resolve the demonstrated conflicts, verify both sets of regressions and release controls on the resulting exact commit, and retain separate product-publication prerequisites. This is additional implementation beyond FIX-06's verification/assessment scope. Parent should allocate the next unused stable ID.

### 2. The draft head is older than FIX-01–03

Its isolated tree lacks the accepted interrupted-purchase regression file and release-acceptance scripts; it still has the older payment-readiness contract and old required-secret declaration. These are comparisons between the two current trees, not a claim that Git would automatically delete the newer files during a real merge. Non-conflicting main changes can be retained by normal integration. Direct deployment of this old head would omit accepted protections, so the draft must not replace the accepted main code.

### 3. Existing catalog, routing and publication prerequisites remain

These issues are already represented in the canonical backlog and are not new discoveries requiring duplicate IDs:

- **FIX-07:** Migration `0004_routing_manifests.sql` creates an empty versioned table. The structured resolver selects from that table. Reviewed matching manifests must exist for the intended rollout. The draft workflow already includes migrations 0003 and 0004; they are not missing from that workflow.
- **FIX-08, FIX-10 and FIX-11:** Local source preparations correctly remain publication-blocked. AWS-0568 commercial allocation and genuine review/registration inputs remain unresolved.
- **FIX-12:** Optional live model assistance remains disabled in source. The deterministic corpus agrees with semantic target labels on 26/34 cases, with six false-candidate cases and two missed routes. Its 34/34 fallback-contract result validates the expected existing fallback behavior; it does not establish semantic accuracy. Scripted output cannot establish live model quality or justify activation.
- **FIX-13 and FIX-14:** Local emitter/outbox fixtures do not prove arrival in the actual raw and specialized sinks.
- **FIX-05 follow-up:** The owner subsequently clarified that the original product is the useful combination, synthesis, structure, and adaptation of publicly sourced material. The adopted policy is recorded in `docs/FIX05_CONTENT_POLICY_REVIEW.md`; no A/B policy choice remains outstanding. This does not change the exact-head test results above.

## Scope limits

No GitHub writes, merge, deployment, migration, live Cloudflare inference, production D1/R2 mutation, product publication, quote, purchase, funds transfer, or AWS service call occurred. Public package downloads were used only to install locked/pinned local verification dependencies. PR #5 and its source commit remain unchanged.

## Primary source references

- [Exact verified draft tree](https://github.com/Cirrefera/Second-Wind/tree/8711cdcf2dc31b16dc599da6db7cd0afd783a537)
- [Draft workflow](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/.github/workflows/deploy.yml)
- [Draft review instructions](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/workers/gateway/review/README.md)
- [Actual Dynamic Worker integration test](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/workers/gateway/tests/dynamic-worker.integration.mjs)
- [Accepted application release](https://github.com/Cirrefera/Second-Wind/commit/048f08853e863391cf8652cafdd464140e810616)
- [Canonical tracker at assessed main](https://github.com/Cirrefera/Second-Wind/blob/a853b9edbdb00be21b7ba157e7deb3ed36782643/docs/SECONDWIND_FIX_TRACKER.md)
