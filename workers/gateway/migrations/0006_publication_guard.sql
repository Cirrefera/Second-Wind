-- Operator-controlled approvals. No application endpoint creates these rows.
-- Existing live releases remain usable. New publications and changed live
-- contracts require an exact reviewed release; this migration approves nothing.
CREATE TABLE IF NOT EXISTS release_approvals (
 sku TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 manifest_hash TEXT NOT NULL CHECK(length(manifest_hash)=64),
 routing_hash TEXT NOT NULL CHECK(length(routing_hash)=64),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 catalog_json TEXT NOT NULL CHECK(json_valid(catalog_json)),
 validation_report_hash TEXT NOT NULL CHECK(length(validation_report_hash)=64),
 evidence_ref TEXT NOT NULL CHECK(length(evidence_ref)>0),
 source_commit TEXT NOT NULL CHECK(length(source_commit)=40),
 reviewed_by TEXT NOT NULL CHECK(length(reviewed_by)>0),
 reviewed_at TEXT NOT NULL CHECK(length(reviewed_at)>0),
 PRIMARY KEY(sku,version),
 FOREIGN KEY(sku,version) REFERENCES component_releases(sku,version),
 FOREIGN KEY(sku,version) REFERENCES product_routing_manifests(sku,version)
);
CREATE TRIGGER IF NOT EXISTS release_approval_no_update BEFORE UPDATE ON release_approvals
BEGIN SELECT RAISE(ABORT,'release_approval_immutable'); END;
CREATE TRIGGER IF NOT EXISTS release_approval_no_delete BEFORE DELETE ON release_approvals
BEGIN SELECT RAISE(ABORT,'release_approval_immutable'); END;
CREATE TRIGGER IF NOT EXISTS release_approval_requires_stored_release BEFORE INSERT ON release_approvals
WHEN NOT EXISTS (
 SELECT 1 FROM component_releases r
 JOIN product_routing_manifests m ON m.sku=r.sku AND m.version=r.version
 JOIN payload_objects p ON p.sku=r.sku AND p.version=r.version
 WHERE r.sku=NEW.sku AND r.version=NEW.version
 AND r.manifest_hash=NEW.manifest_hash AND m.manifest_hash=NEW.routing_hash
 AND p.content_hash=NEW.payload_hash
 AND json_extract(r.manifest_json,'$.storage.content_hash')=p.content_hash
 AND json_extract(r.manifest_json,'$.storage.r2_key')=p.r2_key
 AND json_extract(r.manifest_json,'$.storage.r2_bucket')=p.r2_bucket
 AND json_extract(r.manifest_json,'$.storage.size_bytes')=p.size_bytes
 AND CAST(json_extract(r.manifest_json,'$.pricing.max_amount_atomic') AS INTEGER)
     = CAST(round(json_extract(NEW.catalog_json,'$.price_usd')*1000000) AS INTEGER)
)
BEGIN SELECT RAISE(ABORT,'reviewed_stored_release_required'); END;
CREATE TRIGGER IF NOT EXISTS publication_requires_staged_product BEFORE INSERT ON items
WHEN NEW.status='live'
BEGIN SELECT RAISE(ABORT,'publication_requires_staged_product'); END;
CREATE TRIGGER IF NOT EXISTS publication_requires_approval BEFORE UPDATE ON items
WHEN NEW.status='live' AND (OLD.status!='live' OR NEW.version IS NOT OLD.version OR NEW.sku IS NOT OLD.sku
    OR NEW.slug IS NOT OLD.slug
    OR NEW.name IS NOT OLD.name
    OR NEW.kind IS NOT OLD.kind
    OR NEW.service IS NOT OLD.service
    OR NEW.summary IS NOT OLD.summary
    OR NEW.guidance IS NOT OLD.guidance
    OR NEW.price_usd IS NOT OLD.price_usd
    OR NEW.invoke_kind IS NOT OLD.invoke_kind
    OR NEW.invoke_key IS NOT OLD.invoke_key
    OR NEW.input_schema IS NOT OLD.input_schema
    OR NEW.input_example IS NOT OLD.input_example
    OR NEW.mime_type IS NOT OLD.mime_type
    OR NEW.source_repo IS NOT OLD.source_repo
    OR NEW.source_path IS NOT OLD.source_path
    OR NEW.source_url IS NOT OLD.source_url
    OR NEW.license_spdx IS NOT OLD.license_spdx
    OR NEW.provenance IS NOT OLD.provenance
    OR NEW.content_hash IS NOT OLD.content_hash)
 AND NOT EXISTS (
  SELECT 1 FROM release_approvals a
  WHERE a.sku=NEW.sku AND a.version=NEW.version
      AND json_extract(a.catalog_json,'$.slug') IS NEW.slug
      AND json_extract(a.catalog_json,'$.name') IS NEW.name
      AND json_extract(a.catalog_json,'$.kind') IS NEW.kind
      AND json_extract(a.catalog_json,'$.service') IS NEW.service
      AND json_extract(a.catalog_json,'$.summary') IS NEW.summary
      AND json_extract(a.catalog_json,'$.guidance') IS NEW.guidance
      AND json_extract(a.catalog_json,'$.price_usd') IS NEW.price_usd
      AND json_extract(a.catalog_json,'$.invoke_kind') IS NEW.invoke_kind
      AND json_extract(a.catalog_json,'$.invoke_key') IS NEW.invoke_key
      AND json_extract(a.catalog_json,'$.input_schema') IS NEW.input_schema
      AND json_extract(a.catalog_json,'$.input_example') IS NEW.input_example
      AND json_extract(a.catalog_json,'$.mime_type') IS NEW.mime_type
      AND json_extract(a.catalog_json,'$.source_repo') IS NEW.source_repo
      AND json_extract(a.catalog_json,'$.source_path') IS NEW.source_path
      AND json_extract(a.catalog_json,'$.source_url') IS NEW.source_url
      AND json_extract(a.catalog_json,'$.license_spdx') IS NEW.license_spdx
      AND json_extract(a.catalog_json,'$.provenance') IS NEW.provenance
      AND json_extract(a.catalog_json,'$.content_hash') IS NEW.content_hash
 )
