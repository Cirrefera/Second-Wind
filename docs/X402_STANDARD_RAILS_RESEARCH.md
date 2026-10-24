# Standard x402 rails and Second Wind's product experience

Research date: October 24, 2026. This is source research, not an implementation, migration approval, or funded-payment test.

## Conclusion

The pinned SDK already provides the integration points needed to keep the official Hono/x402 middleware in charge of protocol payment handling while Second Wind retains sandbox trials, chosen components, exact purchased bytes, and durable recovery. There is no demonstrated need to replace x402 challenge generation, signature validation, or facilitator settlement with a parallel application implementation. Restoring that boundary still requires explicit treatment of concurrent requests and interrupted persistence; reinstalling the old middleware alone does not preserve all later recovery guarantees.

## Version and evidence

The repository [lockfile at c0fb9cc](https://github.com/Cirrefera/Second-Wind/blob/c0fb9cc2c6927a036e2d0193c3d505630c4c227a/workers/gateway/package-lock.json) resolves `@x402/hono` and `@x402/core` to **2.28.0**. Research inspected the published [Hono archive](https://registry.npmjs.org/@x402/hono/-/hono-2.28.0.tgz) and [core archive](https://registry.npmjs.org/@x402/core/-/core-2.28.0.tgz), including their distributed JavaScript, declarations and embedded source-map sources. Both archive SHA-512 hashes match that repository lockfile. No package code was installed or executed.

This matters because the following capabilities were checked in the pinned release, not inferred from current documentation:

Verified lockfile/archive identities:

- `@x402/hono@2.28.0`: `sha512-tR/AegvCpluj4AX1uYpqt0Ak7e3RcA2QE9GYrPCzwZTxv2z7gYUl7xE/olaxxDEiEb/yRmlsNAxmL81cARjeKw==`
- `@x402/core@2.28.0`: `sha512-Da/7zKxCKqpBoB4Msc9tFgkAv7tJTD8nG+DSSm+QdXAyJS4PQsmgVSKe17rDJTtlu0pwNbLcOje6MyQ6kaDkig==`

| SDK capability | Evidence within published 2.28.0 package | Relevance |
| --- | --- | --- |
| Official Hono payment handling | `@x402/hono/dist/esm/index.mjs`, `paymentMiddlewareFromHTTPServer()` | Handles protected-route payment challenges, verification, handler result, settlement and payment response headers. |
| Per-request final amount | Core declaration `PaymentOption.price: Price \| DynamicPrice`; `DynamicPrice` accepts `HTTPRequestContext` | An accepted selection can supply its persisted final amount through the standard route pricing interface. `AssetAmount` supports an atomic string amount and asset. No fixed global price is required. |
| Application lifecycle integration | Core `x402ResourceServer` hooks: `onBeforeVerify`, `onAfterVerify`, `onBeforeSettle`, `onAfterSettle`, `onSettleFailure`, `onVerifiedPaymentCanceled` | Application claims, state recording and recovery can integrate at supported boundaries rather than duplicate verification/settlement. |
| Authenticated existing access | HTTP resource server `onProtectedRequest()` accepts `grantAccess` or `abort` | The SDK has a standard access-control hook. Existing free authenticated delivery endpoints can also remain outside paid route matching. Granting access must rely on an already-settled durable entitlement, never a payment ID alone. |
| Usage-dependent partial settlement | Hono `setSettlementOverrides()` and core `SettlementOverrides` | Available for schemes that permit partial settlement. It is not permission to reduce an `exact` authorization after signing. |

The official [lifecycle-hook documentation](https://docs.x402.org/advanced-concepts/lifecycle-hooks) corroborates the hook interfaces. The archive implementations above govern the specific behavior described here.

## Preserve the product boundary

The existing [trial service](https://github.com/Cirrefera/Second-Wind/blob/c0fb9cc2c6927a036e2d0193c3d505630c4c227a/workers/gateway/src/trials.js) and [scope calculation](https://github.com/Cirrefera/Second-Wind/blob/c0fb9cc2c6927a036e2d0193c3d505630c4c227a/workers/gateway/src/scope.js) are product behavior: free trial, completed-trial requirement, explicit component choice, dependency validation, exact allocations, scope hashes and selected-file identities. [Cap'n Web capabilities](https://github.com/Cirrefera/Second-Wind/blob/c0fb9cc2c6927a036e2d0193c3d505630c4c227a/workers/gateway/src/product-service.js) expose those operations. None requires a custom payment protocol.

The architectural boundary supported by this evidence is:

- **Second Wind decides what is being bought:** product/version/configuration, selected components and files, release maximum, selected final amount, acceptance identity and durable entitlement/recovery.
- **Official x402 handles payment:** payment requirements/challenge serialization, selected-scheme verification, facilitator communication, settlement semantics and payment response headers, through its supported Hono integration and lifecycle hooks.
- **The buyer decides whether to purchase after trial:** a completed sandbox run and an inspected selection do not themselves charge or create a settled entitlement.

For a selected purchase whose amount is known after the sandbox, the standard [`exact` scheme](https://docs.x402.org/schemes/exact) is compatible with the owner's model: the agent signs the selected amount, which is below or equal to the release maximum. A different flow in which the agent signs a maximum before billable work and the actual amount is determined afterward is the standard [`upto` scheme](https://docs.x402.org/schemes/upto). This investigation does not redefine component choice as time/token metering or prescribe a scheme change for the existing chosen-purchase path.

Existing `quote_id` and stored records are compatibility identifiers. Retaining records while restoring the SDK boundary does not require presenting a buyer-facing quotation stage, deleting old purchases, or rebuilding sandbox behavior. The current [commerce implementation](https://github.com/Cirrefera/Second-Wind/blob/c0fb9cc2c6927a036e2d0193c3d505630c4c227a/workers/gateway/src/commerce.js) contains both protocol orchestration and legitimate application state; those responsibilities must be separated rather than deleting the file wholesale.

## Restoration constraints established by source inspection

1. **A hook exception is not automatically a payment veto.** In core 2.28.0 `settlePayment()`, an ordinary exception from a before-settlement hook is logged and processing continues. An explicit `{abort:true, reason}` return creates the blocking settlement error. A D1 claim/storage error must therefore be deliberately mapped to that supported abort contract; merely moving existing throwing code into a hook is insufficient.
2. **Post-settlement recording can fail while settlement succeeds.** The same function catches/logs `onAfterSettle` exceptions and retains the successful settlement result. Existing receipt persistence, uncertain outcomes and authenticated recovery must remain explicit application responsibilities. The SDK does not make a blockchain transfer and a D1 write one atomic transaction.
3. **Handler completion is not settlement proof.** Hono middleware calls the handler after verification and settles afterward for the authorization flow. It cancels settlement on a thrown handler or HTTP status at least 400. A handler must not mark a purchase settled or grant paid delivery solely because it has produced a result.
4. **SDK retries and application replay are different.** Core 2.28.0 `settleWithPendingRetry()` retries exactly once for a nonterminal `settlement_pending` outcome carrying a broadcast transaction hash, using identical payload and requirements. It does not authorize a fresh payment or a blanket retry after unknown transport failure. Preserve one application settlement owner and known-outcome recovery; account for the SDK's own bounded reconciliation behavior rather than layering another retry loop over it.
5. **The SDK hook surface is not a complete durable purchase ledger.** It exposes abort/skip/recovery hooks, but this research has not demonstrated cross-Worker atomic claims, crash-safe receipt recovery, or buyer authorization for every existing recovery path under a restored integration. Those guarantees must be mapped to the existing D1 state before changing serving code. Do not manufacture successful verification/settlement results to make integration pass; any replay shortcut must use authenticated, confirmed durable evidence.
6. **Response persistence needs an explicit integration point.** The pinned Hono middleware buffers the handler response before settlement and then returns it with settlement headers. A purchase ID/private recovery token can be prepared before settlement, while durable paid status must follow confirmed settlement. How a failed post-settlement write changes the application response and exposes truthful recovery remains a design item, not a claim established by hook availability.

These constraints are drawn from the published 2.28.0 Hono `paymentMiddlewareFromHTTPServer()` and core `x402ResourceServer.settlePayment()`, `settleWithPendingRetry()` and `x402HTTPResourceServer.processSettlement()` implementations. They identify the narrow adaptation work required; they do not justify another custom payment rail.

## Decision left for implementation planning

Map each existing durable transition to the supported SDK lifecycle and identify the minimal adapter that preserves request/scope identity, one execution/settlement owner, confirmed receipts and free recovery. Then review that mapping against the existing fault cases before replacing the serving route. No experimental alternative implementation, test execution, production write, price change, product activation or payment was performed for this note.
