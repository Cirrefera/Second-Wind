#!/usr/bin/env node
/**
 * Pages ingress tests. Commerce is tested in workers/gateway; this file proves
 * the actual advanced-mode entry point preserves requests and responses across
 * the binding, including the WebSocket property used by Cap'n Web.
 * No network requests or payments are made.
 */
import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";
import { onRequest as rpcAdapter } from "../functions/rpc.js";
import { onRequest as capnpAdapter } from "../functions/capnp.js";

const dynamicPaths = [
  "/api/tools",
  "/api/proof",
  "/api/catalog",
  "/api/x402/SW-PT-0006",
  "/api/x402/a-tool/artifact",
  "/api/unknown",
  "/openapi.json",
  "/.well-known/x402",
  "/llms.txt",
  "/v2/x402/discovery/resources",
  "/discovery/resources",
  "/rpc",
  "/capnp",
  "/health",
];

function environment(expectedRequest, expectedResponse) {
  return {
    GATEWAY: {
      async fetch(request) {
        assert.strictEqual(request, expectedRequest);
        return expectedResponse;
      },
    },
    ASSETS: {
      async fetch() {
        assert.fail("An application request reached static assets");
      },
    },
  };
}

for (const path of dynamicPaths) {
  test(`application route forwards unchanged: ${path}`, async () => {
    const request = new Request(`https://secondwindai.com${path}?q=lambda`);
    const response = Response.json({ from: "gateway" });
    assert.strictEqual(await worker.fetch(request, environment(request, response)), response);
  });
}

test("paid POST preserves request body, method and payment headers", async () => {
  const body = JSON.stringify({ quoteId: "quote_fixture" });
  const request = new Request("https://secondwindai.com/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": "fixture-only" },
    body,
  });
  const response = new Response(null, { status: 402, headers: { "PAYMENT-REQUIRED": "fixture-challenge" } });
  assert.strictEqual(await worker.fetch(request, environment(request, response)), response);
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("PAYMENT-SIGNATURE"), "fixture-only");
  assert.equal(await request.text(), body);
  assert.equal(response.headers.get("PAYMENT-REQUIRED"), "fixture-challenge");
});

test("Cap'n Web upgrade Response is not reconstructed", async () => {
  const request = new Request("https://secondwindai.com/capnp", {
    headers: { Upgrade: "websocket" },
  });
  // Node cannot construct Cloudflare's status-101 Response. A sentinel checks
  // object identity and catches wrapping that would discard response.webSocket.
  const response = { status: 101, webSocket: { fixture: true } };
  const result = await worker.fetch(request, environment(request, response));
  assert.strictEqual(result, response);
  assert.strictEqual(result.webSocket, response.webSocket);
});

test("HEAD and OPTIONS reach the gateway without method conversion", async () => {
  for (const method of ["HEAD", "OPTIONS"]) {
    const request = new Request("https://secondwindai.com/api/proof", { method });
    const response = new Response(null, { status: 204 });
    assert.strictEqual(await worker.fetch(request, environment(request, response)), response);
    assert.equal(request.method, method);
  }
});

test("static asset requests stay on Pages", async () => {
  for (const path of ["/", "/favicon.ico", "/site.webmanifest", "/rpc-extra", "/capnp-extra"]) {
    const request = new Request(`https://secondwindai.com${path}`);
    const response = new Response("asset");
    const env = {
      GATEWAY: { fetch() { assert.fail("A static request reached the gateway"); } },
      ASSETS: { async fetch(received) { assert.strictEqual(received, request); return response; } },
    };
    assert.strictEqual(await worker.fetch(request, env), response);
  }
});

test("missing gateway binding fails closed without a static fallback", async () => {
  const response = await worker.fetch(new Request("https://secondwindai.com/rpc"), {
    ASSETS: { fetch() { assert.fail("Missing gateway must not serve static content"); } },
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).error, "gateway_not_configured");
});

test("binding failures are not retried through a public Worker URL", async () => {
  const failure = new Error("binding unavailable");
  await assert.rejects(
    worker.fetch(new Request("https://secondwindai.com/rpc"), {
      GATEWAY: { fetch() { throw failure; } },
      ASSETS: { fetch() { assert.fail("Binding failure must not reach assets"); } },
    }),
    failure,
  );
});

test("file-routed compatibility adapters use the same facade", async () => {
  for (const [adapter, path] of [[rpcAdapter, "/rpc"], [capnpAdapter, "/capnp"]]) {
    const request = new Request(`https://secondwindai.com${path}`, { method: "POST", body: "[]" });
    const response = new Response("gateway");
    assert.strictEqual(await adapter({ request, env: environment(request, response) }), response);
  }
});
