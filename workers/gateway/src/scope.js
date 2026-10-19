import {canonicalJson, sha256, CommerceError} from './contracts.js';

const fail = code => { throw new CommerceError(code, 400); };
const keyPattern = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const digestPattern = /^[a-f0-9]{64}$/;

/** Release-owned prices and payload identities. Buyer input is component IDs only.
 * 10,000 basis points = the whole product. Never count lines, bytes or tokens.
 */
export async function validateComponentRelease(release) {
  if (!release || release.schema_version !== '1' || !release.sku || !release.release_ref
      || !Number.isSafeInteger(release.version) || release.version < 1
      || release.pricing?.mode !== 'proportional-components'
      || typeof release.pricing.max_amount_atomic !== 'string'
      || !/^[1-9][0-9]{0,15}$/.test(release.pricing.max_amount_atomic)
      || !release.pricing.asset || !release.pricing.network
      || !Array.isArray(release.components) || !release.components.length
      || release.components.length > 100) fail('invalid_component_release');
  const byId = new Map();
  const paths = new Map();
  let total = 0;
  for (const component of release.components) {
    if (!keyPattern.test(component.id || '') || byId.has(component.id)
        || !Number.isSafeInteger(component.share_bps) || component.share_bps < 1
        || component.share_bps > 10000 || !component.name?.trim()
        || !Array.isArray(component.requires) || new Set(component.requires).size !== component.requires.length
        || !Array.isArray(component.files) || !component.files.length) fail('invalid_component');
    byId.set(component.id, component);
    total += component.share_bps;
    const localPaths = new Set();
    for (const file of component.files) {
      if (typeof file.path !== 'string' || file.path.length > 256
          || !file.path.split('/').every(part => /^[A-Za-z0-9_.-]{1,128}$/.test(part) && part !== '.' && part !== '..')
          || localPaths.has(file.path) || !digestPattern.test(file.sha256 || '')
          || !Number.isSafeInteger(file.size_bytes) || file.size_bytes < 0
          || !file.mime_type?.trim()) fail('invalid_component_file');
      localPaths.add(file.path);
      const identity = canonicalJson(file);
      if (paths.has(file.path) && paths.get(file.path) !== identity) fail('conflicting_component_file');
      paths.set(file.path, identity);
    }
  }
  if (total !== 10000) fail('component_shares_must_total_100_percent');
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (!byId.has(id)) fail('unknown_component_dependency');
    if (visiting.has(id)) fail('cyclic_component_dependency');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).requires) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return {byId, release_hash: await sha256(canonicalJson(release))};
}

/** Allocate indivisible atomic units once per complete release, never per retry.
 * Largest remainder, component ID tie-break: sums exactly to the listed maximum.
 */
function allocate(release) {
  const maximum = BigInt(release.pricing.max_amount_atomic);
  const rows = release.components.map(c => {
    const numerator = maximum * BigInt(c.share_bps);
    return {id:c.id, amount:numerator / 10000n, remainder:numerator % 10000n};
  });
  let remainder = maximum - rows.reduce((sum, c) => sum + c.amount, 0n);
  rows.sort((a,b) => a.remainder === b.remainder ? (a.id < b.id ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
  for (const row of rows) { if (remainder === 0n) break; row.amount++; remainder--; }
  // A priced component must not become accidentally free due to currency precision.
  if (rows.some(row => row.amount === 0n)) fail('component_below_currency_precision');
  return new Map(rows.map(row => [row.id,row.amount]));
}

export async function componentMenu(release) {
  const {release_hash} = await validateComponentRelease(release);
  const prices = allocate(release);
  return {sku:release.sku, version:release.version, release_ref:release.release_ref,
    release_hash, ...release.pricing,
    components:release.components.map(c => ({id:c.id,name:c.name,share_bps:c.share_bps,
      amount_atomic:prices.get(c.id).toString(),requires:[...c.requires]}))};
}

/** Selection is preparation, never payment. It has no recipient or facilitator dependency. */
export async function prepareComponentSelection(release, selectedIds, configuration = {}) {
  const {byId,release_hash} = await validateComponentRelease(release);
  if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length > 100
      || new Set(selectedIds).size !== selectedIds.length) fail('invalid_component_selection');
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) fail('invalid_configuration');
  for (const id of selectedIds) if (!byId.has(id)) fail('unknown_selected_component');
  const selected = new Set(selectedIds);
  const missing = [...new Set(selectedIds.flatMap(id => byId.get(id).requires).filter(id => !selected.has(id)))].sort();
  if (missing.length) throw new CommerceError('component_dependencies_required',400,{missing_components:missing});
  const prices = allocate(release);
  const ids = [...selectedIds].sort();
  const amount = ids.reduce((sum,id) => sum + prices.get(id), 0n);
  const files = new Map();
  for (const id of ids) for (const file of byId.get(id).files) files.set(file.path,file);
  const scope = {schema_version:'1',sku:release.sku,version:release.version,
    release_ref:release.release_ref,release_hash,
    configuration_hash:await sha256(canonicalJson(configuration)),
    selected_components:ids,selected_share_bps:ids.reduce((sum,id)=>sum+byId.get(id).share_bps,0),
    max_amount_atomic:release.pricing.max_amount_atomic,amount_atomic:amount.toString(),
    asset:release.pricing.asset,network:release.pricing.network,
    files:[...files.values()].sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0)};
  return {...scope,scope_hash:await sha256(canonicalJson(scope))};
}

/** Recompute from the authoritative release; never trust a buyer-supplied percentage. */
export async function verifyComponentSelection(release, scope, configuration) {
  const expected = await prepareComponentSelection(release, scope?.selected_components, configuration);
  if (canonicalJson(scope) !== canonicalJson(expected)) fail('component_selection_changed');
  return expected;
}
