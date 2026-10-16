# Second Wind

**Agents stall. Second Wind gets them moving.**

Second Wind sells small, specific AWS tools to autonomous agents that carry wallets. Each tool solves one small task — the exact source coordinate plus the operational knowledge to use it, distilled from AWS open-source repositories — priced at **$1.00 USDC or less**, session-less, paid via the [x402 protocol](https://github.com/x402-foundation/x402) with USDC settlement on Base.

**Status: pre-launch.** The serving surface is live at **[secondwindai.com](https://secondwindai.com)**; inventory is being curated repo by repo.

## How it works

1. `GET /api/proof` — free liveness check before spending
2. `GET /api/tools` — free listing of every live tool with its price
3. `GET /api/x402/{sku}` — returns `402 Payment Required`; the `PAYMENT-REQUIRED` header carries base64 JSON payment requirements (x402 v2)
4. Use the network, token, amount, and receiving address in `accepts[]` (`@x402/fetch` handles the payment flow), then retry the same request with `PAYMENT-SIGNATURE`
5. Delivery: the tool + source pointer + SPDX license + content hash + settlement receipt

Full machine-readable contract: [`/openapi.json`](https://secondwindai.com/openapi.json) (every endpoint, full schemas) · Agent card: [`/.well-known/agent-card.json`](https://secondwindai.com/.well-known/agent-card.json) · Agent doc: [`/llms.txt`](https://secondwindai.com/llms.txt) · x402 resources: [`/.well-known/x402`](https://secondwindai.com/.well-known/x402)

## Conformance

Second Wind uses the [Coinbase x402 v2 specification](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md) and its HTTP transport: `402` + base64 `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` headers, CAIP-2 network ids, and extensions built with the official `@x402/extensions` helpers — `bazaar` (discovery) and `payment-identifier`. The committed configuration uses Base Sepolia and the public testnet facilitator. Read the actual challenge for the deployed payment terms. See [receiving wallet configuration](docs/receiving-wallet.md).

A unique ledger index prevents duplicate records for nonempty idempotency keys. Durable purchase recovery and reconciliation remain implementation work; the index alone does not guarantee free redelivery or prevent duplicate execution.

## Architecture

Cloudflare-first: Pages Functions serve every endpoint; a dedicated D1 database is the single runtime source of truth — the tools listing, openapi.json, and the x402 discovery documents are all generated from its live rows, never hand-maintained.

## Registry

Listed in the **Amazon Bedrock AgentCore Agent Registry** (registry `jaMy0SuApKYYJDTa`, record `vA5tdL2q4L8O`; record predates the Second Wind rename — update pending).

## Provenance & licensing

Tools derive from Apache-2.0 and MIT-0 licensed AWS ecosystem projects. Second Wind describes and links; it does not redistribute. Every delivery carries its source repo, SPDX identifier, and a content hash over exactly what a buyer receives.

---

A **Second** family entity. Second Wind operates independently with its own domain, database, and settlement wallet.
