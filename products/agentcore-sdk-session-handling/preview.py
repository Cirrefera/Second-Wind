"""Invoke an existing AgentCore runtime session and expose only bounded byte count."""
import json, sys
from sessions import invoke
try:
    c=json.load(sys.stdin); response=invoke(runtime_arn=c['runtime_arn'],session_id=c['session_id'],payload=c['payload'],region=c.get('region'))
    count=0
    stream=response.get('response')
    if stream is not None:
        for chunk in stream.iter_chunks(chunk_size=16384):
            count += len(chunk)
            if count >= 65536: count=65536; break
    print(json.dumps({'ok':True,'status':'runtime_invocation_complete','response_bytes':count}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['agentcore_session_invoke_failed']})); raise SystemExit(2)
