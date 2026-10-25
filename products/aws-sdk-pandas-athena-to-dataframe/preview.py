"""Execute the package's real Athena SELECT and emit bounded DataFrame dimensions only."""
import json, os, sys
from athena_query import read_query
try:
    cfg=json.load(sys.stdin)
    os.environ['ATHENA_DATABASE']=cfg['database']; os.environ['ATHENA_S3_OUTPUT']=cfg['s3_output']
    if cfg.get('workgroup'): os.environ['ATHENA_WORKGROUP']=cfg['workgroup']
    frame=read_query(cfg['sql'])
    print(json.dumps({'ok':True,'status':'query_complete','row_count':int(len(frame)),'column_count':int(len(frame.columns))}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['athena_query_failed']})); raise SystemExit(2)
