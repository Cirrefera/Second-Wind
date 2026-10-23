-- Second Wind Basin projection for application event_contract_version = '1'.
-- Additive only. The existing all_events raw landing table and legacy pipeline are not modified.
-- Consumers deduplicate by stable event_id.

INSERT INTO journey_events_v1_sink
SELECT
  event_id,
  event_contract_version,
  event_type,
  occurred_ts,
  NULLIF(json_get_str(payload, 'journey_id'), '') AS journey_id,
  NULLIF(json_get_str(payload, 'observation_id'), '') AS observation_id,
  NULLIF(json_get_str(payload, 'quote_id'), '') AS quote_id,
  NULLIF(json_get_str(payload, 'payment_id'), '') AS payment_id,
  NULLIF(json_get_str(payload, 'trial_id'), '') AS trial_id,
  NULLIF(json_get_str(payload, 'sku'), '') AS sku,
  NULLIF(json_as_text(payload, 'product_version_ref'), '') AS product_version_ref,
  NULLIF(json_get_str(payload, 'event_family'), '') AS event_family,
  NULLIF(json_get_str(payload, 'journey_stage'), '') AS journey_stage,
  NULLIF(json_get_str(payload, 'observed_outcome'), '') AS observed_outcome,
  NULLIF(json_get_str(payload, 'transport'), '') AS transport,
  CASE WHEN json_contains(payload, 'public_intent') THEN json_get_json(payload, 'public_intent') ELSE NULL END AS public_intent,
  CASE WHEN json_contains(payload, 'candidate_product_ids') THEN json_get_json(payload, 'candidate_product_ids') ELSE NULL END AS candidate_product_ids,
  CASE WHEN json_contains(payload, 'selected_product_ids') THEN json_get_json(payload, 'selected_product_ids') ELSE NULL END AS selected_product_ids,
  NULLIF(json_get_str(payload, 'resolution_status'), '') AS resolution_status,
  NULLIF(json_get_str(payload, 'configuration_status'), '') AS configuration_status,
  NULLIF(json_get_str(payload, 'response_status'), '') AS response_status,
  CASE WHEN json_contains(payload, 'result_count') THEN json_get_int(payload, 'result_count') ELSE NULL END AS result_count,
  CASE WHEN json_contains(payload, 'missing_count') THEN json_get_int(payload, 'missing_count') ELSE NULL END AS missing_count,
  CASE WHEN json_contains(payload, 'error_count') THEN json_get_int(payload, 'error_count') ELSE NULL END AS error_count,
  CASE WHEN json_contains(payload, 'clarification_count') THEN json_get_int(payload, 'clarification_count') ELSE NULL END AS clarification_count,
  NULLIF(json_get_str(payload, 'delivery_id'), '') AS delivery_id,
  NULLIF(json_get_str(payload, 'challenge_id'), '') AS challenge_id,
  NULLIF(json_get_str(payload, 'journey_correlation'), '') AS journey_correlation,
  NULLIF(json_get_str(payload, 'scope_correlation'), '') AS scope_correlation
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND event_type IN (
    'journey.linked',
    'discovery.searched',
    'discovery.resolved',
    'discovery.described',
    'clarification.requested',
    'clarification.responded',
    'configuration.checked',
    'selection.product_selected',
    'trial.started',
    'trial.completed',
    'trial.failed',
    'trial.expired_while_running',
    'scope.selected',
    'scope.accepted',
    'quote.created',
    'payment.settlement_started',
    'payment.settlement_pending',
    'payment.settled',
    'payment.failed',
    'receipt.issued',
    'entitlement.activated',
    'delivery.prepared',
    'delivery.failed',
    'recovery.grant_recovered',
    'recovery.challenge_created',
    'recovery.credential_rotated',
    'recovery.result_recovered',
    'recovery.trial_recovered',
    'recovery.purchase_replayed'
  );

INSERT INTO payment_events_v1_sink
SELECT
  event_id,
  event_contract_version,
  event_type,
  occurred_ts,
  NULLIF(json_get_str(payload, 'journey_id'), '') AS journey_id,
  NULLIF(json_get_str(payload, 'payment_id'), '') AS payment_id,
  NULLIF(json_get_str(payload, 'quote_id'), '') AS quote_id,
  NULLIF(json_get_str(payload, 'trial_id'), '') AS trial_id,
  NULLIF(json_get_str(payload, 'sku'), '') AS sku,
  NULLIF(json_as_text(payload, 'product_version_ref'), '') AS product_version_ref,
  NULLIF(json_get_str(payload, 'exact_amount_atomic'), '') AS exact_amount_atomic,
  NULLIF(json_get_str(payload, 'payment_network'), '') AS payment_network,
  NULLIF(json_get_str(payload, 'artifact_hash'), '') AS artifact_hash,
  NULLIF(json_get_str(payload, 'release_hash'), '') AS release_hash,
  NULLIF(json_get_str(payload, 'scope_hash'), '') AS scope_hash,
  NULLIF(json_get_str(payload, 'journey_stage'), '') AS journey_stage,
  NULLIF(json_get_str(payload, 'observed_outcome'), '') AS observed_outcome,
  NULLIF(json_get_str(payload, 'scope_correlation'), '') AS scope_correlation,
  NULLIF(json_get_str(payload, 'journey_correlation'), '') AS journey_correlation
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND event_type IN (
    'payment.settlement_started',
    'payment.settlement_pending',
    'payment.settled',
    'payment.failed',
    'receipt.issued',
    'entitlement.activated'
  );

INSERT INTO scope_events_v1_sink
SELECT
  event_id,
  event_contract_version,
  event_type,
  occurred_ts,
  NULLIF(json_get_str(payload, 'journey_id'), '') AS journey_id,
  NULLIF(json_get_str(payload, 'trial_id'), '') AS trial_id,
  NULLIF(json_get_str(payload, 'quote_id'), '') AS quote_id,
  NULLIF(json_get_str(payload, 'sku'), '') AS sku,
  NULLIF(json_as_text(payload, 'product_version_ref'), '') AS product_version_ref,
  NULLIF(json_get_str(payload, 'release_hash'), '') AS release_hash,
  NULLIF(json_get_str(payload, 'scope_hash'), '') AS scope_hash,
  NULLIF(json_get_str(payload, 'exact_amount_atomic'), '') AS exact_amount_atomic,
  CASE WHEN json_contains(payload, 'selected_share_bps') THEN json_get_int(payload, 'selected_share_bps') ELSE NULL END AS selected_share_bps,
  CASE WHEN json_contains(payload, 'selected_component_ids') THEN json_get_json(payload, 'selected_component_ids') ELSE NULL END AS selected_component_ids,
  CASE WHEN json_contains(payload, 'omitted_component_ids') THEN json_get_json(payload, 'omitted_component_ids') ELSE NULL END AS omitted_component_ids,
  NULLIF(json_get_str(payload, 'scope_correlation'), '') AS scope_correlation,
  NULLIF(json_get_str(payload, 'journey_stage'), '') AS journey_stage,
  NULLIF(json_get_str(payload, 'observed_outcome'), '') AS observed_outcome
FROM second_wind_events
WHERE event_contract_version = '1'
  AND json_get_str(payload, 'producer') = 'secondwind-gateway'
  AND event_type IN ('scope.selected', 'scope.accepted');
