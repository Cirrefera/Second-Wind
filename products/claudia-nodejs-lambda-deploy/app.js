'use strict';
// Claudia's --api-module entry point: export an AWS Lambda handler.
exports.handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod;
  const path = event?.rawPath || event?.path || '/';
  if (method === 'GET' && path === '/health') return {statusCode:200,body:JSON.stringify({status:'ok'})};
  return {statusCode:404,body:JSON.stringify({error:'not_found'})};
};
