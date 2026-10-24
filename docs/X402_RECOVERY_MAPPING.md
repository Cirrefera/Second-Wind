# Standard x402 restoration: durable purchase mapping

Status: source-grounded implementation handoff, October 24, 2026. Resolves the [durable recovery research](https://github.com/Cirrefera/Second-Wind/issues/15) under the [payment ownership map](https://github.com/Cirrefera/Second-Wind/issues/13). No runtime implementation or migration is claimed.

## Boundary and evidence

The [accepted decision](adr/0001-standard-x402-payment-ownership.md) remains unchanged: official `@x402/hono` owns payment challenges, decoding, verification, facilitator calls, settlement and protocol response headers. Second Wind retains its Code Mode sandbox, Cap'n Web capabilities, explicit selection, frozen accepted scope and authenticated purchase recovery. The selected final amount must remain within the disclosed maximum. Sandbox completion and acceptance do not charge. Internal `quote_id` records remain compatible storage identifiers, not a new buyer-facing quote stage.

This mapping examines [gateway source at c0fb9cc](https://github.com/Cirrefera/Second-Wind/tree/c0fb9cc2c6927a036e2d0193c3d505630c4c227a/workers/gateway), especially `src/index.js`, `commerce.js`, `contracts.js`, `trials.js`, `scope.js`, `product-service.js` and the existing purchase schema. Published archives for [x402 Hono 2.28.0](https://registry.npmjs.org/@x402/hono/-/hono-2.28.0.tgz), [core 2.28.0](https://registry.npmjs.org/@x402/core/-/core-2.28.0.tgz), [EVM 2.28.0](https://registry.npmjs.org/@x402/evm/-/evm-2.28.0.tgz) and [Hono 4.13.13](https://registry.npmjs.org/hono/-/hono-4.13.13.tgz) were read without installing or executing them; all four SHA-512 integrities match the repository lockfile. References to SDK behavior below identify functions in those archives, including their embedded source-map sources. See also [the initial SDK research](X402_STANDARD_RAILS_RESEARCH.md).

## Minimal integration

Compose an outer application guard/finalizer around official `paymentMiddlewareFromHTTPServer()` on the existing paid routes. Register SDK hooks once on the cached server. Use Hono's documented [contextStorage/getContext](https://hono.dev/docs/middleware/builtin/context-storage) to access request-local application state from those hooks. The pinned Hono implementation uses AsyncLocalStorage; gateway configuration already enables `nodejs_compat`, supported by [Workers AsyncLocalStorage](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/).

Do not use shared mutable request state, accumulate hooks per request, or reach into private `HonoAdapter.c`. HTTP core clones/enriches the verification context; settlement receives the original request context, so context-object identity is not a stable correlation key. Missing application context must explicitly block the relevant lifecycle gate.

The outer guard resolves the frozen accepted scope, original request hash, route/product/method, expiry and recipient policy. Existing purchase lookup uses the accepted-scope identity and recovery credentials; it does not require a second custom payment-header decoder. For a new payment, official dynamic pricing supplies the accepted atomic amount/asset to the SDK. Preserve the existing exact USDC authorization flow. A disclosed maximum is not itself an exact charge or evidence of general usage metering.

| Stage | Official integration point | Application responsibility and failure behavior |
| --- | --- | --- |
| Existing purchase | Outer guard, before paid middleware initialization | Authenticate recovery; apply the state table below. Settled delivery must remain available without initializing the facilitator. |
| New verification | Official HTTP processing and exact verifier | SDK decodes, matches requirements and verifies. No application-produced verification success. |
| Claim verified purchase | `onAfterVerify` | First require `context.result.isValid === true`. Bind verified requirements/payer to frozen scope and request. Atomically create the existing payment/purchase claim, or identify the authenticated prepared replay. Catch storage/conflict errors and return explicit `{abort:true, reason}`. |
| Prepare purchase | Ordinary downstream Hono handler | Only the claim owner executes once or reads the exact selected payload. Persist `prepared_json` and content hash before success. Prepared replay returns the saved result without execution. Handler throw/status >=400 prevents normal after-handler settlement. |
| Claim settlement | `onBeforeSettle` | Recheck bound scope/amount and compare-and-swap `prepared → settling` with a unique owner. Failed or indeterminate ownership returns explicit abort. Preserve lost-acknowledgement readback fencing. |
| Transfer | Official middleware/core settlement | SDK calls the facilitator and owns its bounded pending retry. No direct application `settlePayment()` call or second retry loop. |
| Record confirmed payment | `onAfterSettle` | Save confirmed SDK result in request-local state first; validate receipt correlation, then reuse private R2 receipt plus atomic D1 payment/purchase/grant persistence. Capture persistence failures explicitly. Do not fabricate or replace SDK success. |
| Settlement failure | `onSettleFailure` plus invocation phase | Preserve unresolved results as `uncertain`; retain transaction information when supplied. Mark terminal failure only when a definitive outcome is established. Do not return invented recovered settlement success. |
| Final response/delivery | Outer middleware after awaiting SDK middleware | Deliver only from confirmed durable entitlement. Return the final application body or truthful recovery error while preserving applicable SDK payment headers. Never expose a provisional prepared result as a paid purchase. |

Core `verifyPayment()` invokes `runAfterVerifyHooks()` even when a facilitator returns `isValid:false`. Both verification-hook and before-settlement ordinary exceptions can be logged and ignored. **Positive verification checks and explicit abort returns are mandatory**, not optional defensive style. A before-settlement abort happens outside the core settlement catch block; record its application outcome at the gate rather than assuming `onSettleFailure` will run.

Retain the existing EIP-3009 nonce-based payment key and proof hash as ledger correlation **after** SDK verification. Preserve both globally unique payment key and unique accepted-scope purchase: otherwise one authorization could execute two equal-priced products before on-chain nonce rejection. Remove duplicate authenticity/amount/signature validation from `paymentIdentity()`; keep application scope/request/proof binding. The pinned EVM exact implementation defaults to EIP-3009 authorization. Unsupported correlation shapes must fail explicitly; this mapping does not silently enable Permit2 or another scheme.

## Recovery and concurrency

Keep the existing tables, purchase IDs, recovery-token hashes, wallet recovery authentication, frozen payloads and grant records. Every state mutation remains owner/state guarded. Cancellation hooks must never fail another invocation's claim.

| Existing durable state | Retry behavior |
| --- | --- |
| `claimed` / `executing` | Report in progress. Preserve the current guarded abandoned-preparation cleanup; never reclaim by executing again. No new settlement. |
| `prepared` | Authenticate and bind the original request. Re-enter official verification with the original proof, then use the saved prepared result and the settlement ownership gate. A different proof cannot replace it. |
| `settling` / `uncertain` | Try existing private receipt reconciliation; otherwise report unresolved recovery and no new payment. Do not reset to prepared or settle again on reconnect. |
| `settled` | Authenticate, verify durable receipt/grant and deliver or replay the saved invocation result. No new verify/settle call. Changed invocation input remains denied. |
| `failed` | Return existing failure without another execution or settlement. Do not reinterpret an unresolved transfer as failed. |

Prepared replay through the official middleware requires verification again. The current custom prepared path skips that verification; therefore an expired authorization may now leave a saved, unpaid result unavailable for automatic completion. Do not hide that compatibility change by bypassing the verifier or automatically requesting a fresh signature.

For the `prepared → settling` CAS, a lost acknowledgement is not proof the write failed. Only the still-running invocation whose unique owner is read back, and which knows it has not called settlement yet, may continue. A disconnected replacement invocation cannot acquire that knowledge merely from a `settling` record. If readback is unavailable, stop and retain recovery state.

Core `settleWithPendingRetry()` permits one identical-payload retry only for qualified `settlement_pending` with a broadcast transaction. An unresolved pending result, timeout, transport failure or undecodable response after a settle attempt is not proof of no transfer. The current `settlePrepared()` marks every returned `success:false` as failed; that blanket classification must not survive restoration. Unknown error codes default to unresolved, not `charged:false`. Do not promise one facilitator HTTP call when the SDK itself may reconcile once.

`onVerifiedPaymentCanceled` can perform guarded pre-settlement cleanup, but its errors are logged and it does not run after every process crash. Keep durable abandoned-preparation handling. Preserve the existing `waitUntil` protection over the complete middleware/recording lifecycle where possible; it does not make execution immortal or remove the need for recovery. Never reset a settling record merely because a request disconnected.

## Settlement, persistence and response loss

The pinned Hono middleware buffers the handler response before settlement, then reconstructs it with SDK headers. Mutating `c.res` inside `onAfterSettle` is not a reliable finalization point. Store the settlement/persistence outcome in request-local state, then use normal outer Hono middleware composition to replace the final application response after the SDK finishes.

Reuse `receiptFor`, `durableReceipt`, `persistSettlement`, `reconcileStoredReceipt`, `recoverGrant` and `deliverGrant`, with their existing integrity and authorization checks. A confirmed settlement followed by a D1 failure must report payment settled/recovery pending, including purchase ID, recovery credentials and available receipt. Delivery failure after durable settlement reports paid delivery pending. Neither case may tell the buyer to pay again. An uncertain outcome must report uncertainty rather than infer charge status from an HTTP 402/502 response.

Private R2 receipt reconciliation repairs a D1 write failure only when the receipt was durably stored. If both stores fail, or the Worker dies after transfer before storing a receipt, request-local state cannot recover the transaction after disconnect. Retain the unresolved record and prohibit automatic repayment; external authoritative reconciliation is still required. This is an existing durability limit, not a guarantee supplied by SDK hooks. Preserve buyer-supplied recovery tokens for complete response loss; a server-generated token delivered only in a lost response is insufficient, so retain wallet recovery as well.

## Implementation handoff

1. In `src/index.js`, replace application-owned `signatureFrom`, `challenge` and paid-route protocol orchestration with the official Hono middleware plus the bounded application guard/finalizer. Preserve route/method validation, non-charging HEAD behavior, artifact response formats, `/capnp` capabilities and authenticated recovery endpoints. Use SDK decoding wherever a legacy embedded acceptance identifier must be read; do not retain competing parsing logic. Keep existing public compatibility routes while removing buyer-facing quote language.
2. In `src/commerce.js`, retain immutable acceptance creation, atomic claims, preparation, stored results, receipts, delivery and recovery. Split the current `purchase`/`settlePrepared` orchestration into application lifecycle operations; remove their direct verification/settlement authority. Preserve original request hashes, selected file hashes and ownership predicates.
3. In `contracts.js`, `discovery.js` and relevant `product-service.js` serializers, route payment requirements through official SDK construction and distinguish disclosed maximum from accepted final amount. No preselection offer may silently charge the full maximum. Internal storage names alone do not justify a schema migration or broad API rewrite.
4. Leave `trials.js`, `scope.js`, Code Mode execution and Cap'n Web behavior intact except for narrow call-site adaptation required by the restored boundary. Do not activate unpublished component releases, invent allocations or introduce a new usage meter.

Future implementation validation must exercise the official middleware with controlled facilitator responses: invalid verification, concurrent claims, one execution owner, CAS lost acknowledgements, authenticated prepared replay, handler failure, pending/timeout, settlement followed by persistence failure, receipt repair, free settled replay, response-header preservation and exact selected amount within the maximum. Existing custom-orchestrator tests are useful behavioral evidence but do not prove the new integration. No such tests, alternative implementation experiments, funded calls or runtime changes were performed for this research.

The planning question is resolved: supported lifecycle hooks can carry the existing application state without replacing standard rails. Implementation and its validation remain open under FIX-17/19, preserving FIX-02 recovery guarantees and the existing consolidation backlog.
