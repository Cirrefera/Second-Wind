# FIX-05 — Public source and paid-content boundary

## Outcome

**Public exposure is confirmed against the current advertised live release. The remaining blocker is the owner's commercial policy choice.** Recommended policy: charge for the prepared, versioned product and its supported delivery/service while accurately disclosing that source or deliverable content can also be public. This is a proposal, not an adopted policy.

Recommended tracker status: **BLOCKED — evidence and decision preparation complete; owner policy selection and subsequent enforcement pending.** No customer-facing policy, source file, history, catalog row, price, purchased version, repository visibility, or production setting was changed during this review.

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

The repository also contains the complete prospective v2 deliverable: `products/lambda-powertools-idempotency/GUIDANCE.md` and the inline payload in `release-input.json`. The candidate identifies 9,572 UTF-8 bytes with SHA-256 `80a57963f64ae52ab0f75ad9b58bbab737db9891b13d7a87961f0b5947239fbf`. Its manifest remains draft and names pending trusted guidance/contract, licensing/provenance, and publication reviews. A future private-payload policy therefore cannot truthfully treat this already-public candidate as never published.

- [Draft v2 guidance](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/GUIDANCE.md)
- [Draft v2 release input containing inline payload/source files](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/release-input.json)
- [Draft v2 candidate and explicit blockers](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/release-candidate.json)

## Present claims and publication behavior

At main `a853b9e…`, `README.md` describes small AWS tools comprising a source coordinate and operational knowledge; its provenance section says Second Wind describes/links rather than redistributing. `SPEC.md` describes paid guidance and invocable capabilities, limits free surfaces to stubs, and contains a standing rule that curation does not leak free. Those claims do not clearly distinguish **free service endpoints** from **public source repositories**. Neither document explicitly promises exclusive ownership of the delivered content, but their paid/free framing leaves the actual publication policy unclear. Broader architecture, pricing, and redistribution drift remains FIX-19.

- [README at reviewed main](https://github.com/Cirrefera/Second-Wind/blob/a853b9edbdb00be21b7ba157e7deb3ed36782643/README.md): product description and “Provenance & licensing.”
- [SPEC at reviewed main](https://github.com/Cirrefera/Second-Wind/blob/a853b9edbdb00be21b7ba157e7deb3ed36782643/SPEC.md): architecture paragraphs on product model/free surfaces; standing rules 3 and 8 on immutable published versions and free curation.

The draft publication validator checks release identity, immutable hashes, product/contract/license review evidence, payload verification, and declared delivery/language boundaries. The reviewed validator has no explicit field or check establishing whether content is intended to be public or private, whether a price represents content access or a preparation/delivery service, or whether an exclusive-content claim conflicts with public source exposure.

The preparation module separates `stage` from `activate`, preserves immutable release identity, refuses certain historical mutations, and writes payload, input, and review snapshots to R2 before atomic D1 registration. Its trusted review inputs come from the operator path, not a public publication endpoint in the reviewed gateway. These are useful publication mechanics; they do not select a commercial content-visibility policy. The authenticity of approval evidence remains FIX-08 and was not approved or changed in this review.

- [Draft publication checks](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/workers/gateway/src/publication.js)
- [Draft preparation, staging, and activation](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/workers/gateway/src/release-preparation.js)
- [Draft package generator writes full payload/source into release inputs](https://github.com/Cirrefera/Second-Wind/blob/8711cdcf2dc31b16dc599da6db7cd0afd783a537/products/lambda-powertools-idempotency/scripts/package.mjs)

## Two concrete policy choices

### A. Public source; paid prepared product and service — recommended

Keep the current public repository/history. Describe the charge as payment for the supported, prepared deliverable and the service actually included in that release. The listing identifies the exact version, scope, license, validation evidence, and delivery/recovery behavior. Public availability of some or all bytes is disclosed; confidentiality or exclusive access is not advertised. Advanced configuration, sandbox, or automation benefits are advertised only for releases that actually supply them.

Proposed customer-facing policy text for owner approval:

> Second Wind charges for prepared, versioned deliverables and the services stated in each product contract. Source material or deliverable content may also be publicly available. Each listing identifies what the purchase includes, its license, supported scope, and validation and delivery terms. Payment does not imply exclusive access to publicly available content.

Concrete enforcement after approval:

1. Add this paid/public distinction to the authoritative product policy and the relevant README/SPEC sections. Define “free surfaces carry stubs” as a service API rule, not a claim that no source is public anywhere.
2. Require product/contract review to record existing public availability and the actual paid value for each future release. Reject exclusive-content wording for publicly exposed bytes. Keep the license and original-contribution review separate from commercial positioning.
3. Preserve historical v1 content, price, receipts, and recovery identity. Apply future metadata/claim changes prospectively; do not rewrite old purchases. Existing paid delivery remains governed by the recorded contract.

Why recommended: it fits the demonstrated public-source state and the platform's intended value in curation, validation, selection, and dependable delivery. It requires no history rewrite or replacement product merely to restore a secrecy claim. This is a commercial recommendation, not an assessment that the currently live guide already delivers every planned platform benefit.

### B. Private original payloads for future releases

Keep existing public history and identify already-public v1 and v2 material accordingly. For genuinely new original deliverable content intended to remain private, keep full payloads and release inputs outside public commits/PRs. Public code, schemas, manifests, and tests use metadata or synthetic fixtures. Approved full bytes remain in private controlled preparation/storage and are delivered through the existing commerce path.

Proposed policy text for owner approval:

> Second Wind identifies the public-source and private original portions of each new product release. Only original content that has not already been published is described as private. Public upstream material and previously published versions retain their stated provenance and licenses. Purchased versions remain recoverable under their recorded delivery terms.

Concrete enforcement after approval:

1. Explicitly identify which future original files are private and which dependencies/material are public. Do not relabel current v1 or the exposed v2 candidate as confidential.
2. Prepare a private source-to-R2 release process before producing such a release; ensure public release-input snapshots and test fixtures do not embed its full content. The current draft package generator embeds full payload/source and therefore is not sufficient for this policy unchanged.
3. Add a reviewed visibility/claims gate to release preparation and preserve existing purchased-version delivery. Product/license/contract approvals remain independently required.

Tradeoff: this requires extra release-process work and a clear definition of new original private material. Repository privacy or history rewriting would not retract previously downloaded copies and is not proposed as a remedy.

## Exact remaining decision

The owner should select **A (paid prepared products/services with public source allowed)** or **B (private new original payloads, with existing public material acknowledged)**. Do not mark FIX-05 complete on recommendation alone. After selection, implement the bounded claims/publication enforcement for that policy, verify historical buyer/version preservation, and record the concrete evidence. No additional input is needed to establish the current exposure; that part is complete.
