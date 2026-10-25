import app from './app.js';

// Exercise this package's real Lambda handler without deploying resources.
export async function preview({configuration}) {
  if(configuration?.language!=='javascript'||configuration.api_module!=='app')
    return {ok:false,status:'blocked',diagnostic_codes:['configuration_invalid']};
  const health=await app.handler({httpMethod:'GET',path:'/health'});
  const missing=await app.handler({httpMethod:'GET',path:'/missing'});
  const ok=health.statusCode===200&&JSON.parse(health.body).status==='ok'&&missing.statusCode===404;
  return {ok,status:ok?'complete':'blocked',route_count:1,verification_count:2,
    diagnostic_codes:['local_fixture_only']};
}
