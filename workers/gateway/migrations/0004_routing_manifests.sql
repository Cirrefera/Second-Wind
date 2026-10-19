-- Prepared routing metadata is version-bound. No inventory promotion or backfill.
CREATE TABLE IF NOT EXISTS product_routing_manifests (
 sku TEXT NOT NULL REFERENCES items(sku),
 version INTEGER NOT NULL CHECK(version > 0),
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 manifest_hash TEXT NOT NULL CHECK(length(manifest_hash)=64),
 reviewed_by TEXT NOT NULL CHECK(length(reviewed_by)>0),
 created_at TEXT NOT NULL,
 PRIMARY KEY(sku,version)
);
CREATE TRIGGER IF NOT EXISTS routing_manifest_no_update BEFORE UPDATE ON product_routing_manifests
BEGIN SELECT RAISE(ABORT,'routing_release_immutable'); END;
CREATE TRIGGER IF NOT EXISTS routing_manifest_no_delete BEFORE DELETE ON product_routing_manifests
BEGIN SELECT RAISE(ABORT,'routing_release_immutable'); END;
