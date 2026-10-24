import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AcceptanceError, releaseConfig, validateRelease, acceptRelease } from "./release-acceptance.mjs";

const env = {
  GITHUB_SHA: "a".repeat(40), CLOUDFLARE_ACCOUNT_ID: "b".repeat(32),
  CLOUDFLARE_API_TOKEN: "offline-token-do-not-log", X402_EXPECTED_PAY_TO: `0x${"1".repeat(40)}`,
};
const config = releaseConfig(env);
const version = "11111111-1111-4111-8111-111111111111";
const network = "eip155:8453";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913";
const resource = "https://secondwindai.com/api/x402/fixture-tool";

function response(body, status = 200) {
  return { status, body, headers: new Headers({ "X-Worker-Version": version }) };
}

function fixture() {
  return {
    pages: response({ success: true, result: {
      name: "second-wind", production_branch: "main", domains: ["secondwindai.com"],
      canonical_deployment: { id: "fixture-pages-deployment", project_name: "second-wind", environment: "production",
        latest_stage: { name: "deploy", status: "success" },
        deployment_trigger: { metadata: { branch: "main", commit_hash: env.GITHUB_SHA, commit_dirty: false } } },
    } }),
    health: response({ ok: true, worker: "secondwind-gateway", mode: "unified", network,
      deployment: { id: version, tag: env.GITHUB_SHA } }),
    proof: response({ service: "Second Wind", status: "ready", tools_live: 1,
      payment: { rail: "x402", x402Version: 2, network, asset: "USDC", payTo_configured: true,
        payment_recipient_configured: true, payment_recipient_verified: true, facilitator_configured: true },
      dependencies: { database: true, commerce_schema: true, payload_store: true, delivery_store: true } }),
    catalog: response({ total_live: 1, tools: [
      { sku: "FIXTURE", version: 1, price_usdc_micros: "100000", max_amount_atomic: "100000", price_role: "maximum", pricing_mode:"whole-product", pricing_status:"configured", url: resource, method: "GET" },
    ] }),
    discovery: response({ x402Version: 2, payment_configured: true, payment:{rail:"x402",network,asset:usdc,payTo:env.X402_EXPECTED_PAY_TO}, items: [
      { sku: "FIXTURE", version: 1, resource, type: "http", method: "GET", x402Version: 2,
        accepts: [], payment_requirements_url:resource, max_amount_atomic:"100000",
        price_role:"maximum", pricing_mode:"whole-product", pricing_status:"configured" },
    ] }),
  };
}

test("accepts matching production identities and maximum-only catalog discovery without certifying payment", () => {
  assert.deepEqual(validateRelease(config, fixture()), {
    accepted: true, expected_commit: env.GITHUB_SHA, gateway_version: version,
    pages_deployment: "fixture-pages-deployment", origin: "https://secondwindai.com",
    live_products: 1, funded_purchase_verified: false,
  });
});

