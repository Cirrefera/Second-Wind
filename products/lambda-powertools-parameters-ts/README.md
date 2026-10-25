# Powertools Parameters for Lambda (TypeScript/JavaScript)

Fetch SSM Parameter Store values or Secrets Manager secrets through the actual Powertools Parameters providers, with an explicit per-container cache age.

## Install and use

Install exact direct versions from `package.json`, then run Node.js 20 or newer in Lambda. Powertools Parameters requires the corresponding AWS SDK v3 service clients. The Lambda execution role needs the least-privilege `ssm:GetParameter` and/or `secretsmanager:GetSecretValue` actions; SecureString also needs the applicable KMS decrypt permission.

```js
import { readSsmParameter, readSecret } from './src/parameters.mjs';

const featureFlags = await readSsmParameter('/orders/feature-flags', {
  max_age_seconds: 30,
  transform: 'json',
});
const signingKey = await readSecret('orders/signing-key', { max_age_seconds: 5 });
```

The default cache is in-process and does not coordinate across Lambda environments. A fleet of cold starts can still make concurrent service calls. Choose a cache age that fits the value's rotation and consistency needs. Do not log the returned secret.

## Hosted preview and boundary

Hosted preview is unavailable because the gateway cannot execute this package's native Powertools/AWS SDK dependencies with an AWS identity. It does not fetch from SSM or Secrets Manager or claim cache hits.

## Files and source

Original integration code is Apache-2.0. Powertools Parameters 2.36.0 is MIT-0; the pinned repository revision and published package integrity are in `source-provenance.json`.
