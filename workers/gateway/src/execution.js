import { checkConfiguration, describeProduct, searchCatalog } from "./catalog.js";

const MAX_CODE_BYTES = 65_536;
const MAX_RESULT_BYTES = 262_144;

function inputError(code) {
  return Object.assign(new Error(code), { code, status: 400 });
}

/** Code Mode orchestrates JavaScript; it does not translate a purchased artifact. */
export function validateExecutionInput(code, language) {
  if (typeof code !== "string" || !code.trim()) throw inputError("missing_code");
  if (code.length > MAX_CODE_BYTES || new TextEncoder().encode(code).byteLength > MAX_CODE_BYTES) {
    throw inputError("code_too_large");
  }
  if (typeof language !== "string" || !language.trim()) {
    throw inputError("execution_language_required");
  }
  const normalized = language.trim().toLowerCase();
  if (normalized !== "javascript" && normalized !== "js") {
    throw inputError("unsupported_execution_language");
  }
  return { code, language: "javascript" };
}

/** Notifications are advisory. A disconnected callback cannot change an outcome. */
export async function reportProgress(callback, stage, details, timeoutMs = 250) {
  if (!callback) return;
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => callback.report(stage, details)),
      new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } catch {
    // Durable purchase/execution state, not callback delivery, is the authority.
  } finally {
    clearTimeout(timer);
  }
}

function buildProviders(env, grant) {
  const search = (query, limit) => searchCatalog(env.SW_DB, query, limit);
  const describe = sku => describeProduct(env.SW_DB, sku);
  const configure = (sku, config) => checkConfiguration(env.SW_DB, sku, config);
  const quote = async (sku, config) => {
    const { createQuote } = await import("./commerce.js");
    return createQuote(env, sku, config);
  };
  return {
    search, searchCatalog: search,
    describe, describeProduct: describe,
    configure, checkConfiguration: configure,
    quote, quoteProduct: quote,
    async entitlement() {
      return grant ? {
        sku: grant.sku, paymentId: grant.paymentId,
        allowedActions: [...(grant.allowedActions || [])],
      } : null;
    },
    async deliver() {
      if (!grant || !grant.allowedActions?.includes("deliver")) {
        throw Object.assign(new Error("delivery_not_entitled"), { status: 403 });
      }
      const { deliverGrant } = await import("./commerce.js");
      return deliverGrant(env, grant);
    },
  };
}

/** Stateless sandbox; commerce owns the durable invocation claim and allowance. */
export async function executeCode(env, code, language, grant, onProgress, options = {}) {
  const input = validateExecutionInput(code, language);
  const timeout = Math.max(100, Math.min(60_000, Number(env.EXECUTION_TIMEOUT_MS) || 15_000));
  const callbackTimeout = Math.max(1, Math.min(1000, options.callbackTimeoutMs || 250));
  await reportProgress(onProgress, "start", { language: input.language }, callbackTimeout);
  let outcome;
  try {
    const settings = { loader: env.LOADER, timeout, globalOutbound: null, bindings: {} };
    const executor = options.executorFactory
      ? await options.executorFactory(settings)
      : new (await import("@cloudflare/codemode")).DynamicWorkerExecutor(settings);
    const output = await executor.execute(input.code, buildProviders(env, grant), {});
    if (!output || typeof output !== "object") {
      throw new Error("invalid_executor_result");
    }
    if (output.error !== undefined && output.error !== null) {
      outcome = { ok: false, error: String(output.error).slice(0, 500) || "execution_failed" };
    } else {
      // Persistable JSON is the cross-transport result contract. Fail before
      // settlement if the sandbox returns an unsupported or oversized value.
      const encoded = JSON.stringify(output.result === undefined ? null : output.result);
      if (encoded === undefined) throw new Error("result_not_serializable");
      if (new TextEncoder().encode(encoded).byteLength > MAX_RESULT_BYTES) {
        throw new Error("execution_result_too_large");
      }
      outcome = { ok: true, result: JSON.parse(encoded) };
      if (Array.isArray(output.logs)) {
        outcome.logs = output.logs.slice(0, 50).map(value => String(value).slice(0, 2000));
      }
    }
  } catch (error) {
    outcome = { ok: false, error: String(error?.message || error).slice(0, 500) };
  }
  await reportProgress(onProgress, "complete", { ok: outcome.ok }, callbackTimeout);
  return outcome;
}
