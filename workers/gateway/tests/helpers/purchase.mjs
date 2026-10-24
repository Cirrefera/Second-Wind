import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { encodePaymentSignatureHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { openPurchase, CommerceError } from "../../src/commerce.js";
import { paymentHandler } from "../../src/payments.js";

// Existing ledger fault cases now run through the real Hono/x402 lifecycle.
// Only the facilitator and paid execution are synthetic; no SDK server methods are mocked.
export async function purchase(env,input,dependencies = {}) {
  const app = new Hono();
  app.use("*",contextStorage());
  const pay = paymentHandler({facilitator:dependencies.rail,execute:dependencies.execute});
  let result;
  app.onError((error,c) => c.json({error:error.code || "service_unavailable",...error.details},error.status || 503));
  app.post("/rpc",async c => {
    const state = await openPurchase(env,input);
    result = state.response || await pay(c,state,"/rpc");
    if (result) c.res = c.json(result.body);
    return c.res;
  });
  const response = await app.fetch(new Request(`https://secondwindai.com/rpc?quote_id=${input.quoteId}`,{
    method:"POST",headers:{"PAYMENT-SIGNATURE":encodePaymentSignatureHeader(input.paymentPayload)},
  }),env);
  const body = await response.json();
  if (!response.ok) throw new CommerceError(body.error || "payment_verification_failed",response.status,body);
  return {body,paymentResponse:result?.paymentResponse || decodePaymentResponseHeader(response.headers.get("PAYMENT-RESPONSE"))};
}
