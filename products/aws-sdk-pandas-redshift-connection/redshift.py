import os
import awswrangler as wr

def connect():
    # Uses the boto3 credential chain; never place passwords in source.
    return wr.redshift.connect(
        host=os.environ['REDSHIFT_HOST'],
        database=os.environ['REDSHIFT_DATABASE'],
        user=os.environ['REDSHIFT_USER'],
        password=os.environ['REDSHIFT_PASSWORD'],
        port=int(os.getenv('REDSHIFT_PORT', '5439')),
    )

def read_rows(sql: str):
    if not sql.strip().lower().startswith(('select ', 'with ')):
        raise ValueError('Only SELECT or WITH queries are accepted by this helper')
    with connect() as con:
        return wr.redshift.read_sql_query(sql=sql, con=con)
