# chalice-automatic-iam-policy-generator

Use Chalice’s own source analyzer to derive deployment permissions: `chalice gen-policy` reads the application and writes `.chalice/policy.json`; inspect every generated action and resource before deployment. This product does not claim that static source analysis proves runtime least privilege.

This package contains `app.py` as the product entrypoint, a strict configuration schema, pinned Python dependencies, and a separate private `preview.py`. Set the explicit `language` configuration to `python`. Run the preview in an isolated environment after installing `requirements.txt`; provide one JSON configuration object on stdin, for example `{"language":"python"}`. It invokes `chalice gen-policy` against a temporary copy with AWS credentials and SDK configuration removed and IMDS disabled. It returns only bounded policy statement/action counts and stable diagnostic codes; generated policy and source are never returned. It does not call AWS or deploy.

The current Workers sandbox cannot execute Python subprocesses, so the preview is unavailable there and is not advertised as a supported paid sandbox preview. The product entrypoint is `app.py`; run `chalice gen-policy` in the application directory to produce a policy for review. The private preview reads a JSON configuration from stdin, runs that command in a temporary directory with a minimal environment, and returns only policy action and statement counts. The product workflow requires a Python runtime with Chalice installed.

Upstream: https://github.com/aws/chalice/tree/702dc5e198b8c84ce09b08dc8409130b57d50819

Use Chalice’s own source analyzer to derive deployment permissions: `chalice gen-policy` reads the application and writes `.chalice/policy.json`; inspect every generated action and resource before deployment. This product does not claim that static source analysis proves runtime least privilege.
