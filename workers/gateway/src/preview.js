import { executeCode } from './execution.js';
import { prepareComponentSelection } from './scope.js';
import { CommerceError, sha256 } from './contracts.js';
import { isSandboxEligible } from './sandbox-policy.js';
import { parse } from 'acorn';

const ADAPTER = 'dynamodb-plan-summary-v1';
const PRODUCT_ADAPTER = 'js-product-entrypoint-v1';
const MAX_PREVIEW_FILES = 64;
const MAX_PREVIEW_PACKAGE_BYTES = 512 * 1024;
const PREVIEW_NODE_MODULES = new Set(['node:assert','node:async_hooks','node:buffer','node:console','node:crypto',
  'node:dgram','node:diagnostics_channel','node:events','node:fs','node:http','node:https',
  'node:os','node:path','node:querystring','node:stream','node:url','node:util','node:zlib']);
const PRODUCT_RESULT_FIELDS = new Set(['ok','status','slug','resource_count',
  'operation_count','verification_count','route_count','action_count','model_count',
  'table_count','index_count','policy_count','permission_count','warning_count','error_count',
  'diagnostic_codes','selected_components']);
const PRODUCT_STATUSES = new Set(['ready','valid','invalid','unavailable','warning','blocked','configured','complete','passed','failed']);
const PRODUCT_DIAGNOSTIC_CODES = new Set(['configuration_invalid','credentials_required',
  'dependency_missing','dependency_unavailable','invalid_selection','preview_execution_failed',
  'preview_result_invalid','runtime_unavailable','unsupported_runtime','validation_failed',
  'local_fixture_only']);
const PRODUCT_COUNT_FIELDS = new Set(['resource_count','operation_count','verification_count',
  'route_count','action_count','model_count','table_count','index_count','policy_count',
  'permission_count','warning_count','error_count']);
const ALLOWED_RESULT_FIELDS = ['ok','configuration_valid','selected_components',
  'operation_count','verification_count','runtime_supported','code','execution_language','delivery_language'];
const fail = (code,status=409) => { throw new CommerceError(code,status); };

function previewContract(release) {
  const contract=release?.preview_contract;
  if (release?.sku !== 'AWS-0568' || release?.product_kind !== 'artifact-product'
      || release?.trial_adapter !== 'javascript-isolate'
      || contract?.adapter !== ADAPTER || contract?.mode !== 'bounded-diagnostics'
      || contract?.execution_language !== 'javascript' || contract?.python !== 'javascript-preview-only'
      || !Array.isArray(contract.allowed_result_fields)
      || [...contract.allowed_result_fields].sort().join('\0') !== [...ALLOWED_RESULT_FIELDS].sort().join('\0')
      || release?.delivery_contract?.kind !== 'file-package'
      || release?.delivery_contract?.entrypoints?.javascript !== 'planner.mjs') {
    fail('preview_not_supported');
  }
  return contract;
}

/** A small, reviewed JavaScript package contract for deterministic previews.
 * Native runtimes and third-party package resolution are deliberately outside
 * this Worker Loader adapter. The fixed path is part of the gateway contract.
 */
function productPreviewContract(release) {
  const contract = release?.preview_contract;
  if (!isSandboxEligible(release?.sku)
      || release?.product_kind !== 'artifact-product'
      || release?.trial_adapter !== 'javascript-isolate'
      || contract?.adapter !== PRODUCT_ADAPTER
      || contract?.mode !== 'bounded-diagnostics'
      || contract?.execution_language !== 'javascript'
      || contract?.entrypoint !== 'preview.mjs'
      || !Array.isArray(contract.allowed_result_fields)
      || !contract.allowed_result_fields.includes('ok')
      || new Set(contract.allowed_result_fields).size !== contract.allowed_result_fields.length
      || contract.allowed_result_fields.some(field => !PRODUCT_RESULT_FIELDS.has(field))) {
    fail('preview_not_supported');
  }
  return contract;
}

