import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { createStack } from './product.mjs';

const schema=JSON.parse(readFileSync(new URL('./config.schema.json',import.meta.url),'utf8'));
function matches(rule,value) {
  if(rule.const!==undefined&&value!==rule.const) return false;
  if(rule.enum&&!rule.enum.includes(value)) return false;
  if(rule.if) { const matchesIf=matches(rule.if,value); if(matchesIf&&rule.then&&!matches(rule.then,value)) return false; if(!matchesIf&&rule.else&&!matches(rule.else,value)) return false; }
  if(rule.type==='object'||rule.properties||rule.required||rule.allOf) {
    if(rule.type==='object'&&(!value||typeof value!=='object'||Array.isArray(value))) return false;
    if(rule.additionalProperties===false&&Object.keys(value||{}).some(key=>!Object.hasOwn(rule.properties||{},key))) return false;
    if((rule.required||[]).some(key=>!Object.hasOwn(value||{},key))) return false;
    if(Object.entries(rule.properties||{}).some(([key,child])=>Object.hasOwn(value||{},key)&&!matches(child,value[key]))) return false;
    if(rule.allOf&&(rule.allOf.some(child=>!matches(child,value)))) return false;
    if(rule.if&&matches(rule.if,value)&&rule.then&&!matches(rule.then,value)) return false;
    return true;
  }
  if(rule.type==='string') {
    if(typeof value!=='string'||value.length<(rule.minLength||0)||value.length>(rule.maxLength??Infinity)) return false;
    if(rule.pattern&&!new RegExp(rule.pattern).test(value)) return false;
    if(rule.format==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
    if(rule.format==='uri') { try { const parsed=new URL(value); if(!parsed.protocol||!parsed.host) return false; } catch { return false; } }
    return true;
  }
  if(rule.type==='integer') return Number.isInteger(value)&&value>=(rule.minimum??-Infinity)&&value<=(rule.maximum??Infinity);
  if(rule.type==='number') return typeof value==='number'&&Number.isFinite(value)&&value>=(rule.minimum??-Infinity)&&value<=(rule.maximum??Infinity);
  if(rule.type==='boolean') return typeof value==='boolean';
  return true;
}

// Runs real AWS CDK synthesis in native Node. No AWS API calls or deploy occur.
// Only resource and stack counts leave this module; templates and names stay local.
export async function preview({configuration,selected_components}) {
  let outdir;
  if(!matches(schema,configuration)||!Array.isArray(selected_components)||selected_components.length!==1||selected_components[0]!=='stack')
    return {ok:false,configuration_valid:matches(schema,configuration),selected_components:[],resource_count:0,stack_count:0,code:'invalid_input',execution_language:'javascript'};
  try {
    outdir=mkdtempSync(join(tmpdir(),'secondwind-cdk-preview-'));
    const app=new App({outdir,analyticsReporting:false});
    createStack(app,{configuration,selected_components});
    const assembly=app.synth();
    const stacks=assembly.stacks;
    const resource_count=stacks.reduce((sum,artifact)=>sum+Object.keys(artifact.template?.Resources||{}).length,0);
    return {ok:true,configuration_valid:true,selected_components:['stack'],resource_count,stack_count:stacks.length,execution_language:'javascript'};
  } catch (error) {
    const invalid=error?.message==='invalid_configuration'||error?.message==='invalid_selection';
    return {ok:false,configuration_valid:!invalid,selected_components:invalid?[]:['stack'],resource_count:0,stack_count:0,code:invalid?'invalid_input':'synthesis_failed',execution_language:'javascript'};
  } finally { if(outdir) rmSync(outdir,{recursive:true,force:true}); }
}
