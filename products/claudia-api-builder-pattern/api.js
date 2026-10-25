'use strict';
const ApiBuilder = require('claudia-api-builder');
const api = new ApiBuilder();
api.get('/resources/{id}', async (request) => {
  if (!request.pathParams.id) return {statusCode:400,body:{error:'id_required'}};
  return {id:request.pathParams.id};
});
api.post('/resources', async (request) => {
  const body=request.body;
  if (!body || typeof body.name !== 'string' || !body.name.trim()) return {statusCode:400,body:{error:'name_required'}};
  return {statusCode:201,body:{name:body.name.trim()}};
});
module.exports = api;
