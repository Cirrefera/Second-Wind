import { executeCode } from './execution.js';
import { prepareComponentSelection } from './scope.js';
import { CommerceError, sha256 } from './contracts.js';

const ADAPTER = 'dynamodb-plan-summary-v1';
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

/** Catalog projection check: reviewed contract, priced selection and all private JS bytes. */
export async function previewAvailable(release) {
  try {
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
