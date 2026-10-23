import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {EVENT_CONTRACT_VERSION, EVENT_REGISTRY} from '../src/telemetry.js';

const telemetryDir = new URL('../telemetry/', import.meta.url);
const contract = JSON.parse(readFileSync(new URL('event-contract-v1.json', telemetryDir), 'utf8'));
const pipelineSql = readFileSync(new URL('basin-pipeline-v1.sql', telemetryDir), 'utf8');

const sorted = values => [...values].sort();

test('checked-in telemetry contract exactly mirrors the current application event registry', () => {
  assert.equal(contract.event_contract_version, EVENT_CONTRACT_VERSION);
  assert.deepEqual(sorted(contract.event_types), sorted(Object.keys(EVENT_REGISTRY)));
  assert.equal(contract.stream.name, 'second_wind_events');
  assert.deepEqual(contract.stream.required_fields, [
    'event_id', 'schema_version', 'event_contract_version', 'event_type', 'occurred_ts', 'payload',
  ]);
});

test('v1 Basin projection uses only current event names and current commerce fields', () => {
  for (const eventType of Object.keys(EVENT_REGISTRY)) {
    assert.ok(pipelineSql.includes("'" + eventType + "'"), 'missing current event type: ' + eventType);
  }
  for (const legacy of [
    'catalog.selected', 'catalog.no_match', 'scope.activated', 'scope.frozen',
    'commerce.checkout_initiated', 'payment.settle', 'delivery.completed', 'recovery.attempted',
    'amount_bps', 'price_bps', 'settlement_reference',
  ]) {
    assert.ok(!pipelineSql.includes(legacy), 'legacy projection token remains: ' + legacy);
  }
  for (const current of [
    'exact_amount_atomic', 'payment_network', 'product_version_ref',
    'journey_stage', 'observed_outcome', 'scope_correlation',
  ]) {
    assert.ok(pipelineSql.includes(current), 'missing current projection field: ' + current);
  }
});

test('v1 projection is additive and leaves the existing raw all_events landing table authoritative', () => {
  assert.equal(contract.raw_landing_table, 'secondwind.all_events');
  assert.deepEqual(contract.projections.map(p => p.sink).sort(), [
    'journey_events_v1_sink',
    'payment_events_v1_sink',
    'scope_events_v1_sink',
  ]);
  assert.ok(!/\b(?:DELETE|UPDATE|DROP|ALTER)\b/i.test(pipelineSql));
  assert.match(pipelineSql, /INSERT INTO journey_events_v1_sink/);
  assert.match(pipelineSql, /INSERT INTO payment_events_v1_sink/);
  assert.match(pipelineSql, /INSERT INTO scope_events_v1_sink/);
});