function validatedConfiguration(release,configuration) {
  if (!configuration || Array.isArray(configuration) || typeof configuration !== 'object'
      || ![Object.prototype,null].includes(Object.getPrototypeOf(configuration))
      || Object.keys(configuration).some(key=>!['language','table_name'].includes(key))
      || typeof configuration.table_name !== 'string'
      || !/^[A-Za-z0-9_.-]{3,255}$/.test(configuration.table_name)) {
    fail('preview_configuration_invalid',400);
  }
  const language=configuration.language;
  if (!['javascript','python'].includes(language)
      || release?.language_policy?.mode !== 'configured'
      || !release.language_policy.adapters?.includes(language)) {
    fail('preview_language_unsupported',400);
  }
  return {language,table_name:configuration.table_name};
}

/** Validate the reviewed adapter, explicit selection, dependencies and language. */
export async function validatePreview(release,configuration,components) {
  if (release?.sku !== 'AWS-0568' && release?.preview_contract?.adapter === PRODUCT_ADAPTER) {
    productPreviewContract(release);
    const scope = await prepareComponentSelection(release, components, configuration);
    await productJavascriptPackage(release, scope.selected_components);
    return scope.selected_components;
  }
  previewContract(release);
  const config=validatedConfiguration(release,configuration);
  const scope=await prepareComponentSelection(release,components,config);
  await javascriptPackage(release,scope.selected_components);
  return scope.selected_components;
}

async function javascriptPackage(release,selectedIds) {
  const selected=new Set(selectedIds), modules={}, featurePaths=[];
  let plannerCount=0;
  for (const component of release.components) {
    if (!selected.has(component.id)) continue;
    const paths=component.files_by_language?.javascript || component.files
      .filter(file=>/\.m?js$/.test(file.path)).map(file=>file.path);
    const jsPaths=paths.filter(path=>/\.m?js$/.test(path));
    if (component.id==='table') {
      if (!jsPaths.includes('planner.mjs')) fail('preview_package_invalid',503);
      plannerCount++;
    } else if (jsPaths.length!==1) fail('preview_package_invalid',503);
    for (const path of jsPaths) {
      const file=component.files.find(entry=>entry.path===path);
      if (!file || typeof file.content!=='string'
          || new TextEncoder().encode(file.content).byteLength!==file.size_bytes
          || await sha256(file.content)!==file.sha256) fail('preview_package_invalid',503);
      modules[`product/${path}`]=file.content;
      if (path==='planner.mjs' && !/\bexport\s+function\s+prepare\s*\(/.test(file.content)) {
        fail('preview_package_invalid',503);
      }
      if (path!=='planner.mjs' && !/\bexport\s+const\s+feature\s*=/.test(file.content)) {
        fail('preview_package_invalid',503);
      }
      if (path!=='planner.mjs') featurePaths.push(`./product/${path}`);
    }
  }
  if (plannerCount!==1 || Object.keys(modules).length>5) fail('preview_package_invalid',503);
  return {modules,featurePaths};
}

function resolveRelativeModule(fromPath, specifier) {
  if (typeof specifier !== 'string' || !specifier.startsWith('./')) return null;
  const parts = fromPath.split('/').slice(0, -1);
  for (const part of specifier.slice(2).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(part)) return null;
      parts.push(part);
    }
  }
  return parts.join('/');
}

