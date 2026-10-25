# Node.js Lambda Deployment Kit

A Node.js Lambda handler with a health route, pinned deployment tooling, and explicit create and update commands. Deployment runs in the buyer’s AWS account.

Select `language: "javascript"` explicitly in the package configuration.

## Private preview

`preview.mjs` invokes the supplied Lambda handler’s health route and missing-route response. The preview returns bounded status and counts; it does not deploy AWS resources. Hosted runtime publication is pending, and trial admission remains disabled until that release is ready.

## Use

Run `npm ci` to install the exact dependency tree recorded in `package-lock.json`. Review `app.js` and `selection.schema.json`, then use the supplied deployment configuration in your own AWS account. Provide credentials through your local SDK credential chain. Never submit credentials in a marketplace preview request.

Add an authorizer or API resource policy, request limits, and application authorization before handling real user data. Deployment may create or change AWS resources and incur charges.

## Dependencies and attribution

The package currently declares Node.js 18.x and uses Claudia 5.14.1. The lockfile pins transitive dependencies. The integration code is original Second Wind work based on these documented interfaces:

- https://github.com/claudiajs/claudia
- https://claudiajs.com/tutorials/deploying.html

See `LICENSE` and the dependency licenses. Source review and hosted execution evidence are separate from verification of a buyer AWS deployment.
