export const NETWORK = "eip155:8453";
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913";
export const ORIGIN = "https://secondwindai.com";
export const FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402";

export class CommerceError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function validToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function paymentConfig(env) {
  const values = [env.X402_PAY_TO, env.X402_PAYTO, env.X402_PAYTO_PUBLIC].filter(Boolean);
  if (new Set(values.map(value => String(value).toLowerCase())).size > 1) {
    throw new CommerceError("payment_recipient_conflict", 503);
  }
  const payTo = values[0];
  if (typeof payTo !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(payTo)
      || isBurnAddress(payTo)) {
    throw new CommerceError("payment_rail_not_configured", 503);
  }
  if (env.X402_EXPECTED_PAY_TO && !sameAddress(payTo, env.X402_EXPECTED_PAY_TO)) {
    throw new CommerceError("payment_recipient_unverified", 503);
  }
  if (env.X402_NETWORK && env.X402_NETWORK !== NETWORK) {
    throw new CommerceError("unsupported_payment_network", 503);
  }
  return { payTo, network: NETWORK, asset: USDC, facilitator: FACILITATOR };
}

export function requirementsFor(quote) {
  return {
    scheme: "exact", network: quote.network, asset: quote.asset,
    payTo: quote.pay_to, amount: quote.amount_usdc_micros,
    maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" },
  };
}

export function sameAddress(left, right) {
  return typeof left === "string" && typeof right === "string"
    && left.toLowerCase() === right.toLowerCase();
}

// Known burn destinations are never valid merchant recipients.
export function isBurnAddress(address) {
  return typeof address === "string" && [
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    "0x0000000000000000000000000000000000000001",
    "0xdead000000000000000042069420694206942069",
  ].includes(address.toLowerCase());
}

export function paymentReadiness(env) {
  let configured = false;
  try { paymentConfig({ ...env, X402_EXPECTED_PAY_TO: undefined }); configured = true; } catch {}
  let verified = false;
  if (configured && env.X402_EXPECTED_PAY_TO) {
    try { paymentConfig(env); verified = true; } catch {}
  }
  return { payment_recipient_configured: configured, payment_recipient_verified: verified };
}
