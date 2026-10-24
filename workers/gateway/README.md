# Second Wind application Worker

`secondwind-gateway` serves discovery, sandbox selection, accepted purchases, execution, delivery and recovery. Official `@x402/hono` middleware owns payment challenges, verification and settlement. HTTP and Cap'n Web share application functions and D1 purchase records.

`src/payments.js` restores the standard middleware pattern documented by [Cloudflare](https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-http-content/) using the existing locked `@x402/hono` 2.28.0 package. Its SDK lifecycle hooks record application claims and receipts; `commerce.js` does not call verification or settlement. Hono context storage keeps hook state request-local. The SDK builds and serializes the challenge; legacy JSON consumers receive a copy of that SDK-produced challenge.

The settlement claim retains its purchase ID, owner and state predicates. Its success check uses a positive affected-row count because [D1 reports total changes](https://developers.cloudflare.com/api/resources/d1/), including the existing telemetry trigger's insert. Requiring exactly one incorrectly rejected successful claims in workerd. The SQLite fixture now mirrors that behavior, and the bundled Worker has a real workerd/D1/R2 payment-and-replay regression test with an offline facilitator.

Pages runs the small advanced-mode entry in `src/worker.js`. It transparently forwards application requests through `GATEWAY → secondwind-gateway`, preserving the original Response and WebSocket upgrade; remaining requests use static assets. There is no separate Pages cashier or public Workers URL proxy. This ingress uses existing account-level deployment permissions, not zone-route creation. The API-only `/` may return404.

## Bindings and configuration

| Gateway binding | Resource or purpose |
| --- | --- |
| `SW_DB` | Existing `second-wind-catalog` D1 database |
| `PAYLOADS` | `secondwind-payloads`: canonical versioned payloads |
| `DELIVERIES` | `secondwind-deliveries`: private confirmed-settlement recovery copies |
| `LOADER` | Fresh Code Mode isolates; no application secrets or outbound fetch granted |
| `CF_VERSION_METADATA` | Actual Worker version ID, tag and creation timestamp |

The encrypted `X402_PAY_TO`, `X402_EXPECTED_PAY_TO`, and `CDP_FACILITATOR_KEY` secrets belong on the gateway. Wrangler validates their presence and retains them on deployment. Do not re-create existing secrets or put their values in source. Public payment configuration is USDC on Base (`eip155:8453`) through CDP. Pages needs only its gateway service binding.

### Payment configuration release prerequisite (FIX-01)

`X402_EXPECTED_PAY_TO` must be supplied from an independently reviewed merchant
recipient for **Base mainnet**, not copied from the current Worker value or inferred
from a test fixture, branch name, or historical Sepolia test. The same reviewed
input must be configured as the GitHub Actions secret `X402_EXPECTED_PAY_TO` for
release acceptance. Never store a wallet private key in either recipient setting.

The application requires a valid, non-burn recipient matching that assertion
before it prepares a new purchase or serves a payment challenge.
Existing paid versions, receipts, and authenticated delivery recovery remain
available independently of this configuration gate. Matching configuration is an
operator assertion; it does not independently prove wallet control or a successful
funded purchase.

`/api/proof` and x402 discovery return `payment_recipient_configured` and
`payment_recipient_verified`, plus a value-free `payment_recipient_status` and
`payment_configuration_error`. Statuses distinguish missing, invalid, burn,
conflicting, unverified, invalid-verification, mismatched, verified, and unsupported
network configuration. Recipient values and credentials are excluded from these
diagnostics; payment metadata includes only the intended recipient.

The October 22 read-only check found `X402_PAY_TO` present as an encrypted binding,
but `X402_EXPECTED_PAY_TO` absent. The live validator reported the recipient as
unconfigured. The current encrypted recipient value is inaccessible, so its exact
validation defect remains unknown; do not claim it was corrected or invent an
address to make readiness pass.

Before an authorized release, independently confirm the merchant input, configure
the GitHub acceptance secret, and stage the approved Worker correction. Cloudflare
documents `wrangler versions secret bulk` as a way to prepare a version without
deploying it; ordinary `wrangler secret put` and `wrangler secret bulk` deploy
immediately. With owner-approved values in a protected, untracked JSON file, the
staging command from the repository root is:

```sh
./workers/gateway/node_modules/.bin/wrangler versions secret bulk "$SECONDWIND_PAYMENT_CONFIG_FILE" --config workers/gateway/wrangler.toml
```

That file contains `X402_EXPECTED_PAY_TO` and includes `X402_PAY_TO` only when its
correction is specifically approved. It must not contain null deletions or
unrelated credentials. Record the returned version ID and keep that version as
the latest uploaded version until the GitHub release; secret inheritance uses the
most recently uploaded version, even if it has not been deployed. Recheck the
inheritance source after any intervening upload. Staging is not production
acceptance. The approved GitHub release must pass `node scripts/release-acceptance.mjs
--check-inputs` before mutations and `npm run accept:release` after both deployments.
Production configuration, merge, and deployment remain separate authorized steps.

References: [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
[Wrangler version secret commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/#versions-secret-bulk),
and [secret inheritance behavior](https://developers.cloudflare.com/workers/observability/errors/#inherit-binding-errors-10057).

## Public interfaces

All paths below use `https://secondwindai.com`.

| Method/path | Purpose |
| --- | --- |
| `GET /api/tools`, `/api/proof`, `/openapi.json`, `/llms.txt` | Free discovery and configuration readiness |
| `GET /.well-known/x402`, `/v2/x402/discovery/resources`, `/discovery/resources` | Generated resource discovery; last path is a compatibility alias |
| `POST /api/resolve`, `/api/configure` | Public intent matching and input validation |
| `GET /api/x402/{sku-or-slug}` | Quoted product purchase; executable Bedrock products use `POST` |
| `GET /api/x402/{sku-or-slug}/artifact` | Artifact purchase returning exact bytes, with payment and recovery metadata in response headers |
| `POST /rpc` | A selected product request, or one explicitly requested JavaScript Code Mode invocation |
| `POST /capnp`, WebSocket `/capnp` | HTTP batch/promise pipelining and bidirectional Cap'n Web sessions |
| `GET /api/purchases/{paymentId}/delivery` | Authenticated free redelivery |
| `POST /api/purchases/{paymentId}/reconcile` | Authenticated repair from the original finalized transaction; no payment submission |
| `POST /api/purchases/{paymentId}/recovery-challenge`, `/api/purchases/{paymentId}/recover` | Lost-token wallet recovery |
| `GET /health`, any application `OPTIONS` | Worker liveness/version evidence and CORS preflight |

`/api/catalog` redirects to `/api/tools`. Free Cap'n Web methods are `describe`, `search`, `configure`, `recoveryChallenge`, `recoverWithWallet` and authenticated `reconcilePurchase(paymentId, recoveryToken, transaction)`. The custom quote endpoint and RPC methods are removed. `getGrant(paymentId, recoveryToken)` returns a purchase-scoped capability with `info`, `deliver` and, where entitled, `execute`. `recoverSession` reissues that capability from D1 after a disconnect.

## Purchase and content contract

Discovery describes maximum amounts as application metadata, with no signable `accepts` entries. Only official `@x402/hono` generates payment requirements at the selected purchase endpoint. Whole-product buyers request the product directly (or POST `/rpc` with SKU and configuration); component buyers use the existing trial → selection → acceptance flow. No replacement quote endpoint is introduced. Internal table/column and versioned telemetry names are retained for historical compatibility; they do not define a buyer step.


1. For component products, inspect the maximum, test in the sandbox, select components and accept the final scope before payment. The final amount is bounded by the maximum; the maximum is not automatically charged. Whole-product purchases select the complete declared deliverable at its stated amount.
2. Follow the accepted purchase URL or initial 402 challenge. New purchase URLs use `acceptance_id`. Historical `quote_id` URLs and immutable ledger rows remain readable for payment/recovery compatibility. The records pin SKU, version, input, final amount, recipient and content hash. New acceptance records expire after five minutes. While the authenticated trial remains valid, accepting the same selected scope again renews an expired, unclaimed acceptance for five minutes, retaining its ID, scope, amount and recipient. Once a purchase is claimed, reacceptance cannot renew or reset it. R2 payloads must exist and match their exact-byte hash; delivery never switches to the latest catalog version.
3. Sign the SDK's 402 requirements, then retry with `PAYMENT-SIGNATURE` and a private recovery token. Official verification precedes a durable unique claim; only its owner executes and permits SDK settlement. The SDK owns its bounded identical-payment pending retry. Unresolved outcomes remain uncertain, and application retries cannot launch another settlement.
4. Save `paymentId`, `recoveryToken`, the receipt and its transaction hash. Verify content using the response's explicit `content_hash_scope`; an R2 artifact is base64 encoded within the JSON delivery envelope. The artifact purchase route and authenticated delivery with `?format=artifact` return its exact raw bytes instead.

Code Mode requires an explicit `language: "javascript"` (or `"js"`). It orchestrates the exposed product operations; it does not translate an inventory item into another language. One execution purchase buys one invocation and its persisted result. Repeating its exact code/language/invocation ID recovers that result; it does not buy unlimited execution. SKU delivery grants do not grant arbitrary code execution. Cap'n Web delivery/result-recovery callbacks report bounded `start`/`complete` notifications; a disconnected callback cannot change the purchase outcome.

## Private recovery credentials

`X-Recovery-Token` is a bearer credential: 32 cryptographically random bytes encoded as 43 unpadded base64url characters. Keep it private and retain it with the accepted purchase URL. `Authorization: Bearer <token>` is also accepted on HTTP recovery. Payment IDs, transaction hashes and on-chain payment authorizations are not recovery credentials; the payment signature can become observable on chain.

Prefer choosing the token **before** the paid request so a lost response is recoverable. A Node client can create one with:

```js
import { randomBytes } from "node:crypto";
const recoveryToken = randomBytes(32).toString("base64url");
// Persist it privately, then send it as X-Recovery-Token on the paid request.
```

If omitted, the server generates a token and returns it with the first purchase response. Normal delivery/session recovery uses D1 and R2, costs nothing, and never calls the facilitator. Retry a lost response using the original purchase URL, payment proof and retained token, or use the authenticated delivery endpoint once the payment ID is known.

If a server-generated token and response were both lost, retry the original payment request to discover its payment ID and recovery-challenge URL. An ordinary externally owned payer wallet can request a challenge, sign its exact `message` using `personal_sign`, and POST `{ "challengeId": "...", "signature": "0x..." }` to the recovery endpoint. Requests reuse an outstanding public challenge instead of consuming a five-slot allowance. Concurrent requests converge on a challenge for the same recovery generation and time window. The payer must still sign its exact message; successful recovery consumes outstanding challenges, replaces the recovery token and authorizes no new payment. Save the replacement immediately. Contract wallets must retain their private recovery token; contract-signature recovery is not implemented.

A `delivery_pending` response with `payment_settled: true` contains the paid receipt, payment ID and token: retry delivery, never pay again. An uncertain settlement must be reconciled, not re-signed or re-settled; a stored confirmed R2 receipt can repair an interrupted D1 write. Where no confirmed receipt was stored, use the authenticated reconciliation action below. A confirmed failure with `charged: false` can start a new purchase after its cause is fixed.

Prepared replay passes through official verification again before resuming settlement; an expired authorization does not automatically receive a replacement signature or rerun the saved execution. Unknown settlement errors remain uncertain. A broadcast transaction hash stored on a still-verified payment is reconciliation evidence only: delivery still requires both payment and purchase to be settled with a confirmed receipt. If settlement succeeds but persistence fails, the response preserves the SDK receipt header and reports payment settled/recovery pending. A crash before any receipt reaches D1 or R2 can be recovered using finalized chain evidence through the same reconciliation action.

For a pending purchase, POST `/api/purchases/{paymentId}/reconcile` with `X-Recovery-Token` and JSON `{"transaction":"0x..."}`, or call Cap'n Web `reconcilePurchase(paymentId, recoveryToken, transaction)`. The original transaction hash may be omitted only if already recorded on the purchase. If both the hash and all receipts were lost, obtain the original hash from the payer's wallet or transaction history; this action does not discover it. Recover a lost token using the wallet challenge first.

The action first reuses a stored confirmed receipt when available. Otherwise it reads the finalized Base transaction and canonical block, requires successful execution, and matches adjacent native-USDC `AuthorizationUsed` and `Transfer` events to the original nonce-derived payment key, payer, recipient and exact selected amount. Only a prepared purchase in `settling` or `uncertain` can be repaired from chain evidence. A different, failed or nonfinal transfer cannot authorize delivery. Successful reconciliation restores the original D1 purchase and private R2 receipt through the existing persistence functions; use delivery or `getGrant` afterward. Chain-reconstructed receipts identify `confirmation_source: "base-finalized-receipt"` rather than claiming a recovered facilitator response. Repeating recovery cannot submit payment.

The read-only chain client uses existing `viem` and its Base default RPC, with bounded requests and no automatic retries. Operators may configure `X402_READ_RPC_URL` as a trusted HTTPS Base RPC endpoint; callers cannot select it. Base's public endpoint is rate-limited, so production availability should use an operator-managed provider. RPC or persistence outages leave the purchase recoverable and never authorize another charge. This configuration is separate from the unchanged x402 facilitator. See [Base RPC guidance](https://docs.base.org/specifications/node-operators/run-a-node) and [Circle's authorization event implementation](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v2/EIP3009.sol).


## Build, verify and deploy

From the repository root, with the Node version used by CI:

```sh
npm ci --no-audit --no-fund
npm --prefix workers/gateway ci --no-audit --no-fund
npm run selftest
npm --prefix workers/gateway test
npm --prefix workers/gateway run build
npm run build:worker
```

The gateway deploys the built `dist/worker.js` with bundling disabled. Use the lockfile-pinned Wrangler; the root `public/_worker.js` is only the Pages facade. Both bundles are generated and ignored by Git.

Deployment uses the existing `.github/workflows/deploy.yml` after the build and production prerequisites are reviewed. This source review does not merge, dispatch that workflow, or apply migrations. The workflow runs local checks, applies the existing gateway migrations, deploys the gateway, then deploys Pages. It runs on pushes to `main` or an explicit workflow dispatch; pushing this feature branch does not deploy it.

The gateway migrations are additive and rerunnable against the existing catalog. Do not apply the historical root baseline, drop tables, truncate history or promote all drafts. The workflow serializes releases and tags the gateway version with the Git commit. Required access is existing Worker deployment, Pages deployment/binding update and D1 SQL execution; no manual zone route is part of this procedure.

Record the commit, bundle hash, Worker version, Pages deployment ID and test results for each release. Check public-domain discovery,402 challenge, both Cap'n Web transports and authenticated recovery after deployment. `/health` and `/api/proof` are not proof that a real purchase passed; a funded live purchase and receipt/hash verification are a separate gate. Publish only individually validated products after that gate. The outbox exporter uses the existing Basin binding; production sink arrival is still unverified. MPP and automatic refunds remain outside this repair.

### Buyer capability and publication checks (pending production verification)

Existing `search`, `describe`, and `configure` remain. Quote methods are removed.
`select(sku)` returns a session-local product capability supporting `info()`,
`compatibility(config)`, `configure(config, callbacks?)`, `configuration()`,
`components()` and `trial(input)`. A caller may pipeline `select(sku).configure(config).configuration()`.
`callbacks.clarify(questions)` returns a JSON object of answers; one round is
bounded to 16 questions and 10 seconds. Incomplete or invalid answers cannot
prepare a purchase. Product changes invalidate selected capabilities. Payment
still requires a separately authorized x402 signature.

Set `X402_EXPECTED_PAY_TO` independently to the verified merchant recipient.
A missing or mismatched assertion blocks new payment preparation. `/api/proof` separately exposes
`payment_recipient_configured` and `payment_recipient_verified`; without the
expected-recipient assertion it reports degraded readiness. This is a
configuration assertion, not proof of wallet control or a funded canary.
Known zero/dead destinations are rejected.

`src/publication.js` validates a release manifest against preparation evidence.
It never promotes a SKU or alters historical content hashes. Run the inventory
report with `node scripts/audit-inventory.mjs inventory.json report.csv`.
Reports without release evidence fail closed. `src/release-preparation.js` now enforces it through explicit trusted-operator
`publishRelease(env,input,{mode:'stage'|'activate',reviews})` calls. There is no
public publication route. Reviews are supplied separately from the release input,
bound to exact subject hashes, and archived with the source input in existing R2.
They must identify a real reviewer/reference; local fixture reviews do not approve
repository products. The read-only command
`node scripts/prepare-release.mjs ../../products/agent-state-dynamodb-manifest/release-input.json`
reports source readiness separately from publication eligibility.

Staging verifies content-addressed R2 bytes before one atomic D1 batch registers
payload, full manifest and routing in the existing tables. Staging a new version
leaves the current live version unchanged. Activation requires every publication
check, including actual commercial allocation. Immutable conflicts, price changes
and stale source/review hashes fail closed. Old purchased snapshots continue to
redeliver their original bytes. No production operator call has been run.

The existing migrations define immutable release and routing persistence, and
structured candidate search is implemented. They insert no reviewed products.
The two corrected local release inputs contain actual payloads and routing metadata:
AWS-0568 v2 is a modular offline DynamoDB request planner in JavaScript and Python;
SW-PT-0006 v2 is corrected Python guidance with an actual tested Powertools example.
Both pass source preparation and local staging tests. Trusted reviews, AWS-0568's
price allocation, production R2/D1 registration and live acceptance remain outstanding.
The other catalog records retain the per-listing blockers in `review/`; source
pointers alone are not ready deliverables.

### Clef Flash in the routing workflow

The local integration was checked against Typesafe's
[intent-routing pattern](https://docs.typesafe.ai/patterns/intent-routing),
[Choice contract](https://docs.typesafe.ai/primitives/choice) and
[confidence guidance](https://docs.typesafe.ai/confidence).

HTTP `/api/resolve` and Cap'n Web `searchIntent` share `resolveIntent`.
Deterministic code first checks reviewed manifest identity and explicit
constraints, and records missing evidence or language. When
`CLEF_ROUTING_ENABLED=true` and `AI` is available, Clef reads at most 20
informative, conflict-free candidates, prioritized by lexical score and SKU,
before keyword pruning and the caller's result limit. Each typed choice
describes the supplied product's identity, release, scope and exclusions.
One existing model call reads both a typed Choice and a Noul `answer_exists`.
A choice with confidence at least `0.5` and existence at least `0.7` can surface or
rank only that supplied product/version. Existence below `0.35` vetoes only the
evaluated pool, with evaluated/eligible counts and completeness retained in
alignment provenance. Untested candidates are not declared semantically absent.
These thresholds are provisional local policy, not calibrated accuracy.

A chosen product with missing configuration returns `missing_configuration`,
`matched: false` and the existing clarification questions; it is never treated
as purchase-compatible. Language is supplied explicitly by the buyer. Clef
cannot override an incompatible requirement, alter a price or authorize
publication. The response retains snapshot and request/question hashes.
`unknown`, low confidence, invalid responses, provider errors and timeout retain
the deterministic result, including genuine no-match outcomes.

Incompatible and uninformative requests do not invoke the model. Legacy
`search(string)` retains its lexical array contract. The source tests use an
injected AI fixture through the actual HTTP and Cap'n Web paths; they do not
measure live model accuracy. This pass leaves the routing flag and AI binding
unchanged. Live model verification and reviewed routing rows are prerequisites
for enabling the workflow through the existing GitHub deployment process.

The additional Typesafe cookbooks were reviewed through Exa against this source:

| Pattern | Application here | Current limit |
| --- | --- | --- |
| [Pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook) | Code supplies exact candidate IDs; the reader selects an existing option and code returns that original product/version. Exact atomic amounts remain deterministic. | This pass adds no general value-extraction service. |
| [Semantic find](https://docs.typesafe.ai/cookbooks/semantic_find) | Choice and a separate Noul existence reading share one call; valid semantic absence vetoes the evaluated pool. | Live quality and threshold calibration remain unverified; partial-pool negatives retain explicit scope. |
| [Entity alignment](https://docs.typesafe.ai/cookbooks/entity_alignment) | Source/provenance differences belong in inventory review; exact supplied identities remain distinct. | No automatic merging, alias creation or publication is authorized by a reading. |
| [Autoresearch feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery) | Held-out error analysis can later refine routing questions and policy using reviewed labels. | No additional model, training loop or online adaptation was added. The routing threshold is still provisional. |

Each reviewed routing row needs `sku`, `version`, `manifest_json`, the SHA-256
of its canonical JSON as `manifest_hash`, `reviewed_by` and `created_at`.
The manifest must identify the exact product/release and supply canonical
service, kind, summary, supported boundary, language policy, aliases, tags,
taxonomy/problem-family IDs, operations, environments, outcomes, input kinds,
failure signatures, languages/runtimes, required evidence and exclusions.
These values must come from the reviewed deliverable. Migration 0004 creates
the existing table but intentionally supplies no rows.

### Durable commerce telemetry

Migration `0002_business_outbox.sql` adds transactional triggers for quote creation,
settlement start/pending/success/failure, receipt issuance and entitlement activation.
No historical events are backfilled. Only allowlisted identifiers, release hashes,
exact atomic amounts and network leave D1; payment signatures, recovery credentials,
configuration and buyer content are excluded.

The gateway scheduled handler sends up to 20 pending events per minute to the
existing `second_wind_events` stream (`d135ad1c9f9246ae945be1d1b8277ddc`).
The live stream was inspected on 2026-10-19: `payload` is JSON, not a string;
`occurred_ts` is a timestamp. Retries retain the same event ID. Least-attempted
rows are dispatched first so malformed rows cannot permanently block fresh work.
Ingestion acknowledgements mark `sent_at`; they do not prove sink delivery.
Concurrent dispatch or a crash before acknowledgement may resend an event.
Consumers must deduplicate by `event_id` before counting business outcomes.

Existing pipeline `secondwind_telemetry` (`c36bc1cd21814d3091f84329257b3c09`)
passes the complete envelope to `all_events_sink`. That is the compatible raw
landing table. Its specialized legacy projections use obsolete event names and
price fields; do not use them to report the current commerce contract. In
particular, the old receipt projection does not carry exact atomic prices.
Replacement projections need a versioned SQL rollout; the existing pipeline SQL
is immutable. Do not delete the existing raw history to change projections.

Deployment applies 0002 before enabling the binding and cron. Acceptance requires
an unfunded production quote, its matching D1 outbox row, ingestion acknowledgement,
and the same event ID in the raw Iceberg table. Monitor pending count, oldest
pending timestamp, attempts and last_error in D1, and failed events in Pipelines.
This implements core commerce transitions, not the full Cap'n Web journey.
Production sink verification remains required before claiming it live. See
`telemetry-review.md` for the observed event coverage, correlation and proposed
SQL review; it does not apply changes to Basin.

### Source verification on 2026-10-19

The restored checkpoint was `eb29fff7d66a8f8a9dc4c8b69d26a4f13ba31a79`;
its tree matched the preserved local `883ba8e` source. Baseline gateway tests
passed 76/76. The full current gateway suite passes 146/146 with zero failures/skips, and both
builds pass on Node 24.19.0. The tested commit is recorded in draft PR #5. Legacy utility
selftests and all 21 actual Pages ingress tests also pass.

The real Dynamic Worker acceptance executes all 16 actual AWS-0568 feature
packages with optional source files physically absent and no gateway secrets.
It caught and fixed the Worker Loader rejection of raw-string `.mjs` modules by
setting their explicit JavaScript module type, preserving paths and bytes.
JavaScript sandbox orchestration remains separate from Python product delivery.
Both real product variants execute locally; botocore validates 160 operation
inputs and 64 partial response shapes across the 32 variants. The Python
Powertools example has seven fake-I/O behavior cases, including repeat external
effects after a failure. None of these tests calls AWS or proves a deployment.

Trials can inspect and execute structurally complete unpriced releases. Selection
and acceptance require the real release-owned allocation. Draft releases remain
outside public discovery/trials; throwaway local databases expose fixtures solely
for acceptance. This adds no public draft or approval bypass.

Selected purchases pin existing R2 objects rather than embedding file bytes
in D1 snapshots. Exact file hashes/sizes are checked before writing, R2 readback
must match before a purchase is accepted, and delivery revalidates the pinned payload.
Tests cover missing/corrupt bytes before settlement, bought-version recovery,
failed writes, scoped delivery and one-settlement replay.

The existing outbox now records observed discovery, clarification, configuration,
selection, testing, acceptance/payment, response preparation and recovery. Optional
`X-Journey-Id` (opaque generated ID) correlates HTTP, Cap'n Web and sandbox calls;
return it on later requests to join a journey. It grants no authority. No private
search/configuration/code/result/payment/recovery content is logged. Transactional
core transitions remain D1-trigger-owned; optional logging failures cannot change
commerce. Review-only Basin SQL is in `telemetry-review.md`.

The fixed source-reviewed routing corpus has 34 cases. `node scripts/evaluate-routing.mjs
--deterministic /tmp/routing-deterministic.json` checks fallback behavior with no
model calls; `--fixture /tmp/routing-fixture.json` checks typed control flow with
scripted readings. Neither measures live semantic accuracy or calibration. `--live`
requires existing authorized `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with
Workers AI access, creates checkpointed reports, and is never selected by default.
Live inference was not enabled or invoked. The source flag remains disabled and
no AI binding was added.

These are local results. No production settings/data, bindings, migrations,
workflows, deployments, publication or funded purchase were changed/performed.
No reverted implementation was restored.

Remaining prerequisites are exact product-specific deliverables for unresolved
catalog records; owner-supplied commercial allocation; genuine hash-bound product,
contract, source/license, language, validation and publication reviews; production
R2/D1 registration through authorized existing deployment/release operations;
live Clef access and labeled evaluation; review/validation of the existing Basin
SQL and sink schema plus same-event-ID Iceberg arrival; independent merchant
recipient verification and a separately authorized funded canary. No local test
substitutes for these external observations or owner decisions.


## Buyer-flow recovery and selected language

Configured whole-product purchase entry uses the method from `/api/tools`: POST a JSON
`config` to a configured whole-product endpoint, then keep the same method and accepted
URL for the signed retry. The initial method is pinned with the acceptance. Historical
accepted GET URLs continue using their stored configuration. Component acceptances
continue to use their existing GET purchase URLs; official Hono/x402 handles payment.

Before starting any trial, generate and privately retain a `trial_id` of
`trial_` plus a random UUID and a `trial_token` of 32 cryptographically random bytes
encoded as base64url (43 characters). Supply both inside `input` in POST `/api/trials`,
or inside the argument to Cap’n Web `trial(input)`. Retrying the same request recovers
its stored result or status. A changed request is rejected and no retry re-executes
the original trial. Missing credentials are rejected before execution. Identical
retries recover the original attempt even after a catalog update. Recovery lasts
until the returned `expires_at`, one hour after creation.

Use GET `/api/trials/{id}` with `X-Trial-Token`, or Cap’n Web
`recoverTrial(id, token).info()`, to recover a result, including after a catalog
version change. Selection and acceptance still require the current release and a
completed, unexpired trial. `running` becomes an honest `unknown` observation after
the configured execution window plus a small margin; it does not authorize a restart.
An unknown outcome can later resolve if its original result write completes.
HTTP and Cap’n Web retain trial work with the request execution context where available;
this is bounded continuation, not a guarantee against Worker termination.

Apply additive migration `0005_trial_recovery.sql` before deploying this gateway.
The production workflow includes it. It creates request-identity records and leaves
existing trials and purchases intact.

New component manifests may provide `files_by_language`, a complete per-component
path allowlist for every declared adapter. Shared schema, documentation and license
files must be included explicitly. The selector uses the buyer’s configured language
when this mapping exists. Existing releases without a mapping retain their original
file selection. AWS-0568 v3 is prepared under `products/agent-state-dynamodb-manifest/releases/v3/`;
it is not live until reviewed and activated through the existing publication flow.
Code Mode still executes JavaScript; Python files are delivered without claiming
that the hosted sandbox executed them.
