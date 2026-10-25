# Five Powertools private preview releases

This is an AI source and evidence review of the five releases below. It is not an independent human review, a legal opinion, a funded production purchase, or verification of an AWS deployment. The owner's instruction to continue the accepted release work authorizes this publication unit. All other draft products remain inactive.

## Exact reviewed identity

| Public product | Version | Manifest SHA-256 | Payload SHA-256 | Private JavaScript bytes |
| --- | --- | --- | --- | ---: |
| lambda-powertools-logger-ts | 1 | 710c0b8520dc1d28661254213e2e60d14753f382ba0777e68839ea44c19bb14e | 953238e380c5c012e38d2766390e9e804dcb05fe88b0688d4488f770ce6adbc9 | 24675 |
| lambda-powertools-metrics-ts | 1 | b7e6085aff7a4b729908d0f6e220d519fc5157ebd91b8080a3f6687ca9076b80 | 8c27c1758cf331a9136c358cb3e1be3b99a32db403aac3997b0b3708ac9ae475 | 17957 |
| lambda-powertools-idempotency-ts | 1 | 39391d447dd6d5b988d0b008b1bb944875b002fdf2ea451e38497ae064956661 | 66703bbb31e0e8809fc3baa7240a8436caebd7fdf0c18bd55f560d6bda7ba835 | 226455 |
| lambda-powertools-parameters-ts | 1 | 0e3fdde15920497d0f53d7108f5ce48bf3320cb7a20d64a48ff48c8b56202e65 | 5baee78268e47cdd7e3b7acee90e6a7895095137ad0b94d8f2866e4510359e8d | 240849 |
| lambda-powertools-batch-ts | 1 | c89d60b0a6f7559ddea82b6a6780e4e6eb61391e92ce557cf3da4c9178b20b47 | fb62928abc4e0cb8af20329dc84b0d0a36936f671914a2005d02a57f86fb6d0d | 9232 |

The frozen release inputs are under each product's releases/v1 directory. Metadata was reconciled after execution: direct dependency declarations, provenance license wording, stale Batch validation fields and runtime blocker labels. The executable preview bytes match the tested checkpoint exactly. Reviewed runtime evidence SHA-256: ee6c87c4672aa1a0c85da5feac68b564780826dc0d11ee351674dc8ecf37a692. The evidence records its measured manifest identities separately; the current identities above include the metadata corrections.

## Observed product behavior

Twelve configurations executed in actual local Workerd Dynamic Workers through the real generic private adapter. Logger DEBUG/INFO each emitted one local line; WARN/ERROR emitted zero. Metrics emitted real Powertools EMF and checked namespace, service and optional dimensions in two configurations. Idempotency used the purchased wrapper and real DynamoDB persistence-layer commands against an in-memory SDK fixture; two repeated inputs invoked the handler once in both expiration configurations. Parameters used the actual SSM helper/provider, SDK command and JSON transformation with a fixed local response at cache ages 0, 30 and 86400. Batch ran the purchased standard-SQS helper and real processor against two synthetic records, returning exactly one intentional failure.

The previews make no AWS calls. SDK responses and events are local fixtures, not remote service success. Idempotency preview is a demonstration using a fixed body.orderId event; other caller expressions can fail that fixture and do not establish production incompatibility. Secrets Manager is included in delivered Parameters code but this preview executes its SSM path only. Lambda runtime, CloudWatch ingestion, IAM, external credentials, live DynamoDB concurrency, deployment and AWS service behavior remain unverified.

## Privacy and trial policy

For all twelve configurations, separate buyer-authored Code Mode execution received the bounded preview result, could not import product/preview.mjs, and saw no gateway bindings. Results contain finite diagnostic codes and counts, never source, cookbook content, full plans, files or arbitrary logs. Outbound networking is disabled in both isolates. The Acorn parser and exact builtin allowlist validate the real JavaScript closure; the existing 512 KiB/64-module caps are retained. The private allowlist governs packaged dependencies. Buyer code runs in a separate child without product modules or gateway bindings.

The fixed sandbox policy contains exactly 72 eligible SKU identities. Live D1 has all 72 and 85 excluded identities, including the retired proof row. Product type, component pricing and source readiness do not grant eligibility. A one-off excluded component fixture had no trial/access URL and was rejected through the shared HTTP trial-access service and Cap'n Web capability with zero acceptances or payments. Published compatibility is additionally required. New admissions cost $0.01 through standard @x402/hono; identical trial recovery is free; an optional selected product purchase is separate.

## Deliverables, price and provenance

Each product supplies one base component with the approved $1 USDC maximum and 10000 basis points. Each declares JavaScript delivery explicitly, and configuration is validated before admission. These products do not claim universal-language execution. The real Lambda integration source remains readable after purchase, with package declarations, configuration schema, README and validation/provenance records. Locked npm trees and full bundled dependency notices accompany Logger, Metrics, Idempotency and Parameters. Batch carries its Powertools MIT-0 notice; its published direct versions are exact. Original integration source is Apache-2.0. Bundled Powertools is MIT-0; AWS SDK and other bundled packages retain their recorded Apache-2.0/MIT notices. No notice is replaced by a claim that all upstream source is original.

Source preparation checks exact delivered UTF-8 bytes, file lengths/hashes, payload, manifest/routing identity, example configuration, explicit language, component allocation and approved price. Five source inputs passed after metadata reconciliation. Review records bind the hashes above and describe this actual AI source/evidence review. The existing publisher still verifies immutable R2 bytes and D1 identity/price before activation. Historical releases, purchases, recovery credentials and bytes are preserved.

## Ordered release

The compatible gateway and the corrected discovery projection must deploy and pass the existing release acceptance before a separate publication-record commit activates these five releases. This report and frozen inputs alone activate nothing. Existing required CI remains mandatory; its run and the deployed identity are release evidence separate from this local review. No fresh funded production settlement is claimed. The other 66 draft previews remain unavailable pending their real runtime integration.
