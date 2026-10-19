"""Pin public upstream trees and inspect every held listing's actual source pointer.

Run with held-inventory.json and --fetch to refresh public GitHub evidence, or
without --fetch to regenerate from the pinned cache. This does not assemble,
license-review, publish or execute upstream software. No credentials are used.
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

root = Path(__file__).resolve().parent
inventory_path = Path(sys.argv[1])
fetch = '--fetch' in sys.argv[2:]
refresh_errors = '--refresh-errors' in sys.argv[2:]
repository_locations = {'cdklabs/generative-ai-cdk-constructs': 'awslabs/generative-ai-cdk-constructs'}
inventory_bytes = inventory_path.read_bytes()
inventory = json.loads(inventory_bytes)
historical = json.loads((root / 'inventory-evidence-2026-10-19.json').read_text())
canonical = subprocess.check_output(['node', '--input-type=module', '-e', "import {canonicalJson} from './workers/gateway/src/contracts.js'; import fs from 'node:fs'; process.stdout.write(canonicalJson(JSON.parse(fs.readFileSync(process.argv[1]))));", str(inventory_path)], cwd=root.parents[2])
if hashlib.sha256(canonical).hexdigest() != historical['snapshot_sha256']:
    raise ValueError('historical_snapshot_mismatch')
cache_path = root / 'public-source-cache.json'


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Second-Wind-local-source-review', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def inspect_repo(name):
    try:
        current_name = repository_locations.get(name, name)
        repo = json.loads(get('https://api.github.com/repos/' + current_name))
        commit = json.loads(get('https://api.github.com/repos/' + current_name + '/commits/' + repo['default_branch']))
        tree = json.loads(get('https://api.github.com/repos/' + current_name + '/git/trees/' + commit['commit']['tree']['sha'] + '?recursive=1'))
        entries = tree['tree']
        licenses = []
        for entry in entries:
            path = entry['path']
            if '/' not in path and entry['type'] == 'blob' and path.upper() in ('LICENSE', 'LICENSE.TXT', 'LICENSE.MD', 'NOTICE', 'NOTICE.TXT'):
                raw_url = f"https://raw.githubusercontent.com/{repo['full_name']}/{commit['sha']}/{path}"
                data = get(raw_url)
                licenses.append({'path': path, 'git_blob_sha': entry['sha'], 'sha256': hashlib.sha256(data).hexdigest(), 'size_bytes': len(data), 'url': raw_url, 'content': data.decode('utf-8')})
        return name, {'requested_repository': name, 'canonical_repository': repo['full_name'],
                      'location_resolution': {'historical_pointer': name, 'observed_public_location': current_name, 'basis': 'Primary repository README and package metadata at https://github.com/' + current_name} if current_name != name else None,
                      'default_branch_observed': repo['default_branch'],
                      'revision': commit['sha'], 'revision_url': commit['html_url'], 'tree_sha': tree['sha'], 'tree_truncated': tree.get('truncated', False),
                      'archived': repo.get('archived', False), 'license_api_claim': (repo.get('license') or {}).get('spdx_id'),
                      'root_license_and_notice_files': licenses, 'entries': entries}
    except Exception as error:
        return name, {'requested_repository': name, 'error': f'{type(error).__name__}: {error}'}


repositories = sorted({item['source_repo'] for item in inventory if item.get('source_repo')})
def project_tree(name, repo):
    """Keep the pinned tree identities and relevant pointer evidence, not a 30 MB upstream index."""
    if repo.get('error') or 'tree_entry_count' in repo:
        return repo
    pointers = set()
    for item in inventory:
        if item.get('source_repo') == name and 'Structured payload:' in (item.get('guidance') or ''):
            try:
                pointer = json.loads(item['guidance'].split('Structured payload:', 1)[1].strip()).get('path')
                if pointer:
                    pointers.add(pointer.rstrip('/'))
            except (json.JSONDecodeError, AttributeError):
                pass
    entries = repo['entries']
    repo['tree_entry_count'] = len(entries)
    repo['full_tree_entries_sha256'] = hashlib.sha256(json.dumps(entries,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    repo['descendant_file_counts'] = {path: sum(entry['type']=='blob' and entry['path'].startswith(path+'/') for entry in entries) for path in pointers}
    repo['entries'] = [entry for entry in entries if entry['path'] in pointers or '/' not in entry['path']]
    repo['projection_scope'] = 'Root entries plus exact catalog path pointers; descendant counts and full-tree canonical hash calculated before projection.'
    return repo

if fetch:
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        cache = dict(pool.map(inspect_repo, repositories))
    cache = {name: project_tree(name, repo) for name, repo in cache.items()}
    cache_path.write_text(json.dumps({'schema_version': '1', 'observed_date': '2026-10-19', 'scope': 'Public GitHub API tree and root-license inspection; no authorship or license-attestation claim.', 'repositories': cache}, indent=2) + '\n')
else:
    cache = json.loads(cache_path.read_text())['repositories']
    if refresh_errors:
        for name, prior in list(cache.items()):
            if prior.get('error'):
                _, current = inspect_repo(name)
                current['prior_fetch_error'] = prior['error']
                cache[name] = project_tree(name, current)
        cache_path.write_text(json.dumps({'schema_version': '1', 'observed_date': '2026-10-19', 'scope': 'Public GitHub API tree and root-license inspection; no authorship or license-attestation claim.', 'repositories': cache}, indent=2) + '\n')
    if any('entries' in repo and 'tree_entry_count' not in repo for repo in cache.values()):
        cache = {name: project_tree(name, repo) for name, repo in cache.items()}
        cache_path.write_text(json.dumps({'schema_version': '1', 'observed_date': '2026-10-19', 'scope': 'Public GitHub API tree and root-license inspection; no authorship or license-attestation claim.', 'repositories': cache}, indent=2) + '\n')
rows = []
for item in inventory:
    guidance = item.get('guidance') or ''
    structured = {}
    if 'Structured payload:' in guidance:
        try:
            structured = json.loads(guidance.split('Structured payload:', 1)[1].strip())
        except json.JSONDecodeError:
            pass
    repo = cache.get(item.get('source_repo'))
    pointer = structured.get('path') if isinstance(structured, dict) else None
    match = None
    if repo and not repo.get('error') and pointer:
        path = pointer.rstrip('/')
        entries = repo['entries']
        found = next((entry for entry in entries if entry['path'] == path), None)
        match = {'path': path, 'status': 'found' if found else 'not_found_in_pinned_tree' if not repo['tree_truncated'] else 'not_found_in_truncated_tree',
                 'git_object_sha': found['sha'] if found else None, 'object_type': found['type'] if found else None,
                 'descendant_file_count': repo['descendant_file_counts'].get(path, 0), 'url': f"https://github.com/{repo['canonical_repository']}/tree/{repo['revision']}/{path}"}
    if item['sku'] == 'AWS-0568':
        deliverable = 'original_local_modular_planners_and_self_contained_release_input'
        missing = ['commercial_component_allocation', 'trusted_publication_reviews']
    elif item['sku'] == 'SW-PT-0006':
        deliverable = 'historical_guidance_preserved_and_corrected_python_guidance_draft'
        missing = ['trusted_guidance_and_publication_reviews']
    elif item['status'] == 'retired':
        deliverable, missing = 'retired_historical_record', []
    elif item['sku'].startswith('BUN-'):
        deliverable, missing = 'unassembled_bundle_contract', ['exact_versioned_member_releases', 'member_entitlements_and_provenance']
    elif item['sku'].startswith('SW-RR-'):
        deliverable, missing = 'execution_promise_without_implementation', ['actual_callable_implementation', 'validated_input_and_output_contract', 'failure_and_idempotency_behavior']
    elif item['kind'] == 'artifact':
        deliverable = 'artifact_pointer_without_product_assembly'
        missing = ['curated_runnable_product_files', 'dependency_and_build_manifest', 'original_product_contribution', 'file_license_and_notice_mapping', 'meaningful_validation']
    elif item['kind'] == 'guide':
        deliverable = 'existing_guidance_requires_substantive_source_and_quality_review'
        missing = ['verified_claim_to_source_mapping', 'original_guidance_quality_review']
    else:
        deliverable = 'tool_pointer_without_resolved_invocation_implementation'
        missing = ['reviewed_guidance_or_execution_contract', 'actual_promised_invocation_or_workflow', 'dependency_and_validation_contract']
    rows.append({'sku': item['sku'], 'version_in_snapshot': item['version'], 'status_in_snapshot': item['status'], 'kind_in_snapshot': item['kind'],
                 'legacy_content_hash': item.get('content_hash'), 'guidance_sha256': hashlib.sha256(guidance.encode()).hexdigest(), 'guidance_size_bytes': len(guidance.encode()),
                 'source_repository': item.get('source_repo'), 'source_revision': repo.get('revision') if repo else None, 'source_error': repo.get('error') if repo else None,
                 'structured_pointer': pointer, 'pointer_inspection': match, 'other_pointer_fields': {key: value for key, value in structured.items() if key in ('module', 'npm', 'tool', 'server', 'command')} if isinstance(structured, dict) else {},
                 'observed_deliverable': deliverable, 'remaining_product_input': missing})
report = {'schema_version': '1', 'source_snapshot_sha256': historical['snapshot_sha256'], 'held_file_sha256': hashlib.sha256(inventory_bytes).hexdigest(),
          'source_cache_sha256': hashlib.sha256(cache_path.read_bytes()).hexdigest(), 'generator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'scope': 'Complete held corpus plus pinned public upstream tree inspection. A found source path is not a delivered product, applicable license determination, publication approval, or an external execution result.',
          'counts': {'records': len(rows), 'repositories': len(repositories), 'repositories_inspected': sum(not entry.get('error') for entry in cache.values()),
                     'source_paths_found': sum(row['pointer_inspection'] is not None and row['pointer_inspection']['status'] == 'found' for row in rows),
                     'source_paths_not_found': sum(row['pointer_inspection'] is not None and row['pointer_inspection']['status'].startswith('not_found') for row in rows)}, 'records': rows}
(root / 'corpus-source-inspection.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report['counts']))
