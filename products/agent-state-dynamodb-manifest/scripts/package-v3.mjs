/** Create a versioned language-scoped draft from the preserved v2 source input. */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../workers/gateway/src/contracts.js';

const output = new URL('../releases/v3/', import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const source = await readFile(new URL('../release-input.json', import.meta.url), 'utf8');
const sourceHash = digest(source);
if (sourceHash !== '9efccf451c3e62ff336e5cbbd750ea975a70d43a4a0974c4a5185d4d73b55efa') throw new Error('v2_source_changed');
const input = JSON.parse(source);
const manifest = input.manifest;
if (manifest.sku !== 'AWS-0568' || manifest.version !== 2) throw new Error('expected_immutable_v2_source');

const languagePaths = {
  table: {
    javascript: ['planner.mjs', 'selection.schema.json', 'README.md', 'LICENSE'],
    python: ['planner.py', 'selection.schema.json', 'README.md', 'LICENSE'],
  },
  'status-index': {javascript: ['features/status-index.mjs'], python: ['features/status_index.py']},
  expiry: {javascript: ['features/expiry.mjs'], python: ['features/expiry.py']},
  recovery: {javascript: ['features/recovery.mjs'], python: ['features/recovery.py']},
  'change-stream': {javascript: ['features/change-stream.mjs'], python: ['features/change_stream.py']},
};
for (const component of manifest.components) {
  const paths = languagePaths[component.id];
  if (!paths) throw new Error(`language_paths_missing:${component.id}`);
  for (const language of manifest.language_policy.adapters) {
    const selected = paths[language];
    if (!selected?.length || selected.some(path => !component.files.some(file => file.path === path)))
      throw new Error(`language_file_missing:${component.id}:${language}`);
  }
  component.files_by_language = paths;
}

const version = 3;
const files = input.files.map(({content, ...descriptor}) => ({...descriptor, content}));
const payloadContent = canonicalJson({schema_version: '1', sku: input.item.sku, version, files});
const contentHash = digest(payloadContent);
const releaseRef = `sha256:${contentHash}`;
input.item.version = version;
input.item.status = 'draft';
manifest.version = version;
manifest.release_ref = releaseRef;
manifest.content_hash = contentHash;
input.routing_manifest.version = version;
input.routing_manifest.release_ref = releaseRef;
input.payload = {content: payloadContent, sha256: contentHash,
  size_bytes: Buffer.byteLength(payloadContent), mime_type: 'application/json'};
input.blockers = [...new Set([...(input.blockers || []), 'language_scoped_candidate_requires_review'])];

const candidate = {...manifest, status: 'draft', publication_blockers: input.blockers,
  validation: {basis: 'unchanged v2 executable files; existing source evidence retained',
    source_input_sha256: sourceHash, language_scoped_delivery: 'requires_review',
    aws_deployment: 'not_performed'}};
const fileManifest = {schema_version: '1', sku: input.item.sku, version,
  product_kind: manifest.product_kind, required_files: manifest.required_files};
await mkdir(output, {recursive: true});
for (const [name, value] of Object.entries({
  'release-input.json': input,
  'release-candidate.json': candidate,
  'routing-manifest.json': input.routing_manifest,
  'files.manifest.json': fileManifest,
  'source-provenance.json': input.source_provenance,
})) await writeFile(new URL(name, output), JSON.stringify(value, null, 2) + '\n');
console.log(JSON.stringify({sku: input.item.sku, version, release_ref: releaseRef,
  files: files.length, components: manifest.components.length, directory: 'releases/v3'}));
