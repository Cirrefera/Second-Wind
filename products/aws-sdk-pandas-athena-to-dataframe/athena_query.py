import os
import awswrangler as wr

def read_query(sql: str):
    if not sql.strip().lower().startswith(('select ', 'with ')):
        raise ValueError('Only SELECT or WITH queries are accepted by this helper')
    return wr.athena.read_sql_query(
        sql=sql,
        database=os.environ['ATHENA_DATABASE'],
        s3_output=os.environ['ATHENA_S3_OUTPUT'],
        workgroup=os.getenv('ATHENA_WORKGROUP', 'primary'),
        ctas_approach=False,
    )

if __name__ == '__main__':
    frame = read_query('SELECT 1 AS ready')
    print(frame.to_json(orient='records'))
