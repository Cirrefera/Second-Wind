# Public product identities

Agents use descriptive slugs such as `agent-state-dynamodb-manifest`. Catalog discovery, OpenAPI, component links, intent-search matches, Cap'n Web product/configuration metadata, purchase descriptions and receipt metadata expose `slug`. New HTTP configuration, trial and RPC requests use `{slug, ...}`. The old `sku` request field and existing numeric purchase URLs remain accepted for saved requests; they are no longer advertised.

This follows the descriptive resource pattern in the [official x402 Hono seller example](https://docs.x402.org/getting-started/quickstart-for-sellers), which protects `GET /weather`, and [Cloudflare's Worker example](https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-http-content/), which uses `/premium`. The change is product presentation, not a payment protocol extension.

Internal SKU keys still join the catalog, immutable release records, payment ledger and telemetry. The gateway projects service-owned metadata only at HTTP/Cap'n Web boundaries. It does not recursively alter buyer configuration, buyer results, signed facilitator data or purchased artifact bytes. Stored receipts and selection snapshots are unchanged. Their existing hashes remain references to the original stored records, rather than a new hash of the public metadata projection. Previously purchased file contents remain byte-for-byte recoverable.

New sandbox admissions describe the selected product using its slug. Sandbox challenges describe `sandbox-preview`; invocation challenges describe `javascript-execution`. The official `@x402/hono` middleware still constructs challenges, verifies and settles the same amounts. Existing accepted resource URLs are used exactly as accepted, including legacy URLs.

Local verification exercised descriptive discovery and component URLs, structured resolution, and a `{slug,...}` sandbox request reaching the official 402 challenge for 10,000 USDC atomic units ($0.01). No funded payment was submitted by that verification. Existing payment/recovery and capability checks retain legacy request inputs to verify compatibility.
