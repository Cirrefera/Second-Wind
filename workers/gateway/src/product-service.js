import {resolveIntent} from './routing.js';
import {describeComponents,trialProduct,recoverTrial,selectTrialComponents,acceptTrialSelection} from './trials.js';
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
      ...(grant.scope ? {scope:grant.scope} : {}),
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

  components(sku) { return describeComponents(this.#env,sku); }
  async trial(sku,config,input,callback) {
    const result=await trialProduct(this.#env,sku,config,input,callback);
    return new TrialCapability(this.#env,result.trial_id,result.trial_token);
  }
  async recoverTrial(id,token) {
    await recoverTrial(this.#env,id,token);
    return new TrialCapability(this.#env,id,token);
  }
  describe(sku) { return describeProduct(this.#env.SW_DB, sku); }
  describeProduct(sku) { return this.describe(sku); }

  search(query, limit) {
    return typeof query === 'string' ? searchCatalog(this.#env.SW_DB, query, limit) : this.searchIntent(query, limit);
  }
  async searchIntent(intent, limit, callbacks) {
    let result=await resolveIntent(this.#env,intent,limit);
    if(result.status==='missing_configuration' && callbacks?.clarify) {
      let timer;
      try {
        const answers=await Promise.race([callbacks.clarify(result.clarifications),
          new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]);
        if(answers && typeof answers==='object' && !Array.isArray(answers)) {
          const patch={};
          for(const question of result.clarifications) {
            const field=question.field.startsWith('evidence:')?'evidence':question.field;
            if(Object.hasOwn(answers,field)) patch[field]=answers[field];
          }
          result=await resolveIntent(this.#env,{...(typeof intent==='string'?{goal:intent}:intent),...patch},limit);
        }
      } finally {clearTimeout(timer);}
    }
    return {...result,candidates:result.matches.map(({routing,compatibility,score,...product})=>({
      product:new ProductCapability(this.#env,product),compatibility,
    }))};
  }
  searchCatalog(query, limit) { return this.search(query, limit); }

  configure(sku, config, callbacks) { return clarify(this.#env.SW_DB, sku, config, callbacks); }

  async select(sku) {
    return new ProductCapability(this.#env, await describeProduct(this.#env.SW_DB, sku));
  }
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

async function clarify(db, sku, config, callbacks) {
  let result = await checkConfiguration(db, sku, config);
  if (result.ok || !result.missing.length || !callbacks) return result;
  if (result.missing.length > 16) throw Object.assign(new Error('too_many_clarifications'), {status:400});
  let timer;
  try {
    const answers = await Promise.race([
      callbacks.clarify(result.missing),
      new Promise((_, reject) => { timer = setTimeout(() => reject(
        Object.assign(new Error('clarification_timeout'), {status:408})), 10000); }),
    ]);
    if (!answers || Array.isArray(answers) || typeof answers !== 'object') {
      throw Object.assign(new Error('invalid_clarification_response'), {status:400});
    }
    const patch = {};
    for (const question of result.missing) {
      // Nested schema pointers require an explicit reconfigure.
      if (/^[A-Za-z][A-Za-z0-9_]*$/.test(question.field) && Object.hasOwn(answers, question.field)) {
        patch[question.field] = answers[question.field];
      }
    }
    return checkConfiguration(db, sku, {...result.config, ...patch});
  } finally { clearTimeout(timer); }
}

/** Selected public product authority, never a repository or storage capability. */
export class ProductCapability extends RpcTarget {
  #env; #product; #config; #check;
  constructor(env, product, config, check) {
    super(); this.#env = env; this.#product = product; this.#config = config; this.#check = check;
  }
  info() { return this.#product; }
  async compatibility(config = this.#config) {
    await this.#unchanged();
    return checkConfiguration(this.#env.SW_DB, this.#product.sku, config);
  }
  async #unchanged() {
    const current = await describeProduct(this.#env.SW_DB, this.#product.sku);
    if (JSON.stringify(current) !== JSON.stringify(this.#product)) {
      throw Object.assign(new Error('product_changed'), {status:409});
    }
  }
  async configure(config, callbacks) {
    await this.#unchanged();
    const result = await clarify(this.#env.SW_DB, this.#product.sku, config, callbacks);
    await this.#unchanged();
    return new ProductCapability(this.#env, this.#product, result.config, result);
  }
  components() { return describeComponents(this.#env,this.#product.sku); }
  async trial(input,callback) {
    await this.#unchanged();
    if(!this.#check?.ok) throw Object.assign(new Error('incomplete_configuration'),{status:400});
    const result=await trialProduct(this.#env,this.#product.sku,this.#config,input,callback);
    return new TrialCapability(this.#env,result.trial_id,result.trial_token);
  }
  configuration() { return this.#check || {ok:false, missing:[], errors:[{code:'configuration_required'}]}; }
  async quote() {
    await this.#unchanged();
    if (!this.#check?.ok) throw Object.assign(new Error('incomplete_configuration'), {status:400});
    const quote = await createQuote(this.#env, this.#product.sku, this.#config);
    if (quote.version !== this.#product.version || quote.content_hash !== this.#product.content_hash) {
      throw Object.assign(new Error('product_changed'), {status:409});
    }
    return quote;
  }
}

export class TrialCapability extends RpcTarget {
  #env; #id; #token;
  constructor(env,id,token) {super();this.#env=env;this.#id=id;this.#token=token;}
  info() {return recoverTrial(this.#env,this.#id,this.#token);}
  recovery() {return {trial_id:this.#id,trial_token:this.#token};}
  async selectComponents(ids) {
    const scope=await selectTrialComponents(this.#env,this.#id,this.#token,ids);
    return new SelectionCapability(this.#env,this.#id,this.#token,scope);
  }
}
class SelectionCapability extends RpcTarget {
  #env; #id; #token; #scope;
  constructor(env,id,token,scope) {super();this.#env=env;this.#id=id;this.#token=token;this.#scope=scope;}
  info() {return structuredClone(this.#scope);}
  accept(expectedScopeHash) {
    if(expectedScopeHash!==this.#scope.scope_hash) throw Object.assign(new Error('selection_acceptance_mismatch'),{status:409});
    return acceptTrialSelection(this.#env,this.#id,this.#token,this.#scope.selected_components,expectedScopeHash);
  }
}