function packageImports(source) {
  const imports = [];
  // Parse actual module syntax: minification, comments and string escapes
  // must not hide imports from the private package dependency check.
  let program;
  try { program = parse(source,{ecmaVersion:'latest',sourceType:'module'}); }
  catch { return null; }
  const pending = [program];
  while (pending.length) {
    const node = pending.pop();
    if (node.type === 'ImportExpression') {
      if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return null;
      imports.push(node.source.value);
    } else if (['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)
        && node.source) {
      imports.push(node.source.value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      } else if (value?.type) pending.push(value);
    }
  }
  return imports;
}

function sanitizeProductPreviewResult(value, contract, slug, selectedComponents) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const result = {};
  for (const field of contract.allowed_result_fields) {
    if (!Object.hasOwn(value, field)) continue;
    const item = value[field];
    if (field === 'ok') {
      if (typeof item !== 'boolean') return null;
      result.ok = item;
    } else if (field === 'status') {
      if (typeof item !== 'string' || !PRODUCT_STATUSES.has(item)) return null;
      result.status = item;
    } else if (field === 'slug') {
      if (item !== slug) return null;
      result.slug = item;
    } else if (PRODUCT_COUNT_FIELDS.has(field)) {
      if (!Number.isSafeInteger(item) || item < 0 || item > 1000) return null;
      result[field] = item;
    } else if (field === 'diagnostic_codes') {
      if (!Array.isArray(item) || item.length > 50
          || item.some(entry => typeof entry !== 'string'
            || !PRODUCT_DIAGNOSTIC_CODES.has(entry))) return null;
      result.diagnostic_codes = [...new Set(item)];
    } else if (field === 'selected_components') {
      if (!Array.isArray(item) || canonicalComponentIds(item) !== canonicalComponentIds(selectedComponents)) return null;
      result.selected_components = [...selectedComponents];
    }
  }
  if (result.ok !== true && result.ok !== false) return null;
  if (result.selected_components && canonicalComponentIds(result.selected_components)
      !== canonicalComponentIds(selectedComponents)) return null;
  return result;
}

function canonicalComponentIds(ids) {
  return Array.isArray(ids) ? [...ids].sort().join('\0') : '';
}

async function productJavascriptPackage(release, selectedIds) {
  const selected = new Set(selectedIds), modules = {};
  let totalBytes = 0;
  for (const component of release.components) {
    if (!selected.has(component.id)) continue;
    const paths = component.files_by_language?.javascript || component.files
      .filter(file => /\.m?js$/.test(file.path)).map(file => file.path);
    for (const path of paths) {
      if (!/\.m?js$/.test(path)) continue;
      const file = component.files.find(entry => entry.path === path);
      if (!file || typeof file.content !== 'string'
          || new TextEncoder().encode(file.content).byteLength !== file.size_bytes
          || await sha256(file.content) !== file.sha256) fail('preview_package_invalid', 503);
      totalBytes += file.size_bytes;
      if (totalBytes > MAX_PREVIEW_PACKAGE_BYTES) fail('preview_package_too_large', 503);
      modules[`product/${path}`] = file.content;
    }
  }
  if (Object.keys(modules).length > MAX_PREVIEW_FILES || !modules['product/preview.mjs']) {
    fail('preview_package_invalid', 503);
  }
  // Validate hashes and sizes for every selected JavaScript file above, but
  // load only the fixed entrypoint's dependency closure. A native paid library
  // may coexist in the package without becoming ambient sandbox code.
  const reachable = new Set();
  const pending = ['product/preview.mjs'];
  while (pending.length) {
    const name = pending.pop();
    if (reachable.has(name)) continue;
    const source = modules[name];
    if (typeof source !== 'string') fail('preview_dependency_unavailable', 503);
    reachable.add(name);
    const imports = packageImports(source);
    if (!imports) fail('preview_package_invalid', 503);
    for (const specifier of imports) {
      if (PREVIEW_NODE_MODULES.has(specifier)) continue;
      const resolved = resolveRelativeModule(name.slice('product/'.length), specifier);
      if (!resolved || !modules[`product/${resolved}`]) fail('preview_dependency_unavailable', 503);
      pending.push(`product/${resolved}`);
    }
  }
  if (!/\bexport\s+(?:async\s+)?function\s+preview\s*\(/.test(modules['product/preview.mjs'])
      && !/\bexport\s*\{[^}]*\bpreview\b[^}]*\}/s.test(modules['product/preview.mjs'])) {
    fail('preview_package_invalid', 503);
  }
  return {modules:Object.fromEntries([...reachable].map(name => [name, modules[name]]))};
}

/** Catalog projection check: reviewed contract, priced selection and all private JS bytes. */
export async function previewAvailable(release) {
  try {
    if (release?.sku !== 'AWS-0568' && release?.preview_contract?.adapter === PRODUCT_ADAPTER) {
      productPreviewContract(release);
      const config = {language:'javascript'};
      const selected = release.components.map(component => component.id);
      await prepareComponentSelection(release, selected, config);
      await productJavascriptPackage(release, selected);
      return true;
    }
    previewContract(release);
    const config=validatedConfiguration(release,{language:'javascript',table_name:'preview-check'});
    const selected=release.components.map(component=>component.id);
    await prepareComponentSelection(release,selected,config);
    await javascriptPackage(release,selected);
    return true;
  } catch {
    return false;
  }
}

