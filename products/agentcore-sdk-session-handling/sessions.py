import uuid
import json
import boto3

def new_session_id() -> str:
    # Persist this value for a conversation; do not generate a new ID on every turn.
    return str(uuid.uuid4())

def invoke(*, runtime_arn, session_id, payload: dict, region=None):
    if not 33 <= len(session_id) <= 256:
        raise ValueError('session_id_length_out_of_range')
    if not isinstance(payload, dict) or not payload:
        raise ValueError('nonempty_object_payload_required')
    client = boto3.client('bedrock-agentcore', region_name=region)
    return client.invoke_agent_runtime(
        agentRuntimeArn=runtime_arn, runtimeSessionId=session_id,
        payload=json.dumps(payload).encode('utf-8'),
    )

def stop(*, runtime_arn, session_id, region=None):
    client = boto3.client('bedrock-agentcore', region_name=region)
    return client.stop_runtime_session(
        agentRuntimeArn=runtime_arn, runtimeSessionId=session_id,
    )
