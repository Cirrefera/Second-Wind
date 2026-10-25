"""Call the actual local AgentCore SDK app entrypoint; model calls use configured real provider credentials."""
import json, sys
from agent_app import invoke
try:
    c=json.load(sys.stdin); result=invoke({'prompt':c['prompt']})
    text=result.get('result','') if isinstance(result,dict) else str(result)
    print(json.dumps({'ok':True,'status':'agent_invocation_complete','response_char_count':min(len(text),65536)}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['agent_runtime_invoke_failed']})); raise SystemExit(2)
