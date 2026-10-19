import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFixtureDb, insertItem } from "./helpers/d1.mjs";

test("the additive production migration preserves legacy sales and can be rerun", (t) => {
  const db = createFixtureDb({ migrate: false });
  t.after(() => db.close());
  const item = insertItem(db);
  db.sqlite.prepare(`INSERT INTO payments
    (id,sku,price_usd,amount_usdc_micros,payer,tx_hash,idempotency_key,status)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    "pay_legacy", item.sku, 0.25, "250000", `0x${"2".repeat(40)}`,
    `0x${"a".repeat(64)}`, "legacy-on-chain-reference", "settled",
  );
  db.sqlite.prepare("INSERT INTO deliveries (id,payment_id,sku,content_hash) VALUES (?,?,?,?)")
    .run("del_legacy", "pay_legacy", item.sku, "b".repeat(64));
  const before = {
    item: db.sqlite.prepare("SELECT * FROM items").get(),
    payment: db.sqlite.prepare("SELECT * FROM payments").get(),
    delivery: db.sqlite.prepare("SELECT * FROM deliveries").get(),
  };
  const migration = readFileSync(new URL("../migrations/0001_commerce_repair.sql", import.meta.url), "utf8");
  db.sqlite.exec(migration);
  db.sqlite.exec(migration);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM items").get(), before.item);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM payments").get(), before.payment);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM deliveries").get(), before.delivery);
  assert.ok(db.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='commerce_purchases'").get());
  assert.ok(db.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='commerce_quotes'").get());
  assert.deepEqual(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});
