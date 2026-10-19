# Second Wind application Worker

`secondwind-gateway` owns discovery, quotes, payment, grants, execution, delivery and recovery. HTTP and Cap'n Web call the same commerce functions and D1 purchase records.

Pages runs the small advanced-mode entry in `src/worker.js`. It transparently forwards application requests through `GATEWAY → secondwind-gateway`, preserving the original Response and WebSocket upgrade; remaining requests use static assets. There is no separate Pages cashier or public Workers URL proxy. This ingress uses existing account-level deployment permissions, not zone-route creation. The API-only `/` may return404.

## Bindings and configuration

| Gateway binding | Resource or purpose |
| --- | --- |
| `SW_DB` | Existing `second-wind-catalog` D1 database |
| `PAYLOADS` | `secondwind-payloads`: canonical versioned payloads |
| `DELIVERIES` | `secondwind-deliveries`: private confirmed-settlement recovery copies |
| `LOADER` | Fresh Code Mode isolates; no application secrets or outbound fetch granted |
| `CF_VERSION_METADATA` | Actual Worker version ID, tag and creation timestamp |

The existing encrypted `X402_PAY_TO` and `CDP_FACILITATOR_KEY` secrets stay on the gateway. Wrangler validates their presence and retains them on deployment. Do not re-create them or put their values in source. Public payment configuration is USDC on Base (`eip155:8453`) through CDP. Pages needs only its gateway service binding.

## Public interfaces

All paths below use `https://secondwindai.com`.

| Method/path | Purpose |
| --- | --- |
| `GET /api/tools`, `/api/proof`, `/openapi.json`, `/llms.txt` | Free discovery and configuration readiness |
| `GET /.well-known/x402`, `/v2/x402/discovery/resources`, `/discovery/resources` | Generated resource discovery; last path is a compatibility alias |
| `POST /api/resolve`, `/api/configure`, `/api/quotes` | Public intent matching, input validation and a pinned product quote |
| `GET /api/x402/{sku-or-slug}` | Quoted product purchase; executable Bedrock products use `POST` |
| `GET /api/x402/{sku-or-slug}/artifact` | Artifact purchase returning exact bytes, with payment and recovery metadata in response headers |
| `POST /rpc` | A quoted product request, or one explicitly requested JavaScript Code Mode invocation |
| `POST /capnp`, WebSocket `/capnp` | HTTP batch/promise pipelining and bidirectional Cap'n Web sessions |
| `GET /api/purchases/{paymentId}/delivery` | Authenticated free redelivery |
| `POST /api/purchases/{paymentId}/recovery-challenge`, `/api/purchases/{paymentId}/recover` | Lost-token wallet recovery |
| `GET /health`, any application `OPTIONS` | Worker liveness/version evidence and CORS preflight |

`/api/catalog` redirects to `/api/tools`. Free Cap'n Web methods are `describe`, `search`, `configure`, `quote`, `recoveryChallenge` and `recoverWithWallet`; legacy method aliases remain. `getGrant(paymentId, recoveryToken)` returns a purchase-scoped capability with `info`, `deliver` and, where entitled, `execute`. `recoverSession` reissues that capability from D1 after a disconnect.

## Purchase and content contract

1. Obtain a quote or follow the initial402 challenge. Preserve its exact `quote_id`, configuration and purchase URL. New quotes expire after five minutes.
2. A quote pins the SKU, version, input, price, recipient and content hash. R2 payloads must exist and match their exact-byte hash before payment; inline guidance is snapshotted and hashed as UTF-8. Delivery never switches to the latest catalog version.
3. Sign the402 requirements, then retry with `PAYMENT-SIGNATURE` and a private recovery token. Verification precedes a durable unique claim; only its owner executes and settles. A settlement timeout remains uncertain and is never automatically settled again.
4. Save `paymentId`, `recoveryToken`, the receipt and its transaction hash. Verify content using the response's explicit `content_hash_scope`; an R2 artifact is base64 encoded within the JSON delivery envelope. The artifact purchase route and authenticated delivery with `?format=artifact` return its exact raw bytes instead.

Code Mode requires an explicit `language: "javascript"` (or `"js"`). It orchestrates the exposed product operations; it does not translate an inventory item into another language. One execution purchase buys one invocation and its persisted result. Repeating its exact code/language/invocation ID recovers that result; it does not buy unlimited execution. SKU delivery grants do not grant arbitrary code execution. Cap'n Web delivery/result-recovery callbacks report bounded `start`/`complete` notifications; a disconnected callback cannot change the purchase outcome.

## Private recovery credentials

`X-Recovery-Token` is a bearer credential: 32 cryptographically random bytes encoded as 43 unpadded base64url characters. Keep it private and retain it with the quote. `Authorization: Bearer <token>` is also accepted on HTTP recovery. Payment IDs, transaction hashes and on-chain payment authorizations are not recovery credentials; the payment signature can become observable on chain.

Prefer choosing the token **before** the paid request so a lost response is recoverable. A Node client can create one with:

```js
import { randomBytes } from "node:crypto";
const recoveryToken = randomBytes(32).toString("base64url");
// Persist it privately, then send it as X-Recovery-Token on the paid request.
```

