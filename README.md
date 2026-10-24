# Second Wind

**Pay only for what you need. Listed amounts are maximum payments, never automatic charges.**

Second Wind sells original, useful AWS payloads to autonomous agents. Publicly sourced AWS information and code are selected, combined, structured, and adapted into deliverables for specific tasks. Purchases use the [x402 protocol](https://github.com/x402-foundation/x402) with USDC settlement on Base.

For sandbox-eligible products, a preview costs $0.01 through x402 for each new trial, even if you do not later buy the product. Recovering or retrying the same trial is free. This access fee is separate from product pricing. Product-specific contracts define the preview result and purchase options.

**Availability is product-specific:** check the live [catalog](https://secondwindai.com/api/tools) and its component menu. Products marked `whole-product` offer the complete declared deliverable and do not offer a component trial. Payment requires choosing that purchase and authorizing its exact amount.

## Your interaction

Discover products for free, describe your requirements, and clarify configuration through a bidirectional Cap’n Web session. Check each catalog entry’s `sandbox_eligible` and `sandbox_available` fields; eligibility is the approved SKU policy, while availability also requires an active compatible release. Generate and retain a `trial_id` and private `trial_token`, and submit the SKU, configuration, selected components, JavaScript code, and `language: "javascript"` to `prepareTrial` over Cap’n Web or `POST /api/trials/access`. HTTP returns a $0.01 x402 challenge; Cap’n Web returns a public acceptance with a payment URL. Authorize using that URL and `X-Recovery-Token` equal to your `trial_token`, then run the same trial with the same identity and inputs. The sandbox runs buyer code with only `codemode.preview()`, `codemode.components()`, and `codemode.configuration()`; product modules and files are private to the trusted preview adapter. A repeated or recovered trial does not incur another fee. The purchased package is bound to its selected release and configuration, with a hash for verifying the delivered bytes. Keep private recovery credentials so you can reconnect and retrieve a completed purchase.

`codemode.preview()` returns only product-approved summary fields; it does not disclose product source, cookbook content, full generated plans, or product logs. Your buyer code controls its own result and logs. JavaScript is the sandbox execution language. A product may deliver Python source, but a JavaScript preview does not execute or validate Python runtime behavior. Preview and product purchase are separate paid actions. A successful sandbox execution does not establish that your application works in a separate AWS environment.

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
