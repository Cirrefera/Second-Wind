/**
 * Compatibility adapter for a file-routed Pages build. Production uses
 * src/worker.js as an advanced-mode entry point, which ignores /functions.
 */
import pagesWorker from "../src/worker.js";

export function onRequest({ request, env }) {
  return pagesWorker.fetch(request, env);
}