const trustedPreviewCode = `
const {prepare}=await import('./product/planner.mjs');
const paths=await codemode.previewModules();
const features=[];
for (const path of paths) features.push(await import(path));
const plan=prepare(await codemode.configuration(),features.map(module=>module.feature));
if (!plan || !Array.isArray(plan.steps) || !Array.isArray(plan.verification)) throw new Error('invalid_preview_result');
return {operation_count:plan.steps.length,verification_count:plan.verification.length};
`;

function result(ok,configurationValid,selected,deliveryLanguage,details={}) {
  return {ok,configuration_valid:configurationValid,selected_components:selected,
    operation_count:details.operation_count ?? null,
    verification_count:details.verification_count ?? null,
    runtime_supported:true,execution_language:'javascript',delivery_language:deliveryLanguage,
    ...(details.code ? {code:details.code} : {})};
}

/** Run only the reviewed, fixed planner and return counts rather than its plan. */
export async function runProductPreview(env,release,configuration,selectedIds,options={}) {
  if (release?.sku !== 'AWS-0568' && release?.preview_contract?.adapter === PRODUCT_ADAPTER) {
    const contract = productPreviewContract(release);
    const selected = await prepareComponentSelection(release, selectedIds, configuration);
    const {modules} = await productJavascriptPackage(release, selected.selected_components);
    const providers = {
      configuration: async () => configuration,
      selectedComponents: async () => [...selected.selected_components],
    };
    const code = `const {preview}=await import('./product/preview.mjs');\nreturn await preview({configuration:await codemode.configuration(),selected_components:await codemode.selectedComponents()});`;
    const execution = await executeCode(env, code, 'javascript', null, null, {
      modules, providers, privateProductPreview:true, executorFactory: options.previewExecutorFactory,
    });
    if (!execution?.ok) {
      return {ok:false, code:'preview_execution_failed', selected_components:selected.selected_components,
        runtime_supported:true, execution_language:'javascript'};
    }
    const result = sanitizeProductPreviewResult(execution.result, contract, release.slug, selected.selected_components);
    if (!result) return {ok:false, code:'preview_result_invalid',
      selected_components:selected.selected_components, runtime_supported:true, execution_language:'javascript'};
    const encoded = JSON.stringify(result);
    if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > 16_384) {
      return {ok:false, code:'preview_result_invalid', selected_components:selected.selected_components,
        runtime_supported:true, execution_language:'javascript'};
    }
    return {...JSON.parse(encoded), selected_components:selected.selected_components,
      runtime_supported:true, execution_language:'javascript'};
  }
  previewContract(release);
  const config=validatedConfiguration(release,configuration);
  const selected=await validatePreview(release,config,selectedIds);
  // JavaScript is the only hosted preview runtime. This confirms the selected
  // plan while keeping a Python delivery selection explicit in the result.
  const executionConfig={...config,language:'javascript'};
  const {modules,featurePaths}=await javascriptPackage(release,selected);
  const providers={
    configuration:async()=>({...executionConfig}),
    previewModules:async()=>[...featurePaths],
  };
  let execution;
  try {
    // This test seam is intentionally separate from executeCode's caller-code seam.
    execution=await executeCode(env,trustedPreviewCode,'javascript',null,null,{
      modules,providers,executorFactory:options.previewExecutorFactory,
    });
  } catch {
    return result(false,true,selected,config.language,{code:'preview_execution_failed'});
  }
  const summary=execution?.result;
  if (!execution?.ok || !summary || !Number.isSafeInteger(summary.operation_count)
      || summary.operation_count<0 || summary.operation_count>100
      || !Number.isSafeInteger(summary.verification_count)
      || summary.verification_count<0 || summary.verification_count>100) {
    return result(false,true,selected,config.language,{code:'preview_execution_failed'});
  }
  return result(true,true,selected,config.language,summary);
}
