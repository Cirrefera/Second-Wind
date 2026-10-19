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

After tests and build pass, deploy from the gateway directory, then the root:

```sh
cd workers/gateway
./node_modules/.bin/wrangler deploy --dry-run
./node_modules/.bin/wrangler d1 execute second-wind-catalog --remote --file=migrations/0001_commerce_repair.sql
./node_modules/.bin/wrangler deploy
cd ../..
./workers/gateway/node_modules/.bin/wrangler pages deploy public --project-name=second-wind --branch=main
```

The exact migration above is additive and rerunnable against the existing catalog. Do not apply the historical root baseline, drop tables, truncate history or promote all drafts. The workflow serializes releases, tags the gateway version with the Git commit, and deploys the gateway before Pages. Required access is existing Worker deployment, Pages deployment/binding update and D1 SQL execution; no manual zone route is part of this procedure.

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

Remaining work includes versioned manifest persistence, structured compatible
candidate search, full journey telemetry/outbox integration, live resource
verification, and production acceptance. These additions do not claim those
pieces are implemented.
