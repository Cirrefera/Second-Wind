import { createHash } from "node:crypto";

export const RECIPIENT = `0x${"1".repeat(40)}`;
export const PAYER = `0x${"2".repeat(40)}`;
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913";
export const NETWORK = "eip155:8453";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Shape-compatible R2 fixture; each read owns a fresh byte stream. */
export class MemoryR2 {
  constructor() {
    this.objects = new Map();
    this.reads = [];
    this.writes = [];
    this.failedReads = new Set();
    this.failedWrites = new Set();
  }

  async put(key, value, options = {}) {
    this.writes.push(key);
    if (this.failedWrites.has(key)) throw new Error("fixture_r2_write_failed");
    const bytes = typeof value === "string"
      ? new TextEncoder().encode(value)
      : value instanceof Uint8Array
        ? value.slice()
        : new Uint8Array(await new Response(value).arrayBuffer());
    const object = {
      key,
      bytes,
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {},
    };
    this.objects.set(key, object);
    return { key, size: bytes.byteLength, etag: sha256(bytes) };
  }

  async get(key) {
    this.reads.push(key);
    if (this.failedReads.has(key)) throw new Error("fixture_r2_read_failed");
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = stored.bytes.slice();
    return {
      key,
      size: bytes.byteLength,
      etag: sha256(bytes),
      httpMetadata: { ...stored.httpMetadata },
      customMetadata: { ...stored.customMetadata },
      body: new Response(bytes).body,
      async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      async text() { return new TextDecoder().decode(bytes); },
      async json() { return JSON.parse(new TextDecoder().decode(bytes)); },
      writeHttpMetadata(headers) {
        if (stored.httpMetadata.contentType) headers.set("Content-Type", stored.httpMetadata.contentType);
      },
    };
  }

  async head(key) {
    const object = await this.get(key);
    if (!object) return null;
    const { body, arrayBuffer, text, json, ...metadata } = object;
    return metadata;
  }

  async delete(key) {
    for (const item of Array.isArray(key) ? key : [key]) this.objects.delete(item);
  }
}

/** Synthetic rail: explicitly no signing, wallet keys, chain, or network. */
export function createRail(overrides = {}) {
  const calls = { verify: [], settle: [] };
  const rail = {
    async verifyPayment(payload, requirements) {
      calls.verify.push({ payload, requirements });
      if (overrides.verifyPayment) return overrides.verifyPayment(payload, requirements);
      return { isValid: true, payer: PAYER };
    },
    async settlePayment(payload, requirements) {
      calls.settle.push({ payload, requirements });
      if (overrides.settlePayment) return overrides.settlePayment(payload, requirements);
      return {
        success: true,
        transaction: `0x${String(calls.settle.length).padStart(64, "0")}`,
        network: NETWORK,
        payer: PAYER,
      };
    },
  };
  return { rail, calls };
}

export function makePayment(quote, sequence = 1) {
  const amount = String(quote.amount_usdc_micros ?? quote.price_usdc_micros
    ?? Math.round(Number(quote.price_usd) * 1_000_000));
  const accepted = {
    scheme: "exact",
    network: NETWORK,
    asset: USDC,
    payTo: RECIPIENT,
    amount,
    maxTimeoutSeconds: 300,
    ...(quote.accepts?.[0] || quote.paymentRequirements || {}),
  };
  const nonce = `0x${sequence.toString(16).padStart(64, "0")}`;
  return {
    x402Version: 2,
    accepted,
    resource: {
      url: `https://secondwindai.com/api/x402/${quote.sku}?quote_id=${quote.quoteId}`,
      description: "Offline commerce regression test",
      mimeType: "application/json",
    },
    payload: {
      // The synthetic rail is the only authority accepting this fake signature.
      signature: `0x${"3".repeat(64)}${sequence.toString(16).padStart(64, "0")}1b`,
      authorization: {
        from: PAYER,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1_000) + 300),
        nonce,
      },
    },
  };
}

export function fixtureEnv(db) {
  return {
    SW_DB: db,
    X402_PAY_TO: RECIPIENT,
    PAYLOADS: new MemoryR2(),
    DELIVERIES: new MemoryR2(),
  };
}