const rejectedCases = [
  ["wrong Pages commit", value => { value.pages.body.result.canonical_deployment.deployment_trigger.metadata.commit_hash = "c".repeat(40); }, "pages_commit_mismatch"],
  ["wrong gateway commit", value => { value.health.body.deployment.tag = "c".repeat(40); }, "gateway_commit_mismatch"],
  ["failed Pages deployment", value => { value.pages.body.result.canonical_deployment.latest_stage.status = "failure"; }, "pages_deployment_not_successful"],
  ["preview deployment", value => { value.pages.body.result.canonical_deployment.environment = "preview"; }, "pages_production_deployment_missing"],
  ["dirty deployed source", value => { value.pages.body.result.canonical_deployment.deployment_trigger.metadata.commit_dirty = true; }, "pages_release_source_mismatch"],
  ["wrong Pages custom domain", value => { value.pages.body.result.domains = ["other.example"]; }, "pages_domain_missing"],
  ["false health", value => { value.health.body.ok = false; }, "health_not_healthy"],
  ["proof 503 configuration failure", value => { value.proof.status = 503; value.proof.body.payment.payment_recipient_verified = false; }, "payment_configuration_unavailable"],
  ["degraded proof masked by HTTP 200", value => { value.proof.body.status = "degraded"; }, "proof_not_ready"],
  ["missing facilitator credential", value => { value.proof.body.payment.facilitator_configured = false; }, "payment_configuration_unavailable"],
  ["missing schema", value => { value.proof.body.dependencies.commerce_schema = false; }, "proof_dependency_unavailable"],
  ["missing payload store", value => { value.proof.body.dependencies.payload_store = false; }, "proof_dependency_unavailable"],
  ["missing delivery store", value => { value.proof.body.dependencies.delivery_store = false; }, "proof_dependency_unavailable"],
  ["mixed gateway versions", value => { value.discovery.headers.set("X-Worker-Version", "other-version"); }, "discovery_gateway_version_mismatch"],
  ["empty live catalog", value => { value.catalog.body.tools = []; value.catalog.body.total_live = 0; }, "live_catalog_unavailable"],
  ["discovery not payment configured", value => { value.discovery.body.payment_configured = false; }, "discovery_payment_unavailable"],
  ["catalog maximum advertised as exact payment", value => { value.discovery.body.items[0].accepts = [{scheme:"exact",amount:"100000"}]; }, "discovery_premature_payment_requirements"],
  ["wrong recipient", value => { value.discovery.body.payment.payTo = `0x${"2".repeat(40)}`; }, "discovery_recipient_mismatch"],
  ["wrong network", value => { value.discovery.body.payment.network = "eip155:84532"; }, "discovery_rail_mismatch"],
  ["wrong asset", value => { value.discovery.body.payment.asset = `0x${"3".repeat(40)}`; }, "discovery_rail_mismatch"],
  ["wrong price", value => { value.discovery.body.items[0].max_amount_atomic = "100001"; }, "discovery_amount_mismatch"],
  ["numeric rather than exact string amount", value => { value.discovery.body.items[0].max_amount_atomic = 100000; }, "discovery_amount_mismatch"],
  ["wrong product version", value => { value.discovery.body.items[0].version = 2; }, "discovery_product_mismatch"],
  ["catalog price advertised as a charge", value => { value.discovery.body.items[0].price_role = "exact"; }, "discovery_price_role_mismatch"],
  ["missing payment URL", value => { delete value.discovery.body.items[0].payment_requirements_url; }, "discovery_requirements_url_mismatch"],
];

