# chalice-automatic-iam-policy-generator

Use Chalice's source analyzer to derive deployment permissions. Run `chalice gen-policy > .chalice/policy.json` in the application directory and review every generated action and resource before deployment. Static source analysis does not establish runtime least privilege.

This package contains `app.py` as the product entrypoint, a strict configuration schema, pinned Python dependencies, and a separate private `preview.py`. Set `language` to `python`. After installing `requirements.txt` in an isolated environment, provide the preview one JSON configuration on stdin, for example `{"language":"python"}`.

The preview calls the same real Chalice analyzer and policy builder used by `chalice gen-policy`, without starting a subprocess or executing `app.py`. It supplies an isolated Botocore session with inert offline credential placeholders, disables SDK configuration/credential files, and rejects attempted SDK sends. The SDK is used only for local method-to-API metadata. No AWS API call, account credential, deployment, or application execution is involved.

Only policy/action counts and stable diagnostic codes are returned. Application source and the generated policy remain private. Hosted Python dependency integration is still required before this preview can be offered as a paid trial; local native execution alone does not make it available in the gateway.

Upstream: https://github.com/aws/chalice/tree/702dc5e198b8c84ce09b08dc8409130b57d50819
