"""Read an actual Parquet object/dataset and report dimensions, never records."""
import json, sys
from s3_frames import read_parquet
try:
    cfg=json.load(sys.stdin); frame=read_parquet(cfg['s3_uri'])
    print(json.dumps({'ok':True,'status':'s3_read_complete','row_count':int(len(frame)),'column_count':int(len(frame.columns))}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['s3_read_failed']})); raise SystemExit(2)
