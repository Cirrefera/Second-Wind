/**
 * Compatibility adapter for a file-routed Pages build. Return the service
 * binding Response unchanged so Cap'n Web WebSocket upgrades are preserved.
 * Production dispatch lives in src/worker.js (Pages advanced mode).
 */
import pagesWorker from "../src/worker.js";

export function onRequest({ request, env }) {
  return pagesWorker.fetch(request, env);
}
