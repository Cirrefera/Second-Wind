#!/usr/bin/env node
/** Read-only production acceptance. Never calls a paid URL or creates a quote. */
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { NETWORK, USDC, isBurnAddress, sameAddress } from "../workers/gateway/src/contracts.js";

const ORIGIN = "https://secondwindai.com";
const PROJECT = "second-wind";
const PATHS = {
  health: "/health",
  proof: "/api/proof",
  catalog: "/api/tools",
  discovery: "/v2/x402/discovery/resources",
};

export class AcceptanceError extends Error {
  constructor(code, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

function requireCheck(condition, code, retryable = false) {
  if (!condition) throw new AcceptanceError(code, retryable);
}

/** The expected address is an independently reviewed release input, not wallet-ownership proof. */
export function releaseConfig(env) {
  requireCheck(/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA || ""), "expected_commit_required");
  requireCheck(/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || ""), "cloudflare_account_required");
  requireCheck(typeof env.CLOUDFLARE_API_TOKEN === "string" && env.CLOUDFLARE_API_TOKEN.trim(), "cloudflare_token_required");
  requireCheck(/^0x[\da-f]{40}$/i.test(env.X402_EXPECTED_PAY_TO || "")
    && !isBurnAddress(env.X402_EXPECTED_PAY_TO), "independently_verified_recipient_required");
  return {
    expectedCommit: env.GITHUB_SHA.toLowerCase(),
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    expectedRecipient: env.X402_EXPECTED_PAY_TO,
    origin: ORIGIN,
    project: PROJECT,
  };
}

async function readJson(fetchImpl, url, label, headers, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json", "Cache-Control": "no-cache", ...headers },
    });
  } catch {
    // Upstream exceptions and response bodies may contain sensitive values.
    throw new AcceptanceError(`${label}_request_failed`, true);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new AcceptanceError(`${label}_invalid_json`, response.status >= 500); }
  return { status: response.status, body, headers: response.headers };
}

function assertHttp(result, name) {
  requireCheck(result.status === 200, `${name}_http_${result.status}`,
    result.status === 429 || result.status >= 500);
  requireCheck(result.body && typeof result.body === "object" && !Array.isArray(result.body), `${name}_invalid_document`);
}

