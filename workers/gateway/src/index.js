/**
 * Second Wind — Unified application worker (2026-10-18 consolidation).
 * ============================================================================
 * STATUS: Single application release. Replaces secondwind-gateway (HTTP/x402
 * proxy) + secondwind-codemode (sandbox backend) with one worker.
 *
 * HOW THE PRIMITIVES INTERACT
 * ---------------------------
 * Hono serves three surfaces from one Worker:
 *   GET  /health — free liveness (unmetered).
 *   POST /rpc    — x402-gated Code Mode execution. @x402/hono's
 *                  paymentMiddleware returns the 402 challenge on unsigned
 *                  requests; on PAYMENT-SIGNATURE it verifies via the CDP
 *                  facilitator, runs the handler, and settles after handler
 *                  success (settle-after-success: buyers never pay for
 *                  failures). The handler executes code IN-WORKER via
 *                  DynamicWorkerExecutor (worker_loaders binding) — no
 *                  service-binding hop, no second worker. The settled payment
 *                  is recorded in D1 (idempotent on idempotency_key).
 *   ALL  /capnp  — Cap'n Web via newWorkersRpcResponse. WebSocket upgrade →
 *                  bidirectional session (server can invoke client-provided
 *                  callbacks); plain POST → HTTP batch. Both serve the same
 *                  ProductService RpcTarget, whose methods delegate to the
 *                  shared product-service functions — the exact functions the
 *                  HTTP handlers call. One product contract, one purchase
 *                  state, every interface.
 *
 * WHY ONE WORKER (backed by hard constraints)
 * -------------------------------------------
 * 1. Founder directive (2026-10-18): consolidate gateway + Code Mode host,
 *    keep the ingress name to avoid routing changes.
 * 2. The CODEMODE service binding was a network hop with its own failure
 *    modes; in-worker execution removes it. (Constraint: fewer moving parts.)
 * 3. Cap'n Web's RpcTarget is an alias of Workers' native RpcTarget —
 *    product capabilities compose with the platform instead of beside it.
 *    (Constraint: docs-verbatim platform interop.)
 * 4. Durable purchase records (D1 `payments`) let recoverSession reissue a
 *    GrantCapability after disconnect without touching the facilitator —
 *    reissue can never charge again, by construction.
 *
 * WHAT STAYS ISOLATED
 * -------------------
 * Buyer code runs in fresh isolates spawned per execution via the
 * worker_loaders binding (DynamicWorkerExecutor). The worker itself never
 * executes buyer code in its own isolate. Zero Durable Objects.
 */

import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { newWorkersRpcResponse } from "capnweb";
import {
  ProductService,
  executeCode,
  recordRpcPayment,
} from "./product-service.js";

const X402_NETWORK = "eip155:8453"; // Base mainnet. Never Sepolia in production.
const USDC_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913"; // USDC on Base
const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
const RPC_PRICE = "$0.002"; // metered Code Mode execution, per call

const app = new Hono();

function payTo(env) {
  if (!env.X402_PAY_TO) throw new Error("X402_PAY_TO secret not configured");
  return env.X402_PAY_TO;
}

function cdpKey(env) {
  if (!env.CDP_FACILITATOR_KEY)
    throw new Error("CDP_FACILITATOR_KEY secret not configured");
  return JSON.parse(env.CDP_FACILITATOR_KEY);
}

// The payment middleware is built once per payTo address and cached —
// rebuilding per request would re-run the facilitator sync every time.
let cachedMw = null;
let cachedPayTo = null;

function middlewareFor(env) {
  const payToAddr = payTo(env);
  if (cachedMw && cachedPayTo === payToAddr) return cachedMw;

  const { id, privateKey } = cdpKey(env);
  const { createAuthHeaders } = createFacilitatorConfig(id, privateKey);
  const facilitatorClient = new HTTPFacilitatorClient({
    url: CDP_FACILITATOR_URL,
    createAuthHeaders,
  });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    X402_NETWORK,
    new ExactEvmScheme()
  );

  // syncFacilitatorOnStart=true (SDK default): pre-fetches the facilitator's
  // supported kinds so buildPaymentRequirements can construct the 402.
  cachedMw = paymentMiddleware(
    {
      "POST /rpc": {
        accepts: [
          {
            scheme: "exact",
            price: RPC_PRICE,
            network: X402_NETWORK,
            payTo: payToAddr,
            asset: USDC_ASSET,
          },
        ],
        description: "Code Mode sandbox execution — one metered call",
        mimeType: "application/json",
      },
    },
    resourceServer,
    undefined, // paywallConfig
    undefined, // paywall
    true // syncFacilitatorOnStart (default)
  );
  cachedPayTo = payToAddr;
  return cachedMw;
}