BEGIN SELECT RAISE(ABORT,'publication_review_required'); END;
CREATE TRIGGER IF NOT EXISTS approved_payload_no_update BEFORE UPDATE ON payload_objects
WHEN EXISTS (SELECT 1 FROM release_approvals a WHERE a.sku=OLD.sku AND a.version=OLD.version)
BEGIN SELECT RAISE(ABORT,'approved_payload_immutable'); END;
CREATE TRIGGER IF NOT EXISTS reviewed_release_published AFTER UPDATE OF status,version ON items
WHEN NEW.status='live' AND (OLD.status!='live' OR NEW.version IS NOT OLD.version)
BEGIN
 INSERT OR IGNORE INTO business_event_outbox(event_id,event_type,occurred_ts,payload)
 SELECT 'release.published:'||NEW.sku||':'||NEW.version,'release.published',
 strftime('%Y-%m-%dT%H:%M:%fZ','now'),json_object(
 'sku',NEW.sku,'product_version_ref',NEW.version,'release_hash',a.manifest_hash,
 'artifact_hash',a.payload_hash,'exact_amount_atomic',CAST(CAST(round(NEW.price_usd*1000000) AS INTEGER) AS TEXT))
 FROM release_approvals a WHERE a.sku=NEW.sku AND a.version=NEW.version;
END;
CREATE TRIGGER IF NOT EXISTS approved_payload_no_delete BEFORE DELETE ON payload_objects
WHEN EXISTS (SELECT 1 FROM release_approvals a WHERE a.sku=OLD.sku AND a.version=OLD.version)
BEGIN SELECT RAISE(ABORT,'approved_payload_immutable'); END;
