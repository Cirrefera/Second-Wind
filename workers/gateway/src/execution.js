import {buyerView} from './public-identity.js';
import {createJourneyContext} from './telemetry.js';

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

async function buildProviders(env, grant, context) {
  const {ProductService}=await import('./product-service.js');
  const journey=createJourneyContext({journey_id:context?.journey_id,transport:'sandbox'});
  const service=new ProductService(env,journey);
  const search = (query, limit) => service.search(query, limit);
  const describe = sku => service.describe(sku);
  const configure = (sku, config) => service.configure(sku, config);
  return {
    search, searchCatalog: search,
    describe, describeProduct: describe,
    configure, checkConfiguration: configure,
    async entitlement() {
      return grant ? buyerView(env.SW_DB,{
        sku: grant.sku, paymentId: grant.paymentId,
        allowedActions: [...(grant.allowedActions || [])],
      }) : null;
    },
    async deliver() {
      if (!grant || !grant.allowedActions?.includes("deliver")) {
        throw Object.assign(new Error("delivery_not_entitled"), { status: 403 });
      }
      const { deliverGrant } = await import("./commerce.js");
      return buyerView(env.SW_DB,await deliverGrant(env, grant,{journey:createJourneyContext({journey_id:journey.journey_id,transport:'sandbox'})}));
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
    // Worker Loader infers raw-string module type only for .js/.py names.
    // Preserve the product's .mjs paths and bytes with an explicit ES module type.
    const modules=Object.fromEntries(Object.entries(options.modules || {}).map(([name,source])=>
      [name,name.endsWith('.mjs')&&typeof source==='string'?{js:source}:source]));
    const settings = { loader: env.LOADER, timeout, globalOutbound: null, bindings: {}, modules };
    const executor = options.executorFactory
      ? await options.executorFactory(settings)
      : new (await import("@cloudflare/codemode")).DynamicWorkerExecutor(settings);
    const output = await executor.execute(input.code, options.providers || await buildProviders(env, grant, options.journey), {});
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
