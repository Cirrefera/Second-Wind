"""Write caller-supplied records through the real awswrangler S3/Glue integration."""
import json, sys
import pandas as pd
from glue_catalog import write_catalogued_dataset
try:
    cfg=json.load(sys.stdin); rows=cfg['rows']
    if not isinstance(rows,list) or not rows or not all(isinstance(row,dict) for row in rows): raise ValueError()
    frame=pd.DataFrame(rows)
    result=write_catalogued_dataset(frame,path=cfg['path'],database=cfg['database'],table=cfg['table'],mode=cfg.get('mode','append'))
    files=result.get('paths',[]) if isinstance(result,dict) else []
    print(json.dumps({'ok':True,'status':'catalog_write_complete','row_count':int(len(frame)),'column_count':int(len(frame.columns)),'file_count':len(files)}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['glue_catalog_write_failed']})); raise SystemExit(2)
