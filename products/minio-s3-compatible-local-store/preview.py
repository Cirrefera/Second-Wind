"""Check readiness of an already running local MinIO server; does not start containers."""
import json, os, urllib.error, urllib.request
url = os.environ.get('MINIO_ENDPOINT', 'http://127.0.0.1:9000').rstrip('/') + '/minio/health/ready'
try:
    with urllib.request.urlopen(url, timeout=2) as response:
        ready = response.status == 200
    print(json.dumps({'ok': ready, 'status': 'service_ready' if ready else 'blocked', 'diagnostic_codes': [] if ready else ['minio_not_ready']}))
    raise SystemExit(0 if ready else 2)
except (urllib.error.URLError, TimeoutError, OSError):
    print(json.dumps({'ok': False, 'status': 'blocked', 'diagnostic_codes': ['minio_service_unreachable']}))
    raise SystemExit(2)
