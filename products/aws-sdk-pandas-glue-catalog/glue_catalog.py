import awswrangler as wr
import pandas as pd

def write_catalogued_dataset(frame: pd.DataFrame, *, path: str, database: str, table: str, mode: str = 'append'):
    if not path.startswith('s3://'):
        raise ValueError('path must use s3://')
    if mode not in {'append', 'overwrite', 'overwrite_partitions'}:
        raise ValueError('unsupported write mode')
    return wr.s3.to_parquet(
        df=frame, path=path, dataset=True, database=database, table=table,
        mode=mode, index=False, sanitize_columns=True,
    )
