# Second Wind Unified Gateway Worker

Single application Worker serving HTTP/x402 and Cap'n Web.

## Deployment
Deployed via `~/workspace/second-wind/deploy/deploy_worker.py`:
```
python3 deploy_worker.py secondwind-gateway workers/gateway/dist/worker.js workers/gateway/metadata.json
```

## Build
```
cd workers/gateway
npm ci
npx esbuild src/index.js --bundle --format=esm --platform=neutral \
  --external:node:* --external:cloudflare:workers \
  --external:axios --external:form-data --external:https-proxy-agent \
  --outfile=dist/worker.js
```

## Secrets (set via wrangler secret put, NEVER in source)
- X402_PAY_TO: Base wallet for x402 payments
- CDP_FACILITATOR_KEY: CDP facilitator JSON key

## Bindings
- LOADER: worker_loader (DynamicWorkerExecutor)
- SW_DB: d1 (second-wind-catalog)
