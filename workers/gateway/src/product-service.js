import {resolveIntent} from './routing.js';
import {describeComponents,trialProduct,recoverTrial,selectTrialComponents,acceptTrialSelection} from './trials.js';
import { RpcTarget } from "capnweb";
import {createJourneyContext,enqueueObservation} from './telemetry.js';
import { checkConfiguration, describeProduct, searchCatalog } from "./catalog.js";
import { executeCode, reportProgress } from "./execution.js";
import {
  createRecoveryChallenge, deliverGrant, executeGrantedInvocation,
  recoverGrant, recoverWithWallet,
} from "./commerce.js";

export { checkConfiguration, describeProduct, searchCatalog } from "./catalog.js";
export { executeCode, validateExecutionInput } from "./execution.js";

function operationJourney(journey) {
  return createJourneyContext({journey_id:journey?.journey_id,transport:journey?.transport});
}

export function deliverProduct(env, grant, options) {
  return deliverGrant(env, grant, options);
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
  #journey;

  constructor(env, grant, journey) {
    super();
    this.#env = env;
    this.#grant = grant;
    this.#journey=journey;
  }

  async execute(invocationId, code, language, onProgress) {
    const grant = await recoverGrant(this.#env, this.#grant.paymentId, this.#grant.recoveryToken);
    if (!grant.allowedActions?.includes("execute")) {
      throw Object.assign(new Error("execution_not_entitled"), { status: 403 });
    }
    // Commerce owns scope, remaining units and invocation replay after reconnect.
    const result=await withProgress(onProgress, "recovery", () => executeGrantedInvocation(
      this.#env, grant, { invocationId, code, language },
      () => executeCode(this.#env, code, language, grant, onProgress),
    ));
    await enqueueObservation(this.#env,'recovery.result_recovered',{journey:operationJourney(this.#journey),payload:{payment_id:grant.paymentId,sku:grant.sku}});
    return result;
  }

  async deliver(onProgress) {
    const grant = await recoverGrant(this.#env, this.#grant.paymentId, this.#grant.recoveryToken);
    if (!grant.allowedActions?.includes("deliver")) {
      throw Object.assign(new Error("delivery_not_entitled"), { status: 403 });
    }
    return withProgress(onProgress, "delivery", () => deliverProduct(this.#env, grant,{journey:operationJourney(this.#journey)}));
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
  #journey;

  constructor(env, journey) {
    super();
    this.#env = env;
    this.#journey=createJourneyContext({...journey,transport:journey?.transport || 'rpc'});
  }

  components(sku) { return describeComponents(this.#env,sku); }
  async trial(sku,config,input,callback) {
    const result=await trialProduct(this.#env,sku,config,input,callback,{journey:operationJourney(this.#journey)});
    return new TrialCapability(this.#env,result.trial_id,result.trial_token,this.#journey);
  }
  async recoverTrial(id,token) {
    await recoverTrial(this.#env,id,token,{journey:operationJourney(this.#journey)});
    return new TrialCapability(this.#env,id,token,this.#journey);
  }
  async describe(sku) {
    const product=await describeProduct(this.#env.SW_DB,sku);
    await enqueueObservation(this.#env,'discovery.described',{journey:operationJourney(this.#journey),payload:{sku:product.sku,product_version_ref:product.version}});
    return product;
  }
  describeProduct(sku) { return this.describe(sku); }

  async search(query, limit) {
    if(typeof query!=='string') return this.searchIntent(query,limit);
    const journey=operationJourney(this.#journey);
    await enqueueObservation(this.#env,'discovery.searched',{journey});
    const products=await searchCatalog(this.#env.SW_DB,query,limit);
    await enqueueObservation(this.#env,'discovery.resolved',{journey,payload:{candidate_product_ids:products.map(p=>p.sku),result_count:products.length,resolution_status:products.length?'multiple_candidates':'no_match'}});
    return products;
  }
  async searchIntent(intent, limit, callbacks) {
    const journey=operationJourney(this.#journey);
    let result=await resolveIntent(this.#env,intent,limit,{journey});
    if(result.status==='missing_configuration' && callbacks?.clarify) {
      let timer;
      await enqueueObservation(this.#env,'clarification.requested',{journey,payload:{clarification_count:result.clarifications.length}});
      try {
        const answers=await Promise.race([callbacks.clarify(result.clarifications),
          new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]);
        if(answers && typeof answers==='object' && !Array.isArray(answers)) {
          const patch={};
          for(const question of result.clarifications) {
            const field=question.field.startsWith('evidence:')?'evidence':question.field;
            if(Object.hasOwn(answers,field)) patch[field]=answers[field];
          }
          await enqueueObservation(this.#env,'clarification.responded',{journey,payload:{response_status:'received'}});
          result=await resolveIntent(this.#env,{...(typeof intent==='string'?{goal:intent}:intent),...patch},limit,{journey});
        } else {
          await enqueueObservation(this.#env,'clarification.responded',{journey,payload:{response_status:answers===null?'timeout':'invalid'}});
        }
      } catch(error) {
        await enqueueObservation(this.#env,'clarification.responded',{journey,payload:{response_status:'failed'}});
        throw error;
      } finally {clearTimeout(timer);}
    }
    return {...result,candidates:result.matches.map(({routing,compatibility,score,...product})=>({
      product:new ProductCapability(this.#env,product,undefined,undefined,this.#journey),compatibility,
    }))};
  }
  searchCatalog(query, limit) { return this.search(query, limit); }

  configure(sku, config, callbacks) { return clarify(this.#env, sku, config, callbacks,operationJourney(this.#journey)); }

  async select(sku) {
    const product=await describeProduct(this.#env.SW_DB,sku);
    await enqueueObservation(this.#env,'selection.product_selected',{journey:operationJourney(this.#journey),payload:{sku:product.sku,product_version_ref:product.version,selected_product_ids:[product.sku]}});
    return new ProductCapability(this.#env,product,undefined,undefined,this.#journey);
  }
  checkConfiguration(sku, config) { return this.configure(sku, config); }

  recoveryChallenge(paymentId) {
    return createRecoveryChallenge(this.#env, paymentId,{journey:operationJourney(this.#journey)});
  }

  recoverWithWallet(paymentId, proof) {
    return recoverWithWallet(this.#env, paymentId, proof,{journey:operationJourney(this.#journey)});
  }

  async getGrant(paymentId, recoveryToken) {
    const grant = await recoverGrant(this.#env, paymentId, recoveryToken);
    await enqueueObservation(this.#env,'recovery.grant_recovered',{journey:operationJourney(this.#journey),payload:{payment_id:grant.paymentId,sku:grant.sku}});
    return new GrantCapability(this.#env, grant,this.#journey);
  }

  async recoverSession(paymentId, recoveryToken) {
    return this.getGrant(paymentId, recoveryToken);
  }
}

async function clarify(env, sku, config, callbacks, journey) {
  const checked=async value=>{
    const result=await checkConfiguration(env.SW_DB,sku,value);
    await enqueueObservation(env,'configuration.checked',{journey:operationJourney(journey),payload:{sku:result.sku,product_version_ref:result.version,configuration_status:result.ok?'complete':'incomplete',missing_count:result.missing.length,error_count:result.errors.length}});
    return result;
  };
  let result = await checked(config);
  if (result.ok || !result.missing.length || !callbacks) return result;
  if (result.missing.length > 16) throw Object.assign(new Error('too_many_clarifications'), {status:400});
  let timer;
  await enqueueObservation(env,'clarification.requested',{journey,payload:{sku:result.sku,clarification_count:result.missing.length}});
  try {
    const answers = await Promise.race([
      callbacks.clarify(result.missing),
      new Promise((_, reject) => { timer = setTimeout(() => reject(
        Object.assign(new Error('clarification_timeout'), {status:408})), 10000); }),
    ]);
    if (!answers || Array.isArray(answers) || typeof answers !== 'object') {
      throw Object.assign(new Error('invalid_clarification_response'), {status:400});
    }
    await enqueueObservation(env,'clarification.responded',{journey,payload:{sku:result.sku,response_status:'received'}});
    const patch = {};
    for (const question of result.missing) {
      // Nested schema pointers require an explicit reconfigure.
      if (/^[A-Za-z][A-Za-z0-9_]*$/.test(question.field) && Object.hasOwn(answers, question.field)) {
        patch[question.field] = answers[question.field];
      }
    }
    return checked({...result.config, ...patch});
  } catch(error) {
    await enqueueObservation(env,'clarification.responded',{journey,payload:{sku:result.sku,response_status:error.message==='clarification_timeout'?'timeout':error.message==='invalid_clarification_response'?'invalid':'failed'}});
    throw error;
  } finally { clearTimeout(timer); }
}

/** Selected public product authority, never a repository or storage capability. */
export class ProductCapability extends RpcTarget {
  #env; #product; #config; #check; #journey;
  constructor(env, product, config, check,journey) {
    super(); this.#env = env; this.#product = product; this.#config = config; this.#check = check;this.#journey=journey;
  }
  info() { return this.#product; }
  async compatibility(config = this.#config) {
    await this.#unchanged();
    return clarify(this.#env, this.#product.sku, config,null,operationJourney(this.#journey));
  }
  async #unchanged() {
    const current = await describeProduct(this.#env.SW_DB, this.#product.sku);
    if (JSON.stringify(current) !== JSON.stringify(this.#product)) {
      throw Object.assign(new Error('product_changed'), {status:409});
    }
  }
  async configure(config, callbacks) {
    await this.#unchanged();
    const result = await clarify(this.#env, this.#product.sku, config, callbacks,operationJourney(this.#journey));
    await this.#unchanged();
    return new ProductCapability(this.#env, this.#product, result.config, result,this.#journey);
  }
  async components() {
    await this.#unchanged();
    const menu=await describeComponents(this.#env,this.#product.sku);
    await this.#unchanged();
    return menu;
  }
  async trial(input,callback) {
    await this.#unchanged();
    if(!this.#check?.ok) throw Object.assign(new Error('incomplete_configuration'),{status:400});
    const result=await trialProduct(this.#env,this.#product.sku,this.#config,input,callback,{journey:operationJourney(this.#journey)});
    return new TrialCapability(this.#env,result.trial_id,result.trial_token,this.#journey);
  }
  configuration() { return this.#check || {ok:false, missing:[], errors:[{code:'configuration_required'}]}; }

}

export class TrialCapability extends RpcTarget {
  #env; #id; #token; #journey;
  constructor(env,id,token,journey) {super();this.#env=env;this.#id=id;this.#token=token;this.#journey=journey;}
  info() {return recoverTrial(this.#env,this.#id,this.#token,{journey:operationJourney(this.#journey)});}
  recovery() {return {trial_id:this.#id,trial_token:this.#token};}
  async selectComponents(ids) {
    const scope=await selectTrialComponents(this.#env,this.#id,this.#token,ids);
    return new SelectionCapability(this.#env,this.#id,this.#token,scope,this.#journey);
  }
}
class SelectionCapability extends RpcTarget {
  #env; #id; #token; #scope; #journey;
  constructor(env,id,token,scope,journey) {super();this.#env=env;this.#id=id;this.#token=token;this.#scope=scope;this.#journey=journey;}
  info() {return structuredClone(this.#scope);}
  accept(expectedScopeHash) {
    if(expectedScopeHash!==this.#scope.scope_hash) throw Object.assign(new Error('selection_acceptance_mismatch'),{status:409});
    return acceptTrialSelection(this.#env,this.#id,this.#token,this.#scope.selected_components,expectedScopeHash,{journey:operationJourney(this.#journey)});
  }
}
