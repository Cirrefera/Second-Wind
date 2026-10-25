"""Perform actual Knowledge Base retrieval and expose only result count."""
import json, sys
from knowledge_base import retrieve
try:
    c=json.load(sys.stdin); response=retrieve(knowledge_base_id=c['knowledge_base_id'],query=c['query'],region=c.get('region'),number_of_results=c.get('number_of_results',5))
    print(json.dumps({'ok':True,'status':'retrieval_complete','result_count':len(response.get('retrievalResults',[]))}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['knowledge_base_retrieval_failed']})); raise SystemExit(2)
