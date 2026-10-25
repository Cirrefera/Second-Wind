# chalice-rest-api-decorator-pattern

An AWS Chalice REST API route with the built-in IAM authorizer. Clients of the deployed API must sign requests with AWS Signature Version 4. The handler validates path input and defines its HTTP method and CORS behavior explicitly.

This package contains `app.py`, a strict configuration schema, pinned Python dependencies, and a separate private `preview.py`. Set `language` to `python`. After installing `requirements.txt` in an isolated environment, provide the preview one JSON configuration on stdin, for example `{"language":"python"}`.

The preview loads the actual purchased Chalice application and passes synthetic API Gateway events through its real routing and handler code. It checks a valid resource identifier and an oversized identifier, returning only route and verification counts. Response bodies and product source remain private. It does not start subprocesses, construct AWS clients, package infrastructure, or deploy resources.

This local execution does not verify API Gateway's IAM authorization or AWS deployment. Hosted Python dependency integration is still required before the gateway can offer the preview as a paid trial.

Upstream: https://github.com/aws/chalice/tree/702dc5e198b8c84ce09b08dc8409130b57d50819
