# FIX-05 — Original assembled payloads and source provenance

## Owner-defined product policy

**Second Wind payloads combine publicly sourced information into an original, useful assembled product. The original content is the selection, synthesis, structure, adaptation, and integration that make the inputs work together for a specific task.**

The owner clarified this on October 22, 2026. This is the adopted product definition. It is not a pending choice between public-source services and private original content. The earlier A/B framing was incorrect and is superseded by this clarification.

The buyer purchases the original assembled deliverable and the functionality in its contract. Public source inputs, the original composition of those inputs, and the distribution of finished payload bytes are separate properties. None of those properties by itself establishes the other two.

Status: **READY_FOR_RELEASE** for this bounded policy/documentation correction. README, SPEC, publication-review guidance, tracker, and handoff now use the owner's definition. Existing publication checks already require an original-contribution claim, product review, and independent source/license evidence. No runtime or schema change is needed to express this policy. Merging the documentation remains pending with PR #7; individual product approval and trusted review verification remain in their existing backlog items.

## Product and review requirements

For each release, use the existing manifest and review path to record:

1. **Source inputs:** the information, code, patterns, or other material used, with enough provenance to identify the relevant source and version. Preserve applicable source attribution and license notices.
2. **Original contribution:** describe the concrete selection, synthesis, arrangement, adaptation, integration, examples, or validation that turn the inputs into the delivered product. State what this combination enables for the buyer's task.
3. **Delivered result:** the exact product scope, supported language/runtime where applicable, files or capabilities, validation evidence, and immutable content hash promised by the release contract.
4. **Product review:** assess whether the actual assembled payload supports that contribution and promise. A nonempty description or a matching hash is structural evidence; the existing review must assess the substance.

The existing `original_contribution` field is the place to describe the synthesis. This clarification does not require a new privacy flag, a minimum number of source repositories, an originality score, or a different architecture. Publicly sourced inputs are expected material for this process.

## Exact evidence

Review date: **October 22, 2026**, approximately **1:24:15 p.m. EDT** (`2026-10-22T17:24:15Z`). The public reads used the identified `SecondWind-readiness-review/1.0` user agent. No authenticated content retrieval, quote creation, purchase endpoint, settlement, or recovery-delivery request was needed for the public exposure check.

| Evidence | Result |
| --- | --- |
| Main source reviewed | `a853b9edbdb00be21b7ba157e7deb3ed36782643` |
| Current draft PR #5 | Open/draft; exact head `8711cdcf2dc31b16dc599da6db7cd0afd783a537` |
| Public raw v1 guidance request | HTTP 200 without credentials |
| Downloaded UTF-8 byte length | **5,333 bytes** |
| Independently computed SHA-256 | `62a28a512af90491310989a0cef85afdd6f4e53cddddd4b43cff6b5eb975abbe` |
| Git content blob SHA | `a3eae7858292e6808f6852ec2fad9634dda849b2` |
| Current `/api/tools` | HTTP 200; one live product, `SW-PT-0006`, slug `lambda-powertools-idempotency`, version 1; advertises the identical 5,333-byte size and full SHA-256, hash scope `guidance-utf8` |
| Current advertised price | 0.10 USDC / `100000` atomic units |
| Current discovery | HTTP 200; same SKU/version/hash; payment configured and recipient verified; Base mainnet `eip155:8453` |
| Current `/health` | HTTP 200; gateway version `0187ab0f-9daa-4eb2-b1dd-0fb2d19e1936`; source tag `048f08853e863391cf8652cafdd464140e810616` |

Primary references:

