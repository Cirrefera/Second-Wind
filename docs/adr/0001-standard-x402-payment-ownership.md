---
status: accepted
---

# Standard x402 owns payments; Second Wind owns trial and selection

The owner reaffirmed on October 24, 2026 that Second Wind must default to standard x402 payment rails while preserving its sandbox and agent-selected purchasing model. Restore the official Hono/x402 integration as the default owner of payment challenges, payment verification and settlement; retain Second Wind's product discovery, Code Mode trials, Cap'n Web selection capabilities, selected-scope pricing, entitlement records and authenticated recovery. A merge or passing test suite does not authorize replacing that boundary with a custom payment protocol or orchestrator.

The historical gateway at `409afcb94e0a8bd12f4107543df66a8f466725c3` mounted `@x402/hono`'s `paymentMiddleware` on `/rpc`. Commit `cc0a70b17bb6a1f5ab8a22a0b99dde26c7d95d86` removed that middleware and introduced manual challenges and a custom commerce lifecycle. The current code still uses x402 for verification and settlement underneath, but that does not make its replacement of the official integration the accepted architectural baseline.

## Consequences

- Preserve the journey: inspect the maximum, test in the sandbox, choose and accept the desired scope, then pay through standard x402. Internal compatibility identifiers do not create a buyer-facing quote stage.
- For a selected purchase whose final amount is known after trial, the standard `exact` scheme can settle that selected amount. Do not mistake `exact` for a requirement to charge the full product maximum.
- If an existing product genuinely needs maximum authorization followed by a usage-derived final charge, use the official supported x402 scheme and its documented settlement mechanism. Do not invent usage quantities, new billing products or a custom rail to fill that requirement.
- Keep application-owned product snapshots, selection hashes, D1 purchase/entitlement history and R2 delivery bytes. Integrate them with supported SDK lifecycle interfaces; do not reimplement signature validation, payment-header formats or facilitator settlement routing.
- Preserve settled purchases and private recovery credentials. A transport retry, delivery retry or uncertain settlement must not become another charge. SDK integration must account for these cases before any runtime replacement is deployed.
- This is a correction of ownership, not a blind rollback to an old commit. Later sandbox, selection, delivery, routing and integrity work remains in scope for preservation.
- Current publication and commercial-allocation prerequisites remain separate from payment-framework restoration. Do not activate products or manufacture review evidence as a side effect.

This decision does not assert that restoration is implemented or that the older gateway had every required application safeguard. Exact SDK integration and migration boundaries must be traced from the pinned SDK source and current persisted contracts before implementation.