If omitted, the server generates a token and returns it with the first purchase response. Normal delivery/session recovery uses D1 and R2, costs nothing, and never calls the facilitator. Retry a lost response using the original quoted URL, payment proof and retained token, or use the authenticated delivery endpoint once the payment ID is known.

If a server-generated token and response were both lost, retry the original quoted payment request to discover its payment ID and recovery-challenge URL. An ordinary externally owned payer wallet can request a challenge, sign its exact `message` using `personal_sign`, and POST `{ "challengeId": "...", "signature": "0x..." }` to the recovery endpoint. The expiring, one-use challenge replaces the recovery token and authorizes no new payment. Save the replacement immediately. Contract wallets must retain their private recovery token; contract-signature recovery is not implemented.

A `delivery_pending` response with `payment_settled: true` contains the paid receipt, payment ID and token: retry delivery, never pay again. An uncertain settlement must be reconciled, not re-signed or re-settled; a stored confirmed R2 receipt can repair an interrupted D1 write. Where no confirmed receipt was stored, operator reconciliation is required. A confirmed failure with `charged: false` can obtain a fresh quote after its cause is fixed.

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

Record the commit, bundle hash, Worker version, Pages deployment ID and test results for each release. Check public-domain discovery,402 challenge, both Cap'n Web transports and authenticated recovery after deployment. `/health` and `/api/proof` are not proof that a real purchase passed; a funded live purchase and receipt/hash verification are a separate gate. Publish only individually validated products after that gate. MPP, Basin streaming and automatic refunds are not implemented by this repair.

### Buyer capability and publication checks (pending production verification)

Existing `search`, `describe`, `configure`, `quote`, and aliases are retained.
`select(sku)` returns a session-local product capability supporting `info()`,
`compatibility(config)`, `configure(config, callbacks?)`, `configuration()`, and
`quote()`. A caller may pipeline `select(sku).configure(config).quote()`.
`callbacks.clarify(questions)` returns a JSON object of answers; one round is
bounded to 16 questions and 10 seconds. Incomplete or invalid answers cannot
produce a quote. Product changes invalidate selected capabilities. Payment
still requires a separately authorized x402 signature.

Set `X402_EXPECTED_PAY_TO` independently to the verified merchant recipient.
A mismatch fails payment configuration. `/api/proof` separately exposes
`payment_recipient_configured` and `payment_recipient_verified`; without the
expected-recipient assertion it reports degraded readiness. This is a
configuration assertion, not proof of wallet control or a funded canary.
Known zero/dead destinations are rejected.

`src/publication.js` validates a release manifest against preparation evidence.
It never promotes a SKU or alters historical content hashes. Run the inventory
report with `node scripts/audit-inventory.mjs inventory.json report.csv`.
Reports without release evidence fail closed. The validator is not yet wired
into an authenticated publication transaction; it must not be represented as
an enforced production publication gate. License and contract attestations
must come from a trusted preparation process, never from buyer input.

The existing migrations define immutable release and routing persistence, and
structured candidate search is implemented. They insert no reviewed products.
Actual reviewed releases and routing rows, complete journey observations,
live resource verification and production acceptance remain outstanding.

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
A choice with confidence at least `0.5` can surface or rank only that supplied
product/version. This confidence floor is provisional local policy, not a
calibrated guarantee of accuracy.

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
| [Semantic find](https://docs.typesafe.ai/cookbooks/semantic_find) | Semantic selection runs before keyword pruning; explicit `unknown` and uncertainty retain no-match fallback. | The cookbook's separate `exists` Noul is not implemented. An explicit unknown option and a separate existence reading are different designs; their no-match behavior needs live labeled evaluation. |
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
passed 76/76. After this pass, the full gateway suite passes 105/105 and the
gateway build passes on Node 24.19.0. Actual HTTP and Cap'n Web tests cover
confidence-gated semantic routing, explicit clarification and incomplete-quote
rejection, alongside the preserved payment/replay/recovery tests.

The existing real Dynamic Worker check also passed: it imported product code,
called a scoped provider and received no gateway secrets. Legacy utility
selftests, all 21 Pages ingress tests and the Pages build passed. Offline
AWS-0568 validation covers 16 selections, 80 AWS request shapes and 32 partial
response shapes; it does not perform AWS calls or implement a response matcher.

These are local results. No production settings/data, bindings, migrations,
workflows or deployment were changed. Remaining build gaps include actual
reviewed product releases and routing rows, publication transaction integration,
the draft's explicit language/trial fulfillment wiring, and missing journey
event producers. The selected-file quote path still snapshots files inline in
D1; the draft has no immutable R2 delivery registration. This pass does not
restore the reverted release/storage implementation or invent price allocation.

External verification still requires an authorized live Clef run with model
access and a labeled corpus, reviewed existing Basin SQL/sink schemas and
same-event-ID arrival evidence, independent merchant-recipient verification,
and a separately authorized funded purchase canary. Enable/deploy only through
the existing reviewed GitHub process once those prerequisites are satisfied.