/**
 * Best-effort parse of the x402 v2 PAYMENT-SIGNATURE header (base64 JSON).
 * Returns {payer, idempotencyKey} or nulls. Used only for the D1 audit row —
 * payment validity is established by the middleware, not by this parse.
 */
function parsePaymentHeader(request) {
  try {
    const raw =
      request.headers.get("PAYMENT-SIGNATURE") ||
      request.headers.get("payment-signature");
    if (!raw) return { payer: "", idempotencyKey: "" };
    const json = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8")
    );
    const payload = json.payload || {};
    const auth = payload.authorization || {};
    const sig = payload.signature || "";
    return {
      payer: auth.from || "",
      // The signature commits to the exact authorization; it is unique per
      // signed payment and stable across retries → idempotency key.
      idempotencyKey: sig
        ? "x402-" + Buffer.from(String(sig)).toString("base64").slice(0, 64)
        : "",
    };
  } catch {
    return { payer: "", idempotencyKey: "" };
  }
}

// Scoped to /rpc only — /health and /capnp stay unmetered at the HTTP layer.
// (Cap'n Web paid methods enforce entitlement via D1 instead.)
app.use("/rpc", async (c, next) => {
  const mw = middlewareFor(c.env);
  return mw(c, next);
});

/**
 * POST /rpc — metered Code Mode execution, executed IN-WORKER.
 * Previously proxied the raw body to the secondwind-codemode service; now
 * the DynamicWorkerExecutor runs here via the LOADER binding. On success the
 * middleware settles the payment; we record the durable purchase row first so
 * the buyer's capability can be reissued later via recoverSession.
 */
app.post("/rpc", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const { code, language } = body;

  const result = await executeCode(c.env, code, language || "javascript", null, null);
  if (!result.ok) {
    // Throw so the x402 middleware does NOT settle: buyers never pay for
    // failed executions (settle-after-success).
    throw new Error(result.error || "execution_failed");
  }

  // Record the durable purchase row (idempotent on idempotency_key).
  // Runs before the middleware settles — a retried request finds the existing
  // row and inserts nothing.
  const { payer, idempotencyKey } = parsePaymentHeader(c.req.raw);
  let paymentId = null;
  try {
    const rec = await recordRpcPayment(c.env.SW_DB, {
      payer,
      amountMicros: 2000, // $0.002 in USDC micros
      idempotencyKey: idempotencyKey || `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      txHash: "",
    });
    paymentId = rec.id;
  } catch (e) {
    // D1 failure must not fail a paid execution that already ran — log and
    // continue; the facilitator settlement is the money authority.
    console.error("recordRpcPayment failed:", String(e).slice(0, 200));
  }

  return c.json({ ok: true, result: result.result, paymentId });
});

/**
 * ALL /capnp — Cap'n Web endpoint. newWorkersRpcResponse inspects the
 * request: WebSocket upgrade → bidirectional RPC session (server can invoke
 * client-provided callbacks, e.g. onProgress); plain POST → HTTP batch
 * (promise pipelining: no awaits client-side, one round trip).
 */
app.all("/capnp", async (c) => {
  return newWorkersRpcResponse(c.req.raw, new ProductService(c.env));
});

// Health (free, unmetered). Reports the unified surface.
app.get("/health", (c) =>
  c.json({
    ok: true,
    worker: "secondwind-gateway",
    mode: "unified",
    network: X402_NETWORK,
    asset: "USDC",
    surfaces: ["http-x402:/rpc", "capnweb:/capnp"],
    do_free: true,
  })
);

export default app;
