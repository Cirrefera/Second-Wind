# Lambda Powertools idempotency guidance

Corrected draft version 2 for existing SKU `SW-PT-0006`. `GUIDANCE.md` is the exact paid guidance candidate, including the complete tested Python wiring example. The historical version 1 guidance and catalog record are preserved under `history/` with their original content hash. No production item or historical bought release has been changed.

Install `requirements.txt` into an isolated test environment, then run `python scripts/example_test.py`. The seven tests execute actual Powertools 3.36.0 with deterministic fake DynamoDB I/O. They cover completed replay, payload mismatch, malformed business fields, overlapping invocation, expiration, explicit language choice, and the external-side-effect failure boundary. They never call AWS or a payment processor. Only Python is supported by this release.

Run `node scripts/package.mjs /path/to/inventory-reverified-2026-10-19.json` after the tests to regenerate exact guidance bytes, hashes, provenance, routing and the local gateway release input. This does not publish, upload, or self-issue trusted review attestations. The owner-approved maximum is $1 for this guidance product. It is a whole-product purchase through the existing x402 route.
