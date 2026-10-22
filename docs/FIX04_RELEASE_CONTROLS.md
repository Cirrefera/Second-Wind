# FIX-04 — PR verification and production release controls

## Outcome

The owner authorized consolidation and merge. The combined source was merged through [PR #5](https://github.com/Cirrefera/Second-Wind/pull/5) and deployed successfully as main commit `548bcc204d59785951da11e85943607d5e62d9fd`. [PR #7](https://github.com/Cirrefera/Second-Wind/pull/7), whose head was `b812a98`, was automatically marked merged because its changes are included. Production acceptance passed. **FIX-04 remains BLOCKED only on external GitHub administration settings and verification of credential scoping; merge and release acceptance are complete.**

The released workflow adds PR verification and restricts the production job to this repository's `main`. It does not, by itself, protect `main` or configure the environment's branch policy. The remaining configuration below is a concrete proposal, not a claim that settings were applied. See [the consolidation status](CONSOLIDATION_STATUS.md) for the combined release outcome and remaining work.

## Current evidence

After the authorized consolidation on October 22, 2026:

- Tested integration head: `57636d4c84e0a9a96ed078d86413d4e526447106`; tree: `6c5cd346c5f5e491973da1e68294c11d63de78ca`.
- [PR verification run 39858026572](https://github.com/Cirrefera/Second-Wind/actions/runs/39858026572), job `120101203757`, completed successfully.
- [Deployment run 39858195268](https://github.com/Cirrefera/Second-Wind/actions/runs/39858195268), job `120101770147`, completed successfully. Production acceptance returned `accepted: true` at `2026-10-22T21:33:58Z` (5:33:58 p.m. EDT).
- Acceptance returned `accepted: true` for expected commit `548bcc204d59785951da11e85943607d5e62d9fd`, gateway version `b761dab0-61e2-4549-ae59-8d0003cef876`, and Pages deployment `b6fb9357-1f1c-4064-9617-5eb04424e26e`. It reported one live product and `funded_purchase_verified: false`.
- External readback still reports `main` as `protected: false` and repository rulesets as `[]`.
- The `production` environment now exists because the deployment referenced it. Its readback has `protection_rules: []` and `deployment_branch_policy: null`; creation did not configure protection.
- Deployment credential scoping remains unverified. Successful deployment does not prove the credentials are confined to the environment.

### Historical baseline before consolidation

The following observations were recorded against earlier main `a853b9edbdb00be21b7ba157e7deb3ed36782643` and are retained as historical evidence:

- GitHub's branch endpoint reports `protected: false`; required status check enforcement is off.
- Repository rulesets returned an empty array.
- The environment list then contained only the existing `github-pages` environment; `production` was absent.
- That main revision contained only `.github/workflows/deploy.yml`; it triggered on main pushes and manual dispatch and had no PR verification trigger or deployment job branch guard.
- GitHub's workflow inventory also listed historical audit, revert, and verify workflow records whose files were absent from that main revision. A historical record is not evidence that its workflow runs on current main. Older refs can still contain older workflow definitions, which is why scoping deployment credentials matters.
- The then-accepted application was release `048f08853e863391cf8652cafdd464140e810616`, from [successful run 39816488828](https://github.com/Cirrefera/Second-Wind/actions/runs/39816488828). The accepted consolidation release above supersedes it.

Metadata sources: [main branch](https://api.github.com/repos/Cirrefera/Second-Wind/branches/main), [rulesets](https://api.github.com/repos/Cirrefera/Second-Wind/rulesets), [environments](https://api.github.com/repos/Cirrefera/Second-Wind/environments), and [workflow inventory](https://api.github.com/repos/Cirrefera/Second-Wind/actions/workflows). The connector supports the first two reads; the latter two were read through the public unauthenticated GitHub API after the connector rejected those endpoint families. No credential values were retrieved.

## Source behavior

`verify.yml` runs on pull requests targeting `main`, including drafts. Its stable job/check name is **Verify application**. It has read-only repository permissions, no deployment environment or referenced secrets, no saved checkout credential, and no path/draft filter. New commits supersede older PR checks through a separate PR concurrency group.

The PR job runs locked dependency installs with install scripts disabled, then legacy utilities, actual Pages ingress, release-acceptance failure cases, gateway tests, the actual isolated Dynamic Worker integration checks, and both builds. It does not run migrations, paid endpoints, release acceptance against production, or deployment commands.

`deploy.yml` retains the checks, input preflight, ordered migrations `0001` through `0004`, exact-commit gateway/Pages uploads, and postdeployment acceptance. The component/routing migrations create schema without publishing products. Its deployment job requires all of:

1. Repository `Cirrefera/Second-Wind`.
2. Ref `refs/heads/main`.
3. Event `push` or `workflow_dispatch`.

The job references the `production` environment. Its non-canceling concurrency group moved from workflow scope to job scope, so a rejected feature-branch dispatch cannot occupy the production release queue. Locked installs disable lifecycle scripts, and checkout credentials are not persisted.

## Exact proposed GitHub configuration

Complete the following together through an authorized administrative surface. These remaining settings preserve the released main-based deployment path without adding a second mandatory human reviewer or a merge queue. The owner's consolidation authorization has already been executed; this section does not reopen merge or release approval.

### Protect main

| Setting | Proposed value |
| --- | --- |
| Target | Exact branch `main` |
| Require a pull request | Enabled |
| Required approving reviews | 0; owner-controlled merge remains available |
| Required status check | `Verify application`, expected source **GitHub Actions** (confirmed app ID `15368`) |
| Require branch up to date | Enabled |
| Apply to administrators / prevent bypass | Enabled; no routine bypass actor |
| Allow force pushes | Disabled |
| Allow deletion | Disabled |

Create this as a branch protection rule or an equivalent ruleset, not conflicting duplicate policies. Use the actual emitted check; a workflow title is not necessarily its check name. Require the current tested commit for subsequent PRs. Do not require the post-merge production deployment check before merge, since that would create a circular dependency.

### Configure the production environment

| Setting | Proposed value |
| --- | --- |
| Environment | `production` |
| Deployment branch policy | Selected branches and tags |
| Allowed branch rule | Exact branch `main` |
| Allowed tag rules | None |
| New mandatory environment reviewers | None proposed |
| Deployment credentials | Environment-scoped `CLOUDFLARE_API_TOKEN` and matching release inputs |

Use an explicit **branch** rule for `main`, not an unrestricted policy or a tag rule. GitHub documents that “protected branches only” permits every branch when none are protected; the explicit selected-branch rule avoids that ambiguity.

Put the existing approved values for `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `X402_EXPECTED_PAY_TO` in this environment through the owner's credential source. Secret names remain unchanged. Do not change the designated merchant, Worker secrets, facilitator key, bindings, D1/R2 targets, or Cloudflare token permissions as part of this migration.

After confirming that the environment values are provisioned, remove or restrict any repository/organization-level fallback that makes the deployment token available to this repository outside that environment. Its present origin was not inspected. An old branch workflow without the new guard/environment must not retain an unrestricted deployment token. Do not print, export, commit, or attempt to read encrypted secret values to perform the migration.

The current connector does not expose writes for branch protections, environment policies, or Actions secrets. An authorized administrative surface or the owner must apply these concrete settings. GitHub has now created the referenced `production` environment without protection; configuring it and verifying credential confinement remain outstanding administrative work.

### Remaining external completion sequence

Apply the main protection and production branch policy, provision the approved environment-scoped release inputs, and remove or restrict unrestricted credential fallbacks after provisioning is confirmed. Read back the protection, exact branch rules, and non-secret credential inventory. Record that evidence before marking FIX-04 complete. The merged source and accepted production release recorded above do not need another merge authorization.

Subsequent releases should follow the existing main workflow, with input preflight before mutations and exact-commit acceptance after deployment. A feature-branch manual deployment is not a test method. A failed input preflight should be corrected at the approved environment; it is not a reason to restore unrestricted repository credentials. No negative live deployment, funded canary, or automatic rollback was performed for this review.

## Verification

### Accepted consolidation verification

Both the successful PR verification and deployment jobs ran the combined checks:

| Check | Result in both jobs |
| --- | --- |
| Gateway suite | 174/174 pass |
| Release acceptance failure-path suite | 32/32 pass |
| Actual Pages ingress | 21/21 pass |
| Legacy utilities | 55 assertions pass |
| Actual isolated Dynamic Worker checks | All 16 selected feature packages pass |
| Gateway and Pages builds | Both pass |

The deployment job additionally completed migrations and both deployments, followed by successful production acceptance for the exact merge commit and identities above. Neither the passing tests nor the accepted deployment establish that external branch/environment settings or credential scoping are configured.

### Historical FIX-04 source verification

The initial workflow implementation was commit `42494048f132f11b53640ddae0d2590f56e7c844`, tree `d65328ab304039f75932118b992930fd530fe4d2`. Its local environment was Node `v24.19.0`, npm `11.9.0`, with repository lockfiles unchanged and both installs performed with `--ignore-scripts --no-audit --no-fund`.

| Check | Result |
| --- | --- |
| Gateway suite | 76/76 pass |
| Release acceptance failure-path suite | 32/32 pass |
| Legacy utilities and actual Pages ingress | 55 assertions plus 21/21 tests pass |
| Gateway and Pages builds | Both pass |
| `actionlint` v1.7.12, both workflow files | Pass |
| Actual deployment expression, offline event matrix | 72 combinations: 2 allowed, 70 rejected |
| Independent workflow review | No blocking source defect found |
| `git diff --check` | Pass |

The matrix allows only this repository's main push/dispatch and rejects feature branches, a tag named main, PR refs, other repositories, and PR/PR-target/workflow-run/schedule events. It is local semantic evidence, not a claim that a forbidden live dispatch was attempted. That initial review confirmed preflight before all four then-existing mutation commands and acceptance afterward. Consolidation adds migrations `0003` and `0004` within the same ordering: preflight, all four migrations, both deployments, acceptance.

The restricted sandbox initially prevented the release suite's child process. The unchanged offline command passed with permitted subprocess execution. That environment limitation was not treated as a source failure. Actionlint's downloaded archive matched its published SHA-256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`.

[PR #7](https://github.com/Cirrefera/Second-Wind/pull/7), then a draft, triggered [run 39824436671](https://github.com/Cirrefera/Second-Wind/actions/runs/39824436671). Its **Verify application** job (`119983862990`) completed successfully on Node v24.21.0, with all then-listed application tests/builds passing. GitHub checked out test merge `e9d77c65bb97aeec1a4b782d337fd45b0ebc7d76` for PR head `bee0227a5b5db623aadae55a1ebb4cead901e7c7`; their tree was the identical `707ba29d52489436851eddabd813a0731cfad9e3`. The check source was GitHub Actions app `15368`. Enclosing run metadata still said in_progress at that historical evidence revision; that record asserted only the job's successful completion. The completed consolidation CI, merge, deployment, and production acceptance are recorded separately above.

## Primary documentation

- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub protected branches and required check sources](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub required check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- [GitHub deployment environments and branch restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
