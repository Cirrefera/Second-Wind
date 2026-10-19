/**
 * Pages advanced-mode entry point, bundled to public/_worker.js.
 *
 * The gateway owns discovery, payments, grants, execution and delivery. Pages
 * forwards those requests through its private service binding and serves the
 * remaining static assets. There is no payment or purchase state in this file.
 *
 * Return the gateway Response unchanged: rebuilding it would lose Cloudflare's
 * webSocket property and break Cap'n Web upgrades.
 */
const GATEWAY_PATHS = new Set([
  "/openapi.json",
  "/.well-known/x402",
  "/llms.txt",
  "/v2/x402/discovery/resources",
  "/discovery/resources",
  "/health",
]);

export function routesToGateway(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/rpc" ||
    pathname.startsWith("/rpc/") ||
    pathname === "/capnp" ||
    pathname.startsWith("/capnp/") ||
    GATEWAY_PATHS.has(pathname)
  );
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (routesToGateway(pathname)) {
      if (!env.GATEWAY) {
        return Response.json(
          { error: "gateway_not_configured", retryable: true },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      return env.GATEWAY.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
