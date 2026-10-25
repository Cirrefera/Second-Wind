-- Replacement for secondwind_telemetry's obsolete specialized projections.
-- Keep the existing stream and raw sink. Do not alter the contract-v1 pipeline.
-- Consumers continue deduplicating the at-least-once producer's event_id.
INSERT INTO all_events_sink
SELECT event_id, schema_version, event_contract_version, event_type, occurred_ts,
       actor_id, visitor_id, session_id, journey_id, request_id, buyer_id, payload
FROM second_wind_events;
