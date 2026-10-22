# Second Wind

**Pay only for what you need. Prices shown are for the full product.**

Second Wind sells original, useful AWS payloads to autonomous agents. Publicly sourced AWS information and code are selected, combined, structured, and adapted into deliverables for specific tasks. Purchases use the [x402 protocol](https://github.com/x402-foundation/x402) with USDC settlement on Base.

For products marked `pricing_mode: proportional-components`, Second Wind lets your agent test the actual product release in an isolated sandbox before choosing what to purchase. The component menu states each share and its dependencies. You review the selected files and exact amount before authorizing x402 payment.

**Availability is product-specific:** check the live [catalog](https://secondwindai.com/api/tools) and its component menu. Products without component pricing retain their stated fixed-price contract.

## Your interaction

Discover products for free, describe your requirements, and clarify configuration through a bidirectional Cap’n Web session. For component-enabled products, test, select, review, and authorize payment. The purchased package is bound to the selected release and configuration, with a hash for verifying the delivered bytes. Keep private recovery credentials so you can reconnect and retrieve a completed purchase without buying it again.

A successful sandbox execution establishes what ran in that sandbox. It does not establish that your application works in a separate AWS environment. Supported delivery languages and runtimes belong to each product’s contract; JavaScript is the current sandbox orchestration language.

## Interfaces and implementation

- [Agent instructions](https://secondwindai.com/llms.txt)
- [Live catalog](https://secondwindai.com/api/tools)
- [HTTP API](https://secondwindai.com/openapi.json)
- [Payment readiness](https://secondwindai.com/api/proof)
- Cap’n Web: `https://secondwindai.com/capnp`

The `secondwind-gateway` Worker hosts the shared product service behind HTTP/x402 and Cap’n Web. Pages forwards application traffic to the gateway. Sandbox execution uses isolated Dynamic Workers through its loader binding. D1 maintains purchase and recovery state.

## Information handling

The business event contract records identifiers, stages, selected scope, amounts, and outcomes. It excludes payment signatures, recovery tokens, and private buyer code or callback content. Trial results are stored separately for authenticated trial recovery. Do not include credentials in trial inputs; the sandbox receives no gateway secrets.

## Product contracts

Use each listing’s declared deliverable, license, provenance, supported boundary, and release hash to decide whether it meets your needs. A source link alone is not a software artifact. Only the live catalog establishes what is currently offered.

## Provenance & licensing

Publicly sourced material supplies the inputs. Second Wind's original contribution is the selection, synthesis, arrangement, adaptation, and validation that combine those inputs into a specific useful payload. The assembled product itself is part of what the buyer purchases; its value includes the original composition and the functionality described in its contract.

Release policy requires source provenance, applicable licenses, required upstream attribution and notices, and a description of the original contribution in the release manifest. Product review must assess that contribution separately from source and license review. A content hash identifies the exact assembled bytes delivered to the buyer.

---

A **Second** family entity. Second Wind operates independently with its own domain, database, and settlement wallet.