for (const [name, mutate, expectedCode] of rejectedCases) {
  test(`rejects ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateRelease(config, value), error => error instanceof AcceptanceError && error.code === expectedCode);
  });
}

function fakeFetch(valueForAttempt = () => fixture()) {
  const calls = [];
  let attempt = 0;
  const keys = new Map([
    ["/health", "health"], ["/api/proof", "proof"], ["/api/tools", "catalog"],
    ["/v2/x402/discovery/resources", "discovery"],
  ]);
  return { calls, fetchImpl: async (rawUrl, options) => {
    const url = new URL(rawUrl);
    calls.push({ url: rawUrl, options });
    const key = url.hostname === "api.cloudflare.com" ? "pages" : keys.get(url.pathname);
    assert.ok(key, `Unexpected endpoint ${url.pathname}`);
    if (key === "pages") attempt++;
    const item = valueForAttempt(attempt)[key];
    return new Response(JSON.stringify(item.body), { status: item.status, headers: item.headers });
  } };
}

test("requests only safe GET endpoints and confines the administrative credential to Cloudflare", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const result = await acceptRelease(config, { fetchImpl });
  assert.equal(result.accepted, true);
  assert.equal(calls.length, 5);
  for (const { url, options } of calls) {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    if (new URL(url).hostname === "api.cloudflare.com") {
      assert.equal(options.headers.Authorization, `Bearer ${env.CLOUDFLARE_API_TOKEN}`);
    } else {
      assert.equal(options.headers.Authorization, undefined);
      assert.doesNotMatch(url, /quotes|purchases|\/api\/x402\//);
    }
  }
});

test("bounded polling tolerates a rollout identity mismatch then accepts the intended commit", async () => {
  const { fetchImpl, calls } = fakeFetch(attempt => {
    const value = fixture();
    if (attempt === 1) value.health.body.deployment.tag = "c".repeat(40);
    return value;
  });
  const delays = [], retries = [];
  const result = await acceptRelease(config, {
    fetchImpl, sleepImpl: async delay => delays.push(delay), onRetry: retry => retries.push(retry),
  });
  assert.equal(result.accepted, true);
  assert.equal(calls.length, 10);
  assert.deepEqual(delays, [5000]);
  assert.deepEqual(retries, [{ attempt: 1, attempts: 6, reason: "gateway_commit_mismatch" }]);
});

test("persistent stale deployment fails after six attempts", async () => {
  const { fetchImpl, calls } = fakeFetch(() => {
    const value = fixture(); value.health.body.deployment.tag = "c".repeat(40); return value;
  });
  let sleeps = 0;
  await assert.rejects(acceptRelease(config, { fetchImpl, sleepImpl: async () => { sleeps++; } }),
    error => error.code === "gateway_commit_mismatch");
  assert.equal(calls.length, 30);
  assert.equal(sleeps, 5);
});

test("bad payment configuration fails immediately instead of waiting through retries", async () => {
  const { fetchImpl, calls } = fakeFetch(() => {
    const value = fixture(); value.proof.status = 503;
    value.proof.body.payment.payment_recipient_verified = false; return value;
  });
  await assert.rejects(acceptRelease(config, { fetchImpl, sleepImpl: async () => assert.fail("unexpected retry") }),
    error => error.code === "payment_configuration_unavailable");
  assert.equal(calls.length, 5);
});

test("upstream error text and body never become a release diagnostic", async () => {
  await assert.rejects(acceptRelease(config, { attempts: 1,
    fetchImpl: async () => { throw new Error(`secret ${env.CLOUDFLARE_API_TOKEN}`); },
  }), error => error instanceof AcceptanceError && !error.message.includes(env.CLOUDFLARE_API_TOKEN));
});

test("release inputs reject missing or burn recipients without choosing a fallback", () => {
  for (const expected of [undefined, "", "invalid", `0x${"0".repeat(40)}`, "0x000000000000000000000000000000000000dEaD"]) {
    assert.throws(() => releaseConfig({ ...env, X402_EXPECTED_PAY_TO: expected }),
      error => error.code === "independently_verified_recipient_required");
  }
});

test("CLI preflight validates input without calling the network or printing credentials", () => {
  const cli = fileURLToPath(new URL("./release-acceptance.mjs", import.meta.url));
  const valid = spawnSync(process.execPath, [cli, "--check-inputs"], { env, encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /no network requests made/);
  const invalid = spawnSync(process.execPath, [cli, "--check-inputs"], {
    env: { ...env, X402_EXPECTED_PAY_TO: "" }, encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /independently_verified_recipient_required/);
  for (const output of [valid.stdout, valid.stderr, invalid.stdout, invalid.stderr]) {
    assert.equal(output.includes(env.CLOUDFLARE_API_TOKEN), false);
    assert.equal(output.includes(env.X402_EXPECTED_PAY_TO), false);
  }
});

test('component discovery may describe a maximum or unconfigured pricing without signable requirements',()=>{
 const f=fixture(),tool=f.catalog.body.tools[0],item=f.discovery.body.items[0];
 for(const target of [tool,item]) Object.assign(target,{pricing_mode:'proportional-components',
  components_url:'/api/products/FIXTURE/components',trial_url:'/api/trials'});
 assert.equal(validateRelease(config,f).accepted,true);
 for(const target of [tool,item]) {
  target.pricing_status='not_configured';target.price_role='historical-unconfirmed';delete target.max_amount_atomic;
 }
 assert.equal(validateRelease(config,f).accepted,true);
 item.max_amount_atomic='100000';
 assert.throws(()=>validateRelease(config,f),error=>error.code==='discovery_unconfigured_price');
});
