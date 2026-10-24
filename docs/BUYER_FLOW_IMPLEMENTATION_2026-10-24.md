# Buyer-flow repair implementation

Baseline: `3e81553d9ada199fadc8065e6774af29350d24a6`.
Status: gateway and migration deployed through PR #19; AWS-0568 v3 activated through PR #20. Three Luna agents implemented disjoint areas; integration and live verification corrected method pinning, required recovery credentials, catalog-independent retry lookup, and empty accepted POST parsing.

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

## Production evidence — 2026-10-24

- [PR #19](https://github.com/Cirrefera/Second-Wind/pull/19) merged as `8d01ec19b44a7b51bb4ea4734b5be367ec4e9dcb`; [deployment 40135559919](https://github.com/Cirrefera/Second-Wind/actions/runs/40135559919) succeeded and health identified that commit. D1 contains migration 0005.
- [PR #20](https://github.com/Cirrefera/Second-Wind/pull/20) merged as `28fda8ba16f9feb14332d7f77b5a456d8fed9898`; [publication 40135831711](https://github.com/Cirrefera/Second-Wind/actions/runs/40135831711) activated v3 successfully. The live catalog and immutable records match the reviewed v3 hashes.
- Configured Python guide POST returned an official x402 402 challenge for `1000000` atomic USDC units ($1), with the Python configuration saved in its acceptance. Discovery/OpenAPI advertise POST and its language requirement.
- The client deliberately disconnected during trial `trial_c7fefc7f-1282-4a58-9f18-a70b2e027f03`. HTTP and Cap’n Web recovered its completed result. Identical POST retry returned the same result before and after v3 activation; altered input returned 409, omitted credentials returned 400. D1 recorded one trial.started and one trial.completed.
- V3 JavaScript trial through Cap’n Web and Python-source inspection through the JavaScript HTTP sandbox both completed. Table + expiry selections each reached the official $2.50 challenge against the $5 maximum. Direct R2 readback confirmed JavaScript planner/expiry files only for JavaScript, Python planner/expiry files only for Python, and the shared schema, README and license in both packages. Python code was not executed in Code Mode.
- The v2 table + expiry acceptance `q_c43e1f26-278a-4d06-ae2b-6ae22a40dd89` still returned its original $2.50 challenge after v3 activation. Both original v2 manifest and payload hashes remain unchanged. Existing acceptance expiry rules remain in force.
- Live verification exposed one final edge case: a bodyless accepted POST was rejected by JSON parsing before saved configuration could be loaded. The follow-up permits an empty body only in the paid-route parser; malformed nonempty JSON remains rejected and all configuration, acceptance, payment and delivery checks remain in place.

The existing required GitHub checks ran successfully; no new test suite was added. These observations reached the payment challenge and verified prepared delivery bytes without submitting payment. No funded settlement or post-payment delivery is claimed for these operational checks.
