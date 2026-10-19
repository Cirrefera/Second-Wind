/**
 * Proxy POST /rpc to the unified secondwind-gateway Worker.
 * The Worker serves x402-gated Code Mode execution at /rpc.
 * Pages cannot bind to the Worker, so we proxy via HTTPS.
 */
const WORKER_URL = "https://secondwind-gateway.mchayes89.workers.dev";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const workerUrl = `${WORKER_URL}/rpc${url.search}`;
  
  try {
    const response = await fetch(workerUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "worker_unreachable" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
