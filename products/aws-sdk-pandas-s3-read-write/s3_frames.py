import awswrangler as wr
import pandas as pd

def write_parquet(frame: pd.DataFrame, uri: str, *, dataset: bool = False):
    if not uri.startswith('s3://'):
        raise ValueError('uri must use s3://')
    return wr.s3.to_parquet(df=frame, path=uri, dataset=dataset, index=False)

def read_parquet(uri: str) -> pd.DataFrame:
    if not uri.startswith('s3://'):
        raise ValueError('uri must use s3://')
    return wr.s3.read_parquet(path=uri)
