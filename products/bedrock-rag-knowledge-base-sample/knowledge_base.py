import boto3

def retrieve(*, knowledge_base_id, query, region=None, number_of_results=5):
    if not query.strip(): raise ValueError('query_required')
    if not 1 <= number_of_results <= 20: raise ValueError('number_of_results_out_of_range')
    client = boto3.client('bedrock-agent-runtime', region_name=region)
    return client.retrieve(
        knowledgeBaseId=knowledge_base_id,
        retrievalQuery={'text': query},
        retrievalConfiguration={'vectorSearchConfiguration': {'numberOfResults': number_of_results}},
    )

def answer_with_sources(*, knowledge_base_id, question, model_arn, region=None):
    client = boto3.client('bedrock-agent-runtime', region_name=region)
    return client.retrieve_and_generate(
        input={'text': question},
        retrieveAndGenerateConfiguration={
            'type': 'KNOWLEDGE_BASE',
            'knowledgeBaseConfiguration': {
                'knowledgeBaseId': knowledge_base_id,
                'modelArn': model_arn,
            },
        },
    )
