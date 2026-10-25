import api from './api.js';

// Invoke the actual pinned API Builder router. No AWS credentials or network.
export async function preview({configuration}) {
  if(configuration?.language!=='javascript')
    return {ok:false,status:'blocked',diagnostic_codes:['configuration_invalid']};
  const request={requestContext:{resourcePath:'/resources/{id}',httpMethod:'GET'},
    pathParameters:{id:'private-preview'},headers:{}};
  const response=await new Promise((resolve,reject)=>{
    const context={done:(error,result)=>error?reject(error):resolve(result)};
    Promise.resolve(api.proxyRouter(request,context)).catch(reject);
  });
  const ok=response.statusCode===200;
  return {ok,status:ok?'complete':'blocked',route_count:1,verification_count:1,
    diagnostic_codes:['local_fixture_only']};
}
