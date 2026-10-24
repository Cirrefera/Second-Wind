import { Validator } from "@cfworker/json-schema";

const CATALOG_COLUMNS = `i.sku, i.slug, i.name, i.kind, i.service, i.summary, i.price_usd,
  i.invoke_kind, i.input_schema, i.input_example, i.mime_type, i.source_repo,
  i.source_path, i.source_url, i.license_spdx, i.provenance, i.version, i.updated_at,
  i.guidance AS _guidance, po.id AS _payload_id, po.content_hash AS _payload_hash,
  po.mime_type AS _payload_mime, po.size_bytes AS _payload_size,
  EXISTS(SELECT 1 FROM component_releases cr WHERE cr.sku=i.sku AND cr.version=i.version
    AND json_type(cr.manifest_json,'$.components')='array'
    AND json_array_length(cr.manifest_json,'$.components')>0) AS _component_pricing,
  (SELECT cr.manifest_json FROM component_releases cr WHERE cr.sku=i.sku AND cr.version=i.version) AS _release_manifest`;
const CATALOG_SOURCE = `FROM items i LEFT JOIN payload_objects po
  ON po.sku = i.sku AND po.version = i.version`;
const validators = new Map();

function requestError(code, details) {
  return Object.assign(new Error(code), { code, status: 400, details });
}

function productKey(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw requestError("invalid_product_key");
  }
  return value.trim();
}

async function publicProduct(row) {
  if (!row) return null;
  const amount = Math.round(Number(row.price_usd) * 1_000_000);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000) {
    throw Object.assign(new Error("invalid_catalog_price"), { status: 503 });
  }
  const { _guidance, _payload_id, _payload_hash, _payload_mime, _payload_size, _component_pricing, _release_manifest, ...product } = row;
  product.price_role='maximum';
  product.max_amount_atomic=String(amount);
  product.pricing_mode='whole-product';
  product.pricing_status='configured';
  let release;
  if (_release_manifest) {
    try { release=JSON.parse(_release_manifest); }
    catch { throw Object.assign(new Error('invalid_release_manifest'),{status:503}); }
    if (release.language_policy) product.language_policy=release.language_policy;
  }
  if (_component_pricing) {
    product.price_role='maximum';
    product.pricing_mode='proportional-components';
    product.components_url=`/api/products/${encodeURIComponent(product.sku)}/components`;
    product.trial_url='/api/trials';
    product.pricing_status=release?.pricing ? 'configured' : 'not_configured';
    if (!release?.pricing) { product.price_role='historical-unconfirmed'; delete product.max_amount_atomic; }
  }
  if (_payload_id) {
    if (typeof _payload_hash !== "string" || !/^[a-f0-9]{64}$/i.test(_payload_hash)) {
      throw Object.assign(new Error("invalid_catalog_payload_hash"), { status: 503 });
    }
    return {
      ...product, price_usdc_micros: String(amount),
      content_hash: _payload_hash.toLowerCase(), content_hash_scope: "artifact-bytes",
      mime_type: _payload_mime || product.mime_type || "application/octet-stream",
      size_bytes: _payload_size,
    };
  }
  const bytes = new TextEncoder().encode(_guidance || "");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const contentHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return {
    ...product, price_usdc_micros: String(amount), content_hash: contentHash,
    content_hash_scope: "guidance-utf8", size_bytes: bytes.byteLength,
    mime_type: product.mime_type || "text/markdown",
  };
}

/** One public projection for HTTP, Cap'n Web, and sandbox discovery. */
export async function describeProduct(db, sku) {
  const row = await db.prepare(
    `SELECT ${CATALOG_COLUMNS} ${CATALOG_SOURCE}
     WHERE (i.sku = ?1 OR i.slug = ?1) AND i.status = 'live'`,
  ).bind(productKey(sku)).first();
  if (!row) throw Object.assign(new Error("unknown_product"), { status: 404 });
  return publicProduct(row);
}

export async function listCatalog(db) {
  const rows = await db.prepare(
    `SELECT ${CATALOG_COLUMNS} ${CATALOG_SOURCE}
     WHERE i.status = 'live' ORDER BY i.kind, i.service, i.sku`,
  ).all();
  return Promise.all((rows.results || []).map(publicProduct));
}

/** Search only public live metadata. User wildcard characters are literal. */
export async function searchCatalog(db, query = "", limit = 10) {
  if (typeof query !== "string" || query.length > 200) {
    throw requestError("invalid_search_query");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw requestError("invalid_search_limit");
  }
  const escaped = query.trim().replace(/[\\%_]/g, "\\$&");
  const rows = await db.prepare(
    `SELECT ${CATALOG_COLUMNS} ${CATALOG_SOURCE}
     WHERE i.status = 'live'
       AND (i.name LIKE ?1 ESCAPE '\\' OR i.summary LIKE ?1 ESCAPE '\\'
         OR i.slug LIKE ?1 ESCAPE '\\' OR i.service LIKE ?1 ESCAPE '\\' OR i.sku LIKE ?1 ESCAPE '\\')
     ORDER BY i.kind, i.service, i.sku LIMIT ?2`,
  ).bind(`%${escaped}%`, limit).all();
  return Promise.all((rows.results || []).map(publicProduct));
}

