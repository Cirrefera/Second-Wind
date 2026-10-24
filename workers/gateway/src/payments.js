import { paymentMiddlewareFromHTTPServer, x402HTTPResourceServer, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { getContext } from "hono/context-storage";
import { CommerceError, NETWORK, FACILITATOR, ORIGIN, paymentConfig } from "./contracts.js";
import {
  claimVerifiedPurchase, claimPurchaseSettlement, recordPurchaseSettlement,
  recordUncertainSettlement, preparePurchase, finishPurchase,
} from "./commerce.js";

// Hooks are registered once. Hono owns request-local context; no shared buyer state.
function currentPurchase() {
  const state = getContext().get("purchase");
  if (!state) throw new CommerceError("purchase_context_missing",503);
  return state;
}

function gate(operation) {
  return async context => {
    let state;
    try {
      state = currentPurchase();
      await operation(state,context);
    } catch (error) {
      if (state) state.error = error;
      // SDK hook exceptions alone do not veto payment processing.
      return {abort:true,reason:error.code || "purchase_record_unavailable"};
    }
  };
}

/** Standard x402 server with application ledger hooks, never a second payment engine. */
export function paymentHandler(dependencies = {}) {
  const servers = new WeakMap();
  async function serverFor(env) {
    if (servers.has(env)) return servers.get(env);
    const pending = (async () => {
      paymentConfig(env);
      let facilitator = dependencies.facilitator;
      if (!facilitator) {
        let key;
        try { key = JSON.parse(env.CDP_FACILITATOR_KEY); } catch { /* fail closed */ }
        if (!key?.id || !key?.privateKey) throw new CommerceError("facilitator_not_configured",503);
        const {createAuthHeaders} = createFacilitatorConfig(key.id,key.privateKey);
        facilitator = new HTTPFacilitatorClient({url:FACILITATOR,createAuthHeaders});
      }
      const server = new x402ResourceServer(facilitator).register(NETWORK,new ExactEvmScheme());
      server.onAfterVerify(gate(claimVerifiedPurchase));
      server.onBeforeSettle(gate(claimPurchaseSettlement));
      server.onAfterSettle(async ({result}) => {
        const state = currentPurchase();
        try { await recordPurchaseSettlement(state,result); }
        catch (error) { state.error = error; }
      });
      server.onSettleFailure(async ({error}) => {
        const state = currentPurchase();
        try { await recordUncertainSettlement(state,error); }
        catch { /* the fenced settling record still forbids another attempt */ }
      });
      await server.initialize();
      return server;
    })();
    servers.set(env,pending);
    try { return await pending; }
    catch (error) { servers.delete(env); throw error; }
  }

  return async (c,state,route) => {
    c.set("purchase",state);
    const server = await serverFor(c.env);
    const {quote} = state;
    // Request-specific resource/config; the initialized SDK server is reused.
    const httpServer = new x402HTTPResourceServer(server,{
      accepts:{scheme:"exact",network:quote.network,payTo:quote.pay_to,
        price:{amount:quote.amount_usdc_micros,asset:quote.asset,extra:{name:"USD Coin",version:"2"}},
        maxTimeoutSeconds:300},
      resource:`${ORIGIN}${route}?quote_id=${encodeURIComponent(quote.id)}`,
      description:quote.kind === "execution" ? "One JavaScript Code Mode invocation" : `Second Wind ${quote.sku} v${quote.version}`,
      mimeType:"application/json",
      unpaidResponseBody:() => ({contentType:"application/json",body:{error:"payment_required",
        quoteId:quote.id,sku:quote.sku,version:quote.version,content_hash:quote.content_hash,
        amount_usdc_micros:quote.amount_usdc_micros,
        recovery:"Preserve the purchase URL and a private X-Recovery-Token for response-loss recovery."}}),
    });
    // Initialization above fetches /supported once, including retry on init failure.
    const middleware = paymentMiddlewareFromHTTPServer(httpServer,undefined,undefined,false);
    const response = await middleware(c,async () => {
      state.row = await preparePurchase(state,dependencies);
      // SDK buffers this body before settlement. Final delivery follows confirmed recording.
      c.res = c.json({paymentId:state.row.payment_id});
    });
    if (response) c.res = response;
    // Preserve legacy JSON consumers using the SDK-produced challenge itself.
    // The SDK remains the sole constructor/serializer of payment requirements.
    if (c.res.headers.has("PAYMENT-REQUIRED") && c.res.headers.get("Content-Type")?.includes("application/json")) {
      const required = decodePaymentRequiredHeader(c.res.headers.get("PAYMENT-REQUIRED"));
      const body = await c.res.json();
      c.res = c.json({...required,...body,retry_url:required.resource?.url},c.res.status);
    }
    if (state.error) throw state.error;
    if (state.settlement) return finishPurchase(state);
    return null; // SDK challenge or verification failure response is already on c.res.
  };
}
