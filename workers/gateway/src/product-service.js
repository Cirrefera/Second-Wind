import { RpcTarget } from "capnweb";
import { checkConfiguration, describeProduct, searchCatalog } from "./catalog.js";
import { executeCode, reportProgress } from "./execution.js";
import {
  createQuote, createRecoveryChallenge, deliverGrant, executeGrantedInvocation,
  recoverGrant, recoverWithWallet,
} from "./commerce.js";

export { checkConfiguration, describeProduct, searchCatalog } from "./catalog.js";
export { executeCode, validateExecutionInput } from "./execution.js";

export function quoteProduct(env, sku, config) {
  return createQuote(env, sku, config);
}

export function deliverProduct(env, grant) {
  return deliverGrant(env, grant);
}

async function withProgress(callback, operation, task) {
  const details = { operation, redelivery: true };
  await reportProgress(callback, "start", details);
  try {
    const result = await task();
    await reportProgress(callback, "complete", { ...details, ok: result?.ok !== false });
    return result;
  } catch (error) {
    await reportProgress(callback, "complete", { ...details, ok: false });
    throw error;
  }
}

/** A session-local reference to a durable, authenticated purchase. */
export class GrantCapability extends RpcTarget {
  #env;
  #grant;

  constructor(env, grant) {
    super();
    this.#env = env;
    this.#grant = grant;
  }

  async execute(invocationId, code, language, onProgress) {
    const grant = await recoverGrant(this.#env, this.#grant.paymentId, this.#grant.recoveryToken);
    if (!grant.allowedActions?.includes("execute")) {
      throw Object.assign(new Error("execution_not_entitled"), { status: 403 });
    }
    // Commerce owns scope, remaining units and invocation replay after reconnect.
    return withProgress(onProgress, "recovery", () => executeGrantedInvocation(
      this.#env, grant, { invocationId, code, language },
      () => executeCode(this.#env, code, language, grant, onProgress),
    ));
  }

  async deliver(onProgress) {
    const grant = await recoverGrant(this.#env, this.#grant.paymentId, this.#grant.recoveryToken);
    if (!grant.allowedActions?.includes("deliver")) {
      throw Object.assign(new Error("delivery_not_entitled"), { status: 403 });
    }
    return withProgress(onProgress, "delivery", () => deliverProduct(this.#env, grant));
  }

  async info() {
    const grant = await recoverGrant(
      this.#env, this.#grant.paymentId, this.#grant.recoveryToken,
    );
    return {
      paymentId: grant.paymentId,
      sku: grant.sku,
      settledAt: grant.settledAt,
      txHash: grant.txHash,
      network: grant.network,
      allowedActions: [...(grant.allowedActions || [])],
    };
  }
}

/** Both names are retained so existing agents can migrate without route drift. */
export class ProductService extends RpcTarget {
  #env;

  constructor(env) {
    super();
    this.#env = env;
  }

  describe(sku) { return describeProduct(this.#env.SW_DB, sku); }
  describeProduct(sku) { return this.describe(sku); }

  search(query, limit) { return searchCatalog(this.#env.SW_DB, query, limit); }
  searchCatalog(query, limit) { return this.search(query, limit); }

  configure(sku, config) { return checkConfiguration(this.#env.SW_DB, sku, config); }
  checkConfiguration(sku, config) { return this.configure(sku, config); }

  quote(sku, config) { return createQuote(this.#env, sku, config); }
  quoteProduct(sku, config) { return this.quote(sku, config); }

  recoveryChallenge(paymentId) {
    return createRecoveryChallenge(this.#env, paymentId);
  }

  recoverWithWallet(paymentId, proof) {
    return recoverWithWallet(this.#env, paymentId, proof);
  }

  async getGrant(paymentId, recoveryToken) {
    const grant = await recoverGrant(this.#env, paymentId, recoveryToken);
    return new GrantCapability(this.#env, grant);
  }

  async recoverSession(paymentId, recoveryToken) {
    return this.getGrant(paymentId, recoveryToken);
  }
}
