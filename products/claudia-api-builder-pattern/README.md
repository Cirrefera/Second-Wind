# Node.js Resource API Kit

A Node.js resource API with GET and POST routes, request validation, and an API Gateway-ready Lambda export.

Select `language: "javascript"` explicitly in the package configuration.

## Private preview

`preview.mjs` invokes the supplied API module’s GET resource route through the actual SDK router. The preview returns bounded status and counts; it does not deploy AWS resources. Hosted runtime publication is pending, and trial admission remains disabled until that release is ready.

## Use

Run `npm ci` to install the exact dependency tree recorded in `package-lock.json`. Review `api.js` and `selection.schema.json`, then use the supplied deployment configuration in your own AWS account. Provide credentials through your local SDK credential chain. Never submit credentials in a marketplace preview request.

Add an authorizer or API resource policy, request limits, and application authorization before handling real user data. Deployment may create or change AWS resources and incur charges.

## Dependencies and attribution

The package currently declares Node.js 18.x and uses claudia-api-builder 4.1.2. The lockfile pins transitive dependencies. The integration code is original Second Wind work based on these documented interfaces:

- https://github.com/claudiajs/claudia-api-builder
- https://github.com/claudiajs/claudia-api-builder/blob/master/docs/api.md

See `LICENSE` and the dependency licenses. Source review and hosted execution evidence are separate from verification of a buyer AWS deployment.
