# FIX-04 — PR verification and production release controls

## Outcome

The workflow changes are implemented and locally verified in commit `42494048f132f11b53640ddae0d2590f56e7c844`, tree `d65328ab304039f75932118b992930fd530fe4d2`. External GitHub protections and credential scope still require the owner's approval and configuration. FIX-04 remains **BLOCKED** on those steps and subsequent authorized merge/release acceptance.

The source change adds PR verification and a production job restricted to this repository's `main`. It does not, by itself, protect `main` or configure the environment's branch policy. The configuration below is a concrete proposal, not a claim that settings were applied.

## Current evidence

Reviewed October 22, 2026, against main `a853b9edbdb00be21b7ba157e7deb3ed36782643`:

- GitHub's branch endpoint reports `protected: false`; required status check enforcement is off.
- Repository rulesets returned an empty array.
- The environment list contains only the existing `github-pages` environment. A `production` environment is absent.
- Current main contains only `.github/workflows/deploy.yml`; it triggers on main pushes and manual dispatch and has no PR verification trigger or deployment job branch guard.
- GitHub's workflow inventory also lists historical audit, revert, and verify workflow records whose files are absent from current main. A historical record is not evidence that its workflow runs on current main. Older refs can still contain older workflow definitions, which is why scoping deployment credentials matters.
- The accepted application remains release `048f08853e863391cf8652cafdd464140e810616`, from [successful run 39816488828](https://github.com/Cirrefera/Second-Wind/actions/runs/39816488828). This batch has not changed production.

Metadata sources: [main branch](https://api.github.com/repos/Cirrefera/Second-Wind/branches/main), [rulesets](https://api.github.com/repos/Cirrefera/Second-Wind/rulesets), [environments](https://api.github.com/repos/Cirrefera/Second-Wind/environments), and [workflow inventory](https://api.github.com/repos/Cirrefera/Second-Wind/actions/workflows). The connector supports the first two reads; the latter two were read through the public unauthenticated GitHub API after the connector rejected those endpoint families. No credential values were retrieved.

## Source behavior

`verify.yml` runs on pull requests targeting `main`, including drafts. Its stable job/check name is **Verify application**. It has read-only repository permissions, no deployment environment or referenced secrets, no saved checkout credential, and no path/draft filter. New commits supersede older PR checks through a separate PR concurrency group.

The PR job runs locked dependency installs with install scripts disabled, then all existing main checks: legacy utilities, actual Pages ingress, release-acceptance failure cases, gateway tests, and both builds. It does not run migrations, paid endpoints, release acceptance against production, or deployment commands.

`deploy.yml` retains its existing checks, input preflight, migration order, exact-commit gateway/Pages uploads, and postdeployment acceptance. Its deployment job now requires all of:

1. Repository `Cirrefera/Second-Wind`.
2. Ref `refs/heads/main`.
3. Event `push` or `workflow_dispatch`.

The job references the `production` environment. Its non-canceling concurrency group moved from workflow scope to job scope, so a rejected feature-branch dispatch cannot occupy the production release queue. Locked installs disable lifecycle scripts, and checkout credentials are not persisted.

## Exact proposed GitHub configuration

Apply the following together after owner authorization. These settings preserve the existing main-based release path without adding a second mandatory human reviewer or a merge queue.

### Protect main

| Setting | Proposed value |
| --- | --- |
| Target | Exact branch `main` |
| Require a pull request | Enabled |
| Required approving reviews | 0; owner-controlled merge remains available |
| Required status check | `Verify application`, expected source **GitHub Actions**, confirmed from the actual PR check |
| Require branch up to date | Enabled |
| Apply to administrators / prevent bypass | Enabled; no routine bypass actor |
| Allow force pushes | Disabled |
| Allow deletion | Disabled |

Create this as a branch protection rule or an equivalent ruleset, not conflicting duplicate policies. Use the actual check emitted by the batch PR; a workflow title is not necessarily its check name. Require the current tested commit. Do not require the post-merge production deployment check before merge, since that would create a circular dependency.

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

The current connector does not expose writes for branch protections, environment policies, or Actions secrets. An authorized administrative surface or the owner must apply these concrete settings. A new `environment:` entry alone can cause GitHub to create an unprotected environment; finish this configuration before authorizing the batch merge.

### Release sequence after configuration

Confirm the batch PR's current **Verify application** check is successful. Read back the main protection, environment branch rules, and non-secret credential inventory. With the owner's merge/release authorization, merge the exact reviewed head through GitHub and let the existing main workflow execute. Its preflight must pass before mutations, and its acceptance must identify the exact merge commit and both deployments.

A feature-branch manual deployment is not a test method. A failed input preflight should be corrected at the approved environment; it is not a reason to restore unrestricted repository credentials. No negative live deployment, funded canary, or automatic rollback was performed for this review.

## Verification

Environment: Node `v24.19.0`, npm `11.9.0`, repository lockfiles unchanged, both installs performed with `--ignore-scripts --no-audit --no-fund`.

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

The matrix allows only this repository's main push/dispatch and rejects feature branches, a tag named main, PR refs, other repositories, and PR/PR-target/workflow-run/schedule events. It is local semantic evidence, not a claim that a forbidden live dispatch was attempted. Review also confirmed input preflight precedes all four mutation commands and acceptance follows them.

The restricted sandbox initially prevented the release suite's child process. The unchanged offline command passed with permitted subprocess execution. That environment limitation was not treated as a source failure. Actionlint's downloaded archive matched its published SHA-256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`.

GitHub PR-run evidence is recorded in the canonical tracker and PR description once available. Local checks do not establish externally enforced settings or production acceptance.

## Primary documentation

- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub protected branches and required check sources](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub required check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- [GitHub deployment environments and branch restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
