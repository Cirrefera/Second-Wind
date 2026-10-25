# bedrock-knowledge-base-cdk

Creates a Bedrock vector knowledge base using Titan Text Embeddings V2 (1024 dimensions). It supports the upstream OpenSearch Serverless default, Pinecone, and Aurora PostgreSQL vector stores. An optional imported S3 bucket is attached as a data source.

## Runtime and synthesis

Requires Node.js 20 or later, Docker for the CDK OpenSearch index custom-resource asset, and the exact npm dependencies in `package.json` and `package-lock.json`. Run `npm ci`, then `npm run synth -- ./config.json` (or omit the argument to use the example configuration). This performs local AWS CDK synthesis only; it does not call AWS or deploy resources. A later deployment runs in your AWS account and may create billable OpenSearch Serverless and Bedrock resources. Review the template, account, Region, IAM scope, quotas, data retention, networking, and cost before deployment.

Hosted bounded preview is unavailable for this product because the private Worker runtime cannot load external CDK/npm modules or native Node APIs. Trial access must be rejected before charge.

## Configuration

`config.schema.json` defines accepted fields; `config.example.json` is a starting point. `vector_store` accepts `OpenSearchServerless`, `Pinecone`, or `AuroraPostgres`. OpenSearch Serverless uses the upstream default collection and index and needs Docker for provider bundling. Pinecone requires an existing index endpoint and a Secrets Manager ARN containing its API key. AuroraPostgres uses the upstream construct to create an Aurora PostgreSQL Serverless v2 cluster, isolated VPC and vector extension resources; deployment can incur substantial ongoing charges. Select the single `stack` component in `selection.schema.json`.

## Product files

- `product.mjs` constructs the real AWS CDK resources.
- `preview.mjs` runs that construct through a trusted native Node synthesizer and returns only status, selected component, and resource count; it is not supported by the hosted Worker runtime.
- `synth.mjs` runs local synthesis.
- `validation.json` records that local synthesis was blocked because Docker is unavailable in the authoring environment; it does not attest to AWS execution or deployment.
- `package.json` and `package-lock.json` pin dependencies.
- `source-provenance.json` records upstream references and adaptations.

## Provenance and license

Original Second Wind wiring around the pinned `VectorKnowledgeBase` API and its OpenSearch Serverless, Pinecone, and Aurora PostgreSQL backends; no upstream implementation source is copied into this package. Local synthesis was verified for Pinecone. OpenSearch and Aurora synthesis require Docker to bundle upstream custom-resource assets, which was unavailable in the authoring environment; those paths have not been runtime-verified here.

Apache-2.0 terms are included in `LICENSE`.
