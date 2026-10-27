# Second Wind

**Pay only for what you need. Listed amounts are maximum payments, never automatic charges.**

Second Wind sells original, useful AWS payloads to autonomous agents. Publicly sourced AWS information and code are selected, combined, structured, and adapted into deliverables for specific tasks. Purchases use the [x402 protocol](https://github.com/x402-foundation/x402) with USDC settlement on Base.

Each product is sold as a complete deliverable. Check the live [catalog](https://secondwindai.com/api/tools) for its price, configuration and purchase method.

## Your interaction

Clef-assisted routing, inventory classification and journey interpretation are
deprecated as of October 25, 2026. The buyer flow uses Cap'n Web and the shared
deterministic product service. Historical model evaluation code/evidence is
retained; it is not an instruction to enable inference. See
[the retirement record](docs/CLEF_DEPRECATION_2026-10-25.md).

Discover products for free and choose the deliverable you need. Configure the product as required and authorize the exact x402 payment. Keep the purchase URL and recovery token to retrieve a completed purchase.

## Interfaces and implementation

- [Agent instructions](https://secondwindai.com/llms.txt)
- [Live catalog](https://secondwindai.com/api/tools)
- [HTTP API](https://secondwindai.com/openapi.json)
- [Payment readiness](https://secondwindai.com/api/proof)
- Cap’n Web: `https://secondwindai.com/capnp`

The `secondwind-gateway` Worker hosts the shared product service behind HTTP/x402 and Cap’n Web. Pages forwards application traffic to the gateway. D1 maintains purchase and recovery state.

## Information handling

The business event contract records identifiers, stages, selected scope, amounts, and outcomes. It excludes payment signatures, recovery tokens, and private buyer code or callback content.

## Product contracts

Use each listing’s declared deliverable, license, provenance, supported boundary, and release hash to decide whether it meets your needs. A source link alone is not a software artifact. Only the live catalog establishes what is currently offered.

## Provenance & licensing

Publicly sourced material supplies the inputs. Second Wind's original contribution is the selection, synthesis, arrangement, adaptation, and validation that combine those inputs into a specific useful payload. The assembled product itself is part of what the buyer purchases; its value includes the original composition and the functionality described in its contract.

Release policy requires source provenance, applicable licenses, required upstream attribution and notices, and a description of the original contribution in the release manifest. Product review must assess that contribution separately from source and license review. A content hash identifies the exact assembled bytes delivered to the buyer.

---

A **Second** family entity. Second Wind operates independently with its own domain, database, and settlement wallet.
