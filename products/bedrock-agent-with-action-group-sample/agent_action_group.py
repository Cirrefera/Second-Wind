import boto3

def create_agent(*, name, foundation_model, instruction, role_arn, region=None):
    client = boto3.client('bedrock-agent', region_name=region)
    return client.create_agent(
        agentName=name, foundationModel=foundation_model,
        instruction=instruction, agentResourceRoleArn=role_arn,
    )

def create_function_group(*, agent_id, name, lambda_arn, function_schema, region=None):
    client = boto3.client('bedrock-agent', region_name=region)
    return client.create_agent_action_group(
        agentId=agent_id, agentVersion='DRAFT', actionGroupName=name,
        actionGroupExecutor={'lambda': lambda_arn},
        functionSchema={'functions': function_schema},
    )

def invoke(*, agent_id, alias_id, session_id, prompt, region=None):
    client = boto3.client('bedrock-agent-runtime', region_name=region)
    return client.invoke_agent(
        agentId=agent_id, agentAliasId=alias_id, sessionId=session_id, inputText=prompt,
    )
