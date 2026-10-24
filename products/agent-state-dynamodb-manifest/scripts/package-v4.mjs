/** Create AWS-0568 v4 from the pinned immutable v3 draft; never edits v3. */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalJson, sha256} from '../../../workers/gateway/src/contracts.js';

const sourcePath = new URL('../releases/v3/release-input.json', import.meta.url);
const output = new URL('../releases/v4/', import.meta.url);
const reviewPath = new URL('../../../docs/AWS0568_V4_PREVIEW_REVIEW_2026-10-24.md', import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const sourceBytes = await readFile(sourcePath);
const sourceHash = digest(sourceBytes);
if (sourceHash !== '2ddda65a09c19b38c171dbd45ee2b24d521dc575d39f604bd32126d432b6fc01')
  throw new Error('immutable_v3_source_changed');
const input = JSON.parse(sourceBytes.toString('utf8'));
if (input.item.sku !== 'AWS-0568' || input.item.version !== 3 || input.manifest.version !== 3)
  throw new Error('expected_immutable_v3_source');

const replacements = [
  ['This original Second Wind release candidate for `AWS-0568` version 2 contains working JavaScript and Python planners.',
    'This original Second Wind release candidate for `AWS-0568` version 4 contains working JavaScript and Python planners.'],
  ['This lets you test the full product, select a smaller file set, and reuse the same configuration. The maximum payment is $5: table $2, status index $1, expiry $0.50, recovery $1 and change stream $0.50. Sandbox use and selection are free. Select the table and only the optional components you want to purchase; x402 collects the selected amount after acceptance.',
    'Use the sandbox to check configuration and selected features before deciding whether to buy. Prepare a trial with a retained trial_id and trial_token, selected components, JavaScript code, and language:"javascript" through prepareTrial or POST /api/trials/access. HTTP returns its $0.01 x402 challenge; Cap\'n Web returns a public acceptance with a payment URL. Authorize using that URL and X-Recovery-Token equal to trial_token, then run the identical trial; recovering it is free. A new trial costs another $0.01, even if you do not later purchase the product. The access fee is separate from product price and does not increase the $5 maximum: table $2, status index $1, expiry $0.50, recovery $1 and change stream $0.50. After preview, select the table and optional features you want to purchase; x402 collects the selected product amount after acceptance.'],
  ['The hosted Code Mode sandbox runs JavaScript only. Use the JavaScript planner to exercise feature combinations there. Python source is available for inspection and delivery, and its existing offline validation is recorded separately; a JavaScript sandbox result is not evidence of executing Python. Each selected component includes both implementations. Your configuration selects which implementation you use.',
    'After separate $0.01 x402 sandbox-access payment, a trusted adapter privately runs the product JavaScript planner and returns only bounded diagnostics such as validity, component IDs, operation and verification counts, and stable error codes. Buyer JavaScript runs separately with only codemode.preview(), codemode.components(), and codemode.configuration(); it cannot import product modules or read product files. The result excludes source, this README and cookbook, full generated plans, operation inputs, and arbitrary logs. Preview execution always uses JavaScript, even when the configured delivery language is Python; results report execution_language and delivery_language separately. Python source remains available in the paid product delivery.'],
];
let readme = input.files.find(file => file.path === 'README.md')?.content;
if (typeof readme !== 'string') throw new Error('readme_missing');
for (const [before, after] of replacements) {
  if (!readme.includes(before)) throw new Error('expected_readme_text_missing');
  readme = readme.replace(before, after);
}

const readmeBytes = Buffer.from(readme, 'utf8');
const readmeSha = digest(readmeBytes);
for (const file of input.files) if (file.path === 'README.md') {
  Object.assign(file, {content: readme, sha256: readmeSha, size_bytes: readmeBytes.byteLength});
}
for (const component of input.manifest.components) for (const file of component.files) if (file.path === 'README.md')
  Object.assign(file, {content: readme, sha256: readmeSha, size_bytes: readmeBytes.byteLength});
for (const file of input.manifest.required_files) if (file.path === 'README.md')
  Object.assign(file, {sha256: readmeSha, size_bytes: readmeBytes.byteLength});
input.item.guidance = readme;
input.source_provenance.original_file_hashes['README.md'] = readmeSha;
for (const entry of input.source_provenance.license_mapping || []) {
  entry.status = 'source-level mapping reviewed; not an independent legal certification';
}

const version = 4;
const allowedResultFields = ['ok','configuration_valid','selected_components','operation_count',
  'verification_count','runtime_supported','code','execution_language','delivery_language'];
const manifest = input.manifest;
manifest.version = version;
manifest.preview_contract = {
  adapter: 'dynamodb-plan-summary-v1',
  mode: 'bounded-diagnostics',
  execution_language: 'javascript',
  python: 'javascript-preview-only',
  allowed_result_fields: allowedResultFields,
};
const files = input.files.map(({content, ...descriptor}) => ({...descriptor, content}));
const payloadContent = canonicalJson({schema_version: '1', sku: input.item.sku, version, files});
const contentHash = digest(payloadContent);
const releaseRef = `sha256:${contentHash}`;
input.item.version = version;
input.item.status = 'draft';
manifest.release_ref = releaseRef;
manifest.content_hash = contentHash;
input.routing_manifest.version = version;
input.routing_manifest.release_ref = releaseRef;
input.payload = {content: payloadContent, sha256: contentHash,
  size_bytes: Buffer.byteLength(payloadContent), mime_type: 'application/json'};
input.blockers = [...new Set([...(input.blockers || []), 'bounded_preview_contract_requires_review'])];

const candidate = {...manifest, status: 'draft', publication_blockers: input.blockers,
  validation: {basis: 'unchanged v3 executable source inventory; README and preview contract updated',
    source_input_sha256: sourceHash, preview_runtime: 'local-workerd-protected-adapter-verified', aws_deployment: 'not_performed'}};
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

const reviewReport = await readFile(reviewPath);
const reportHash = digest(reviewReport);
const manifestHash = await sha256(canonicalJson(manifest));
const routingHash = await sha256(canonicalJson(input.routing_manifest));
const reference = 'docs/AWS0568_V4_PREVIEW_REVIEW_2026-10-24.md#aws-0568-v4-protected-preview-review';
const review = (kind, subject = manifestHash) => ({kind, subject_hash: subject,
  reviewed_by: 'codex-source-review-2026-10-24', reference,
  review_report_sha256: reportHash, reviewer_type: 'ai-source-and-evidence-review', observed_date: '2026-10-24'});
const reviewRecords = [
  ...['service','contract','product','license','purchase-url','validation','language-adapters','sandbox-trial']
    .map(kind => review(kind)),
  review('routing', routingHash),
];
const reviewsText = JSON.stringify(reviewRecords, null, 2) + '\n';
await writeFile(new URL('publication-reviews.json', output), reviewsText);
const blockers = [...new Set(input.blockers)].sort();
const publicationRecord = {
  schema_version: '1', sku: input.item.sku, version,
  input: `products/agent-state-dynamodb-manifest/releases/v4/release-input.json`,
  input_sha256: digest(JSON.stringify(input, null, 2) + '\n'),
  reviews: `products/agent-state-dynamodb-manifest/releases/v4/publication-reviews.json`,
  reviews_sha256: digest(reviewsText),
  review_report: 'docs/AWS0568_V4_PREVIEW_REVIEW_2026-10-24.md',
  review_report_sha256: reportHash,
  resolved_blockers: blockers,
  mode: 'activate',
  activation_gate: 'trusted_adapter_integration_and_compatible_gateway_deployment_readback_required',
};
await writeFile(new URL('publication-record.json', output), JSON.stringify(publicationRecord, null, 2) + '\n');
console.log(JSON.stringify({sku: input.item.sku, version, release_ref: releaseRef,
  manifest_hash: manifestHash, routing_hash: routingHash, readme_sha256: readmeSha,
  source_v3_sha256: sourceHash, directory: 'releases/v4'}));
