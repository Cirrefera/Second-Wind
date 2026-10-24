import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

/**
 * A D1 adapter backed by SQLite, including its UNIQUE/FK constraints and atomic
 * batches. SQL is executed by SQLite rather than matched against canned rows.
 * Numbered D1 placeholders are rewritten because node:sqlite treats ?1 as a
 * named binding, while D1's bind() receives positional arguments.
 */
export class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    this.statements = [];
  }

  prepare(sql) {
    const indexes = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]) - 1);
    const statement = this.sqlite.prepare(sql.replace(/\?\d+/g, "?"));
    const bound = (args) => {
      const values = indexes.length ? indexes.map((index) => args[index]) : args;
      const execute = (method) => {
        this.statements.push({ sql, method });
        const before = Number(this.sqlite.prepare("SELECT total_changes() AS n").get().n);
        if (method === "run") {
          const result = statement.run(...values);
          return {
            success: true,
            results: [],
            meta: {
              // D1 counts trigger writes too, unlike sqlite3_changes().
              changes: Number(this.sqlite.prepare("SELECT total_changes() AS n").get().n) - before,
              last_row_id: Number(result.lastInsertRowid),
              rows_written: Number(result.changes),
            },
          };
        }
        const results = statement.all(...values);
        const changes = Number(this.sqlite.prepare("SELECT total_changes() AS n").get().n) - before;
        return {
          success: true,
          results,
          meta: {
            changes,
            rows_read: results.length,
            rows_written: changes,
            last_row_id: Number(this.sqlite.prepare("SELECT last_insert_rowid() AS n").get().n),
          },
        };
      };
      return {
        bind: (...nextArgs) => bound(nextArgs),
        _execute: execute,
        async run() { return execute("run"); },
        async all() { return execute("all"); },
        async raw() {
          return execute("all").results.map((row) => Object.values(row));
        },
        async first(column) {
          const row = execute("all").results[0] ?? null;
          return column && row ? row[column] : row;
        },
      };
    };
    return bound([]);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      // all() also executes INSERT/UPDATE ... RETURNING, as D1 batch() does.
      const result = statements.map((statement) => statement._execute("all"));
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  close() { this.sqlite.close(); }
}

/** Current production schema before the additive commerce repair. */
const LEGACY_SCHEMA = `
CREATE TABLE items (
  sku TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('tool','workflow','guide','artifact','agent')),
  service TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL,
  guidance TEXT NOT NULL DEFAULT '',
  price_usd REAL NOT NULL CHECK(price_usd > 0 AND price_usd <= 10),
  invoke_kind TEXT NOT NULL DEFAULT 'resolve' CHECK(invoke_kind IN ('resolve','bedrock','r2')),
  invoke_key TEXT NOT NULL DEFAULT '', input_schema TEXT NOT NULL DEFAULT '',
  input_example TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT '',
  source_repo TEXT NOT NULL DEFAULT '', source_path TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '', license_spdx TEXT NOT NULL DEFAULT '',
  provenance TEXT NOT NULL DEFAULT '', content_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','live','retired')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE payments (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL, price_usd REAL NOT NULL,
  amount_usdc_micros TEXT NOT NULL, payer TEXT NOT NULL DEFAULT '',
  tx_hash TEXT NOT NULL DEFAULT '', network TEXT NOT NULL DEFAULT 'eip155:8453',
  scheme TEXT NOT NULL DEFAULT 'ExactEvmScheme',
  idempotency_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('verified','settled','failed','refund-eligible')),
  facilitator_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  settled_at TEXT
);
CREATE UNIQUE INDEX idx_payments_idem ON payments(idempotency_key);
CREATE INDEX idx_payments_tx ON payments(tx_hash);
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id),
  sku TEXT NOT NULL, content_hash TEXT NOT NULL,
  delivered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE payload_objects (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL REFERENCES items(sku),
  r2_bucket TEXT NOT NULL, r2_key TEXT NOT NULL, content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(sku, version)
);
CREATE TABLE delivery_grants (
  id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id),
  payload_id TEXT NOT NULL REFERENCES payload_objects(id),
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(payment_id, payload_id)
);
CREATE TABLE edges (
  from_sku TEXT NOT NULL, to_sku TEXT NOT NULL, relation TEXT NOT NULL,
  position INTEGER, note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(from_sku,to_sku,relation)
);
`;

export function createFixtureDb({ migrate = true } = {}) {
  const db = new SqliteD1();
  db.sqlite.exec(LEGACY_SCHEMA);
  if (migrate) {
    db.sqlite.exec(readFileSync(new URL("../../migrations/0001_commerce_repair.sql", import.meta.url), "utf8"));
    db.sqlite.exec(readFileSync(new URL("../../migrations/0002_business_outbox.sql", import.meta.url), "utf8"));
    db.sqlite.exec(readFileSync(new URL("../../migrations/0003_component_trials.sql", import.meta.url), "utf8"));
    db.sqlite.exec(readFileSync(new URL("../../migrations/0004_routing_manifests.sql", import.meta.url), "utf8"));
    db.sqlite.exec(readFileSync(new URL("../../migrations/0005_trial_recovery.sql", import.meta.url), "utf8"));
  }
  return db;
}

export function insertItem(db, overrides = {}) {
  const item = {
    sku: "SW-PT-0006",
    slug: "recovery-guide",
    name: "Recover an interrupted delivery",
    kind: "guide",
    service: "s3",
    summary: "A deterministic guide with an immutable purchase snapshot.",
    guidance: "Paid version one: keep the purchase receipt and verify the delivered bytes.\n",
    price_usd: 0.25,
    invoke_kind: "resolve",
    mime_type: "text/markdown",
    license_spdx: "Apache-2.0",
    source_repo: "Cirrefera/Second-Wind",
    source_path: "fixtures/guide.md",
    source_url: "https://github.com/Cirrefera/Second-Wind",
    provenance: "offline test fixture",
    status: "live",
    version: 1,
    ...overrides,
  };
  const fields = Object.keys(item);
  db.sqlite.prepare(`INSERT INTO items (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`)
    .run(...Object.values(item));
  return item;
}

export function rowCount(db, table) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("invalid test table name");
  return Number(db.sqlite.prepare(`SELECT count(*) AS total FROM ${table}`).get().total);
}