- [Public v1 guidance at the exact draft head](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/history/v1-guidance.txt)
- [Unauthenticated raw content URL used for the byte/hash check](https://raw.githubusercontent.com/Cirrefera/Second-Wind/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/history/v1-guidance.txt)
- [Historical v1 catalog record](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/history/v1-catalog-record.json)
- [Current public catalog](https://secondwindai.com/api/tools)
- [Current public discovery](https://secondwindai.com/v2/x402/discovery/resources)
- [Current health](https://secondwindai.com/health)

The historical catalog record preserves an older truncated content hash (`62a28a512af90491`). This review does not use that prefix as proof. It computes the full SHA-256 from publicly downloaded bytes and compares it with the full current advertised hash.

**What this proves:** the exact bytes identified by the live product's public hash and byte count are currently downloadable from public GitHub without payment. **What this does not prove:** a newly funded purchase would deliver those bytes correctly. The paid path was not invoked, and funded delivery remains outside this review.

The repository also contains the complete prospective v2 deliverable: `products/lambda-powertools-idempotency/GUIDANCE.md` and the inline payload in `release-input.json`. The candidate identifies 9,572 UTF-8 bytes with SHA-256 `80a57963f64ae52ab0f75ad9b58bbab737db9891b13d7a87961f0b5947239fbf`. Its manifest remains draft and names pending trusted guidance/contract, licensing/provenance, and publication reviews. These observations describe where the assembled bytes are available. They do not determine whether the product has an original contribution, and they do not change the owner-defined product model.

- [Draft v2 guidance](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/GUIDANCE.md)
- [Draft v2 release input containing inline payload/source files](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/release-input.json)
- [Draft v2 candidate and explicit blockers](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/release-candidate.json)

## Existing publication support

The current gateway validator already separates original contribution from source provenance:

| Existing field or evidence | Purpose under this policy |
| --- | --- |
| `manifest.original_contribution` | Describes the actual original synthesis/composition in the product |
| `evidence.product_review_hash` | Binds the reviewed product-contribution claim to the exact manifest |
| `manifest.delivery_contract` and `manifest.validation_contract` | Define the deliverable and its validation promise |
| `evidence.contract_review_hash` | Binds the reviewed contract to that manifest |
| `manifest.origin`, `manifest.license`, `evidence.license_verified` | Record and review origin/licensing independently from the original-contribution claim |
| Guidance or payload verification hashes | Bind review and delivery to the exact release bytes |

Both main and the reviewed PR #5 validator explicitly treat original contribution as a reviewed product claim, not an automatic plagiarism verdict. Public availability of source material is not a rejection condition. The draft preparation path maps product, contract, and license reviews into these existing checks and separately records source provenance, source hashes, interface sources, and license mapping.

Current main contains the validator and its tests; the preparation/activation caller is in PR #5 and has not been deployed by this batch. These existing checks support the policy contract, but this document does not claim that live activation already enforces the complete draft path. The authenticity of review evidence and the actual trusted publication path remain **FIX-08**. The current source-ready candidates still need their existing per-product reviews under FIX-10/11. This policy clarification does not itself approve a particular payload or rewrite a historical purchase.

Relevant source:

- [Current accepted publication validator](https://github.com/Cirrefera/Second-Wind/blob/048f08853e863391cf8652cafdd464140e810616/workers/gateway/src/publication.js)
- [Draft publication validator](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/workers/gateway/src/publication.js)
- [Draft release preparation](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/workers/gateway/src/release-preparation.js)

## Changes made for the clarification

- README now describes the original assembled payload and its source provenance; it no longer describes the product as merely a source pointer or categorically says that upstream material is never included.
- SPEC now defines original synthesis/composition as the product model and separates source provenance, product contribution, and delivery. The existing free discovery versus purchased-payload behavior remains explicit.
- The tracker and handoff remove the pending A/B choice. The owner has supplied the product policy; there is no further owner policy input required for FIX-05.
- The existing contribution/product/contract/license checks remain the implementation basis. No new runtime gate, schema, price, catalog record, payload version, or deployment was introduced.

The publication of a finished assembled payload is retained above as a verified historical observation. It is not evidence that publicly sourced inputs prevent original content, and it is not a reason to redefine the paid product as delivery services alone. Existing purchased versions, prices, hashes, recovery rights, and public history remain intact.
