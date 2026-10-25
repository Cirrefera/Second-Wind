import os
import boto3
from chalice import Chalice

app = Chalice(app_name="policy-analysis")

@app.route("/objects/{key}", methods=["GET"], cors=False)
def get_object(key):
    bucket = os.environ["ASSET_BUCKET"]
    s3 = boto3.client("s3")
    response = s3.get_object(Bucket=bucket, Key=key)
    return {"content_type": response.get("ContentType", "application/octet-stream"), "content_length": response.get("ContentLength", 0)}
