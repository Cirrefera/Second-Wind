# Buyer-flow repair implementation

Baseline: `3e81553d9ada199fadc8065e6774af29350d24a6`.
Status: implementation candidate; not deployed. Three Luna agents implemented disjoint areas; the integration review corrected method pinning and preserved historical snapshot replay.

## Changes

Configured whole products advertise POST with JSON configuration. The route validates the initial method before acceptance creation and pins the selected method in new acceptance snapshots. Legacy acceptance methods are derived from their existing snapshots, independent of current catalog status. Component acceptance remains GET. Official `payments.js`, facilitator verification/settlement, price allocation, package locks and historical records are unchanged.

Trials require a pair of caller-known `input.trial_id` and `input.trial_token`. Both must be present and valid. A repeat-safe companion D1 table stores the normalized request hash and execution owner. Creation of both records is atomic. A lost write acknowledgement is resolved through readback; only the owner that inserted the identity can execute. Repeats recover stored state, reject mismatches and never automatically execute again. Missing credentials are rejected before execution; callers must retain them before starting. Identical retries read the original request identity before consulting the current catalog, so a version change cannot cause another execution. No claim is made that bounded waitUntil survives arbitrary termination. Recorded results can be read after a catalog version changes; selecting and accepting still require the current release and an unexpired completed trial.

New component manifests can declare a complete per-language file allowlist for each component. The selector pins only the selected language files plus explicitly listed shared files. Legacy manifests retain their original selection semantics. AWS-0568 v3 is prepared separately; its executable bytes, component amounts and dependencies are inherited unchanged from v2. The new mapping retains the root planner, selection schema, README and license; each selected optional feature contributes its language-specific module. Python hosted execution remains unsupported.

## Source evidence and limits

- Gateway bundle compiled successfully; syntax and diff checks passed.
- No new tests added. Existing CI fixture inputs now carry required trial credentials and load the additive migration; assertions and release checks remain intact. Production verification is recorded separately after deployment.
- V2 publication input and review files are unchanged. V3 payload identity is `sha256:088904ab15e2a0b2419e3cc18a3c134c3ba1dab8e631e4190dd963308f05272c`.
- V3 generator verifies the preserved v2 input digest before producing the new draft. Existing executable validation evidence is not represented as execution of the new delivery mapping.
- Current candidate source does not establish a funded production purchase or completed production trial.

## Release sequence

1. Review the bounded diff. Apply additive `0005_trial_recovery.sql` before the gateway deployment; the existing production workflow now includes it.
2. Deploy the gateway through the established GitHub release path. Existing workflow tests and required checks are preserved, not disabled. Required release checks must pass before this implementation is merged; no extra test suite is introduced.
3. Review and register the exact v3 product input through the existing publication process, then activate it only after the compatible gateway is deployed. Do not activate it on the old selector, which would ignore the mapping. Existing v2 purchase snapshots and payloads must remain available.
4. Read deployment identity, discovery method/configuration and release version. Record runtime and paid-flow evidence only when actual authorized activity exists.

## Primary references

- https://developers.cloudflare.com/d1/worker-api/d1-database/ — batch statements are atomic transactions.
- https://developers.cloudflare.com/d1/observability/debug-d1/ — lost/timed-out writes can still commit; retry requires idempotency and readback.
- https://developers.cloudflare.com/workers/runtime-apis/context/ — waitUntil provides bounded continuation after response/disconnect, not durable execution.

These references were retrieved through Exa; existing code and deployed snapshots supplied the project-specific evidence.
