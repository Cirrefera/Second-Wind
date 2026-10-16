# Receiving wallet configuration

The owner approved `0x08D7870Ce7Fa3889Fb7475dF52456d053a2b4bcf` on October 15, 2026. Set `X402_PAYTO_PUBLIC` to this public receiving address. A receiving address is not a private key or facilitator credential.

The committed configuration remains Base Sepolia (`eip155:84532`) with the public testnet facilitator. This wallet change does not promote the service to mainnet. Production network, facilitator support and authentication must be configured together before a controlled settlement test.

## Configuration rules

- Prefer `X402_PAYTO_PUBLIC`. The legacy `X402_PAYTO` variable is accepted for compatibility, but both values must identify the same address if both are present.
- Missing, malformed, zero or conflicting recipients disable the paid route with HTTP 503 and suppress payment offers in both discovery endpoints.
- Middleware cache identity includes recipient, network, facilitator URL and database binding. A changed recipient cannot reuse the previous recipient's cached challenge.
- The proof endpoint's `payTo_configured` field reflects this recipient validation. It is not proof of settlement readiness or wallet ownership.

## Deployment checks

1. Inspect production and preview variables for a stale `X402_PAYTO`; remove it or set it to the same approved recipient. Do not expose facilitator credentials in logs or source.
2. Confirm the selected network/token pair and facilitator's supported schemes. Use the configuration format supported by the installed v2 SDK.
3. Run `npm run selftest` and `npm run build:worker`.
4. After an authorized deployment, decode an actual `PAYMENT-REQUIRED` challenge and compare its recipient/network/token with both `/.well-known/x402` and `/v2/x402/discovery/resources`.
5. Before commercial rollout, complete durable fulfillment/recovery and test a lost-response recovery after confirmed settlement. The wallet patch does not implement those guarantees.

Keep historical payment evidence unchanged. A new receiving address must not rewrite an old purchase's recipient or substitute new terms into an existing signed authorization.

## References

- [Cloudflare x402 overview](https://developers.cloudflare.com/agents/tools/payments/x402/)
- [Cloudflare HTTP charging guide](https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-http-content/)
- [Cloudflare v2 HTTP example](https://github.com/cloudflare/agents/blob/f56cd20dd58dc88f4b76a601bcd94b9eabcd6661/examples/x402/src/server.ts)
- [Cloudflare Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)

The HTTP guide includes the older `x402-hono` interface. The inspected v2 example uses `@x402/hono`; retain a coherent v2 package set rather than mixing the two interfaces.