export function validateRelease(config, responses) {
  const { pages, health, proof, catalog, discovery } = responses;
  assertHttp(pages, "pages");
  requireCheck(pages.body.success === true, "pages_api_rejected");
  const project = pages.body.result;
  const deployment = project?.canonical_deployment;
  requireCheck(project?.name === config.project && project.production_branch === "main", "pages_project_mismatch");
  requireCheck(project.domains?.includes(new URL(config.origin).hostname), "pages_domain_missing");
  requireCheck(deployment?.environment === "production"
    && deployment.project_name === config.project && deployment.id, "pages_production_deployment_missing", true);
  requireCheck(deployment.latest_stage?.name === "deploy"
    && deployment.latest_stage.status === "success", "pages_deployment_not_successful", true);
  const metadata = deployment.deployment_trigger?.metadata;
  requireCheck(metadata?.branch === "main" && metadata?.commit_dirty === false, "pages_release_source_mismatch");
  requireCheck(metadata?.commit_hash === config.expectedCommit, "pages_commit_mismatch", true);

  assertHttp(health, "health");
  requireCheck(health.body.ok === true && health.body.worker === "secondwind-gateway"
    && health.body.mode === "unified" && health.body.network === NETWORK, "health_not_healthy");
  const version = health.body.deployment;
  requireCheck(typeof version?.id === "string" && version.id.length > 0, "gateway_version_missing");
  requireCheck(version.tag === config.expectedCommit, "gateway_commit_mismatch", true);

  // A well-formed 503 configuration failure is terminal for this release.
  const payment = proof.body?.payment;
  if (proof.status === 503 && payment && ["payTo_configured", "payment_recipient_configured",
    "payment_recipient_verified", "facilitator_configured"].some(key => payment[key] === false)) {
    throw new AcceptanceError("payment_configuration_unavailable");
  }
  assertHttp(proof, "proof");
  requireCheck(proof.body.service === "Second Wind" && proof.body.status === "ready", "proof_not_ready");
  requireCheck(["payTo_configured", "payment_recipient_configured", "payment_recipient_verified",
    "facilitator_configured"].every(key => payment?.[key] === true), "payment_configuration_unavailable");
  requireCheck(payment.rail === "x402" && payment.x402Version === 2
    && payment.network === NETWORK && payment.asset === "USDC", "payment_rail_mismatch");
  requireCheck(["database", "commerce_schema", "payload_store", "delivery_store"]
    .every(key => proof.body.dependencies?.[key] === true), "proof_dependency_unavailable");

  assertHttp(catalog, "catalog");
  assertHttp(discovery, "discovery");
  for (const [name, response] of Object.entries({ health, proof, catalog, discovery })) {
    requireCheck(response.headers.get("X-Worker-Version") === version.id, `${name}_gateway_version_mismatch`, true);
  }
  const tools = catalog.body.tools;
  const items = discovery.body.items;
  requireCheck(Array.isArray(tools) && tools.length > 0 && catalog.body.total_live === tools.length
    && proof.body.tools_live === tools.length, "live_catalog_unavailable");
  requireCheck(discovery.body.x402Version === 2 && discovery.body.payment_configured === true,
    "discovery_payment_unavailable");
  requireCheck(Array.isArray(items) && items.length === tools.length, "discovery_catalog_mismatch");
  const seen = new Set();
  for (const item of items) {
    const tool = tools.find(candidate => candidate.sku === item.sku && candidate.version === item.version);
    requireCheck(tool && !seen.has(item.sku), "discovery_product_mismatch");
    seen.add(item.sku);
    requireCheck(item.resource === tool.url && item.method === tool.method
      && item.type === "http" && item.x402Version === 2, "discovery_resource_mismatch");
    let resource;
    try { resource = new URL(item.resource); } catch { throw new AcceptanceError("discovery_resource_mismatch"); }
    requireCheck(resource.origin === config.origin && resource.pathname.startsWith("/api/x402/"), "discovery_resource_mismatch");
    requireCheck(Array.isArray(item.accepts) && item.accepts.length === 1, "discovery_requirements_unavailable");
    const requirement = item.accepts[0];
    requireCheck(requirement?.scheme === "exact" && requirement.network === NETWORK
      && sameAddress(requirement.asset, USDC), "discovery_rail_mismatch");
    requireCheck(sameAddress(requirement.payTo, config.expectedRecipient), "discovery_recipient_mismatch");
    requireCheck(typeof requirement.amount === "string" && /^[1-9]\d*$/.test(requirement.amount)
      && requirement.amount === tool.price_usdc_micros, "discovery_amount_mismatch");
    requireCheck(Number.isSafeInteger(requirement.maxTimeoutSeconds) && requirement.maxTimeoutSeconds > 0
      && requirement.extra?.name === "USD Coin" && requirement.extra?.version === "2", "discovery_requirements_invalid");
  }
  return {
    accepted: true, expected_commit: config.expectedCommit, gateway_version: version.id,
    pages_deployment: deployment.id, origin: config.origin, live_products: tools.length,
    funded_purchase_verified: false,
  };
}

export async function acceptRelease(config, {
  fetchImpl = fetch, sleepImpl = sleep, onRetry = () => {}, attempts = 6, delayMs = 5000, timeoutMs = 10000,
} = {}) {
  requireCheck(Number.isSafeInteger(attempts) && attempts >= 1 && attempts <= 6, "invalid_retry_limit");
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const requests = [
        ["pages", `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${config.project}`,
          { Authorization: `Bearer ${config.apiToken}` }],
        ...Object.entries(PATHS).map(([name, path]) => [name, `${config.origin}${path}`, {}]),
      ];
      const results = await Promise.all(requests.map(async ([name, url, headers]) =>
        [name, await readJson(fetchImpl, url, name, headers, timeoutMs)]));
      return validateRelease(config, Object.fromEntries(results));
    } catch (error) {
      const safeError = error instanceof AcceptanceError ? error : new AcceptanceError("acceptance_failed");
      if (!safeError.retryable || attempt === attempts) throw safeError;
      onRetry({ attempt, attempts, reason: safeError.code });
      await sleepImpl(delayMs);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = releaseConfig(process.env);
    requireCheck(process.argv.slice(2).every(arg => arg === "--check-inputs"), "unknown_argument");
    if (process.argv.includes("--check-inputs")) {
      console.log("Release acceptance inputs are present; no network requests made.");
    } else {
      console.log(JSON.stringify(await acceptRelease(config, {
        onRetry: result => console.log(JSON.stringify({ release_acceptance_retry: result })),
      })));
    }
  } catch (error) {
    console.error(`Release acceptance failed: ${error instanceof AcceptanceError ? error.code : "acceptance_failed"}`);
    process.exitCode = 1;
  }
}
