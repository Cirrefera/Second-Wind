"""Execute the package's real Redshift SELECT and emit dimensions only."""
import json, os, sys
from redshift import read_rows
try:
    cfg=json.load(sys.stdin)
    for key in ('host','database','user'): os.environ['REDSHIFT_'+key.upper()]=cfg[key]
    os.environ['REDSHIFT_PORT']=str(cfg.get('port',5439))
    frame=read_rows(cfg['sql'])
    print(json.dumps({'ok':True,'status':'query_complete','row_count':int(len(frame)),'column_count':int(len(frame.columns))}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['redshift_query_failed']})); raise SystemExit(2)
