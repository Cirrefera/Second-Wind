"""Invoke an existing Bedrock Agent; do not create account resources or emit model text."""
import json, sys
from agent_action_group import invoke
try:
    c=json.load(sys.stdin); response=invoke(agent_id=c['agent_id'],alias_id=c['alias_id'],session_id=c['session_id'],prompt=c['prompt'],region=c.get('region'))
    count=0
    for event in response.get('completion',[]):
        chunk=event.get('chunk',{}).get('bytes',b'')
        count += len(chunk)
        if count > 65536: break
    print(json.dumps({'ok':True,'status':'agent_invocation_complete','response_bytes':count}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['bedrock_agent_invoke_failed']})); raise SystemExit(2)
