import test from "node:test";
import assert from "node:assert/strict";
import { describeProduct, searchCatalog, checkConfiguration } from "../src/catalog.js";
import { createQuote } from "../src/commerce.js";
import { createFixtureDb, insertItem } from "./helpers/d1.mjs";
import { fixtureEnv, sha256 } from "./helpers/fixtures.mjs";
import {canonicalJson} from '../src/contracts.js';

function fixture(t, overrides) {
  const db = createFixtureDb();
  t.after(() => db.close());
  return { db, item: insertItem(db, overrides), env: fixtureEnv(db) };
}

test("public hashes commit to the exact delivered bytes without exposing paid guidance", async (t) => {
  const { db, item, env } = fixture(t, {
    guidance: "PRIVATE GUIDANCE: caf\u00e9 \u2601\ufe0f\n",
    content_hash: "a stale legacy hash",
  });
  const product = await describeProduct(db, item.sku);
  assert.equal(product.content_hash, sha256(item.guidance));
  assert.equal(product.content_hash_scope, "guidance-utf8");
  assert.equal(Object.hasOwn(product, "guidance"), false);
  assert.doesNotMatch(JSON.stringify(product), /PRIVATE GUIDANCE|a stale legacy hash/);
  const quote = await createQuote(env, item.sku, {});
  assert.equal(quote.content_hash, product.content_hash);
  assert.doesNotMatch(JSON.stringify(quote), /PRIVATE GUIDANCE/);
});

test("discovery uses the item's exact payload version, without selecting a later version", async (t) => {
  const { db, item } = fixture(t, { version: 1 });
  const insert = db.sqlite.prepare(`INSERT INTO payload_objects
    (id,sku,r2_bucket,r2_key,content_hash,size_bytes,mime_type,version)
    VALUES (?,?,?,?,?,?,?,?)`);
  insert.run("po_one", item.sku, "secondwind-payloads", "payloads/v1.bin", "1".repeat(64), 10, "application/octet-stream", 1);
  insert.run("po_two", item.sku, "secondwind-payloads", "payloads/v2.bin", "2".repeat(64), 20, "application/octet-stream", 2);
  const product = await describeProduct(db, item.sku);
  assert.equal(product.version, 1);
  assert.equal(product.content_hash, "1".repeat(64));
  assert.equal(product.content_hash_scope, "artifact-bytes");
});

test("declared input schemas enforce nested types, required fields, enums and extra-property rules", async (t) => {
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    required: ["language", "limits"],
    additionalProperties: false,
    properties: {
      language: { type: "string", enum: ["javascript"] },
      limits: {
        type: "object", required: ["attempts"], additionalProperties: false,
        properties: { attempts: { type: "integer", minimum: 1, maximum: 5 } },
      },
    },
  };
  const { db, item } = fixture(t, { kind: "tool", input_schema: JSON.stringify(schema) });
  const valid = { language: "javascript", limits: { attempts: 3 } };
  assert.equal((await checkConfiguration(db, item.sku, valid)).ok, true);
  for (const config of [
    {},
    { language: "python", limits: { attempts: 3 } },
    { language: "javascript", limits: {} },
    { language: "javascript", limits: { attempts: "3" } },
    { language: "javascript", limits: { attempts: 0 } },
    { language: "javascript", limits: { attempts: 3, unrecognized: true } },
    { ...valid, unrecognized: true },
  ]) {
    assert.equal((await checkConfiguration(db, item.sku, config)).ok, false, JSON.stringify(config));
  }
});

test("a malformed catalog schema fails closed while existing language-neutral guidance remains purchasable", async (t) => {
  const { db, item, env } = fixture(t, { kind: "tool" });
  assert.equal((await checkConfiguration(db, item.sku, {})).ok, true);
  assert.ok((await createQuote(env, item.sku, {})).acceptanceId);
  db.sqlite.prepare("UPDATE items SET input_schema=? WHERE sku=?").run("{broken json", item.sku);
  assert.equal((await checkConfiguration(db, item.sku, {})).ok, false);
  await assert.rejects(createQuote(env, item.sku, {}));
});

test("catalog search treats wildcards literally and never returns draft or retired rows", async (t) => {
  const { db } = fixture(t);
  insertItem(db, { sku: "SW-PERCENT", slug: "literal-percent", name: "Measure 95% coverage" });
  insertItem(db, { sku: "SW-DRAFT", slug: "draft-guide", status: "draft", name: "Draft 95% coverage" });
  insertItem(db, { sku: "SW-RETIRED", slug: "retired-guide", status: "retired", name: "Retired 95% coverage" });
  assert.deepEqual((await searchCatalog(db, "%", 10)).map((item) => item.sku), ["SW-PERCENT"]);
  assert.deepEqual(await searchCatalog(db, "_", 10), []);
  assert.deepEqual(await searchCatalog(db, "' OR 1=1 --", 10), []);
  const all = await searchCatalog(db, "", 50);
  assert.equal(all.length, 2);
  assert.ok(all.every((item) => !Object.hasOwn(item, "guidance")));
});

test('slug search finds a product without requiring its display name', async t => {
 const {db,item}=fixture(t,{slug:'unique-slug-search-marker'});
 assert.deepEqual((await searchCatalog(db,'unique-slug-search-marker')).map(x=>x.sku),[item.sku]);
});

test('release language adapters require an explicit supported choice and never loosen the input schema',async t=>{
 const {db,item,env}=fixture(t,{input_schema:JSON.stringify({type:'object',required:['table_name'],properties:{table_name:{type:'string'},language:{enum:['javascript','python']}}})});
 const release={language_policy:{mode:'configured',explicit_selection:true,adapters:['javascript']}};
 db.sqlite.prepare('INSERT INTO component_releases VALUES (?,?,?,?)').run(item.sku,item.version,canonicalJson(release),sha256(canonicalJson(release)));
 const absent=await checkConfiguration(db,item.sku,{table_name:'example'});
 assert.equal(absent.ok,false);assert.deepEqual(absent.missing,[{field:'language',question:'What programming language do you want the product delivered in?'}]);
 assert.equal((await checkConfiguration(db,item.sku,{table_name:'example',language:'python'})).errors[0].code,'unsupported_delivery_language');
 assert.equal((await checkConfiguration(db,item.sku,{language:'javascript'})).ok,false);
 const config={table_name:'example',language:'javascript'};
 assert.equal((await checkConfiguration(db,item.sku,config)).ok,true);
 // A non-component release still uses the original quote path.
 assert.deepEqual((await createQuote(env,item.sku,config)).config,config);
 assert.doesNotMatch(JSON.stringify(await describeProduct(db,item.sku)),/manifest_json|adapters_verified/);
});
