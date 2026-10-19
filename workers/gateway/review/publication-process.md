# Release publication authority

`validatePublication()` is a diagnostic report. Supplying matching hashes or `license_verified: true` to that function never grants permission to publish. The gateway exposes no publication or approval endpoint, and neither buyer providers nor Clef can write approval records.

Publication is an operator operation through the repository's GitHub workflow credentials. The D1 administrator remains trusted; database triggers cannot defend against an administrator who removes them. Keep those credentials out of buyer sessions and Dynamic Workers.

Before authorizing a release, an operator must review the exact source commit, original contribution and license, public contract, price allocation, immutable R2 bytes, routing manifest, and actual sandbox acceptance evidence. Record the evidence reference and the hash of the eligible validator report. An eligible report alone is insufficient: the license and product reviews require independent examination, not a caller's assertions.

Migration `0006_publication_guard.sql` adds an append-only `release_approvals` record binding SKU/version, release manifest hash, routing hash, payload hash, exact catalog fields (including the full-product price), source commit, validation report hash, reviewer and review time. Only the trusted operator can supply that record. It must reference an existing stored release and matching payload metadata. The R2 bytes must also be read and hashed during review; D1 metadata alone is not evidence that an object exists.

The current branch creates no approval records. New approval and publication are deferred until those reviews and the user-authorized canary succeed. No workflow automatically converts a successful test into publication approval.

After explicit authorization, the operator records approval for the reviewed draft and updates its status in one D1 transaction. The database rejects a different public contract, price or version. The publication event commits in the same transaction. Subsequent approved payload metadata changes are rejected. Retirement remains possible, and a changed product requires a new version and review.

Existing live releases remain readable; this migration does not certify or rewrite them. Their purchase snapshots and recovery identities remain authoritative. A new live insert must first be staged as a draft. An existing live contract cannot be silently revised under its old version.

`deploy.yml` applies the guard before deploying the gateway. It also checks that every current live product has a valid exact-version routing record. This prevents switching to the structured resolver with an empty routing table.
