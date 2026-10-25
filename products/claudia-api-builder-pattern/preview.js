'use strict';
// Runs the actual Claudia API Builder proxyRouter locally with an API Gateway-shaped request.
// The response body is inspected only for its byte length and is never emitted.
const api = require('./api');
const request = {
  requestContext: {resourcePath: '/resources/{id}', httpMethod: 'GET'},
  pathParameters: {id: process.env.PREVIEW_RESOURCE_ID || 'preview'},
  headers: {},
};
api.proxyRouter(request, {}).then((response) => {
  const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? null);
  console.log(JSON.stringify({ok: response.statusCode === 200, status: 'route_invoked', response_bytes: Buffer.byteLength(body)}));
  if (response.statusCode !== 200) process.exitCode = 2;
}).catch(() => {
  console.log(JSON.stringify({ok: false, status: 'blocked', diagnostic_codes: ['api_builder_route_failed']}));
  process.exitCode = 2;
});