function copyConfiguration(config) {
  const source = config === undefined ? {} : config;
  if (!source || Array.isArray(source) || typeof source !== "object") {
    throw requestError("invalid_configuration", "Configuration must be an object.");
  }
  let nodes = 0;
  const seen = new Set();
  function visit(value, depth) {
    if (++nodes > 5000 || depth > 16) throw requestError("configuration_too_large");
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || seen.has(value)) {
      throw requestError("invalid_configuration", "Configuration must contain JSON values.");
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      throw requestError("invalid_configuration", "Configuration must contain JSON objects.");
    }
    seen.add(value);
    for (const entry of Object.values(value)) visit(entry, depth + 1);
    seen.delete(value);
  }
  visit(source, 0);
  const encoded = JSON.stringify(source);
  if (new TextEncoder().encode(encoded).byteLength > 32768) {
    throw requestError("configuration_too_large");
  }
  return JSON.parse(encoded);
}

function schemaValidator(raw) {
  if (validators.has(raw)) return validators.get(raw);
  const schema = JSON.parse(raw);
  if (typeof schema !== "boolean" && (!schema || Array.isArray(schema) || typeof schema !== "object")) {
    throw new Error("invalid_schema");
  }
  const schemaUri = typeof schema === "object" && schema ? schema.$schema || "" : "";
  const draft = /2020-12/.test(schemaUri) ? "2020-12"
    : /2019-09/.test(schemaUri) ? "2019-09"
    : /draft-04/.test(schemaUri) ? "4" : "7";
  if (schemaUri && !/json-schema\.org\/(draft-04|draft-07|draft\/2019-09|draft\/2020-12)\/schema#?$/.test(schemaUri)) {
    throw new Error("unsupported_schema_draft");
  }
  // This interpreter works in Workers without eval/new Function or extra bindings.
  const validator = new Validator(schema, draft, false);
  // Catalog edits must not leave an unbounded collection in an isolate.
  if (validators.size >= 128) validators.delete(validators.keys().next().value);
  validators.set(raw, validator);
  return validator;
}

/** Validate the product's declared input, without inventing language variants. */
export async function checkConfiguration(db, sku, config) {
  const product = await describeProduct(db, sku);
  let cfg;
  try {
    cfg = copyConfiguration(config);
  } catch (error) {
    return {
      ok: false, sku: product.sku, version: product.version, missing: [],
      errors: [{ code: error.code || "invalid_configuration", message: error.details || error.message }],
    };
  }

  if (Object.hasOwn(cfg, "language") &&
      (typeof cfg.language !== "string" || !cfg.language.trim() || cfg.language.length > 64)) {
    return {
      ok: false, sku: product.sku, version: product.version, missing: [],
      errors: [{ code: "invalid_language", message: "Choose an explicit supported language." }],
    };
  }

  let errors = [];
  if (product.language_policy?.mode === 'configured') {
    const adapters=product.language_policy.adapters;
    if (!Object.hasOwn(cfg,'language')) errors.push({code:'required',field:'language',message:'Choose the delivery language explicitly.'});
    else if (!Array.isArray(adapters) || !adapters.includes(cfg.language)) errors.push({code:'unsupported_delivery_language',field:'language',message:'The requested delivery language has no verified adapter for this release.'});
  }
  if (product.input_schema) {
    try {
      const result = schemaValidator(product.input_schema).validate(cfg);
      if (!result.valid) {
        errors.push(...(result.errors || []).slice(0, 30).map(error => ({
          code: error.keyword,
          field: error.keyword === "required"
            ? error.error.match(/required property "(.+)"\./)?.[1] || error.instanceLocation
            : error.instanceLocation,
          message: error.error,
        })));
      }
    } catch {
      // Invalid or unsupported schemas are catalog defects, never a bypass.
      errors.push({ code: "catalog_schema_invalid", message: "This product's input contract cannot be validated." });
    }
  }
  const missing = errors.filter((error,index)=>error.code === 'required' && errors.findIndex(other=>other.code==='required'&&other.field===error.field)===index).map(error => ({
    field: error.field,
    question: error.field === "language" ? "What programming language do you want the product delivered in?"
      : `Missing required field: ${error.field}`,
  }));
  return {
    ok: errors.length === 0, sku: product.sku, version: product.version,
    config: cfg, missing, errors,
  };
}
