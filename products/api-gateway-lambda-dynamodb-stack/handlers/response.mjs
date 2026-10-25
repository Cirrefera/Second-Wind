export function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN,
      'Vary': 'Origin',
    },
    body: body === '' ? '' : JSON.stringify(body),
  };
}
