# chalice-rest-api-decorator-pattern

An AWS Chalice REST API route using the built-in IAM authorizer. Route authorization is attached per `@app.route`; clients must sign requests with AWS Signature Version 4. The handler validates path input and demonstrates explicit method and CORS choices.

This package contains `app.py` as the product entrypoint, a strict configuration schema, pinned Python dependencies, and a separate private `preview.py`. Set the explicit `language` configuration to `python`. Run the preview in an isolated environment after installing `requirements.txt`; provide one JSON configuration object on stdin, for example `{"language":"python"}`. It invokes Chalice packaging against a temporary copy with AWS credentials and SDK configuration removed and IMDS disabled. It returns a bounded success status, generated CloudFormation resource count when available, and stable diagnostic codes; generated templates and source are never returned. It does not call AWS or deploy.

The current Workers sandbox cannot execute Python subprocesses, so the preview is unavailable there and is not advertised as a supported paid sandbox preview. The product workflow requires a Python runtime with Chalice installed.

Upstream: https://github.com/aws/chalice/tree/702dc5e198b8c84ce09b08dc8409130b57d50819

An AWS Chalice REST API route using the built-in IAM authorizer. Route authorization is attached per `@app.route`; clients must sign requests with AWS Signature Version 4. The handler validates path input and demonstrates explicit method and CORS choices.
