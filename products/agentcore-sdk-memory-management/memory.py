import boto3

def create_memory(*, name, region=None):
    client = boto3.client('bedrock-agentcore-control', region_name=region)
    return client.create_memory(name=name, description='Agent conversation memory', eventExpiryDuration=30, memoryStrategies=[{'summaryMemoryStrategy': {'name':'SessionSummary','namespaceTemplates':['/summaries/{actorId}/{sessionId}/']}}])

def record_turn(*, memory_id, actor_id, session_id, messages, region=None):
    client = boto3.client('bedrock-agentcore', region_name=region)
    from datetime import datetime, timezone
    normalized = [{'conversational': {'role': m['role'].upper(), 'content': {'text': m['text']}}} for m in messages]
    return client.create_event(memoryId=memory_id, actorId=actor_id, sessionId=session_id, eventTimestamp=datetime.now(timezone.utc), payload=normalized)

def recall(*, memory_id, namespace, query, region=None):
    client = boto3.client('bedrock-agentcore', region_name=region)
    return client.retrieve_memory_records(memoryId=memory_id, namespace=namespace, searchCriteria={'searchQuery': query})
