"""Query an existing AgentCore memory and emit only the number of matched records."""
import json, sys
from memory_lifecycle import recall
try:
    c=json.load(sys.stdin); response=recall(memory_id=c['memory_id'],namespace=c['namespace'],query=c['query'],region=c.get('region'))
    print(json.dumps({'ok':True,'status':'memory_retrieval_complete','record_count':len(response.get('memoryRecords',[]))}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['memory_retrieval_failed']})); raise SystemExit(2)
