from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent

app = BedrockAgentCoreApp()
agent = Agent()

@app.entrypoint
def invoke(payload):
    prompt = payload.get('prompt')
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError('prompt_required')
    return {'result': str(agent(prompt))}

if __name__ == '__main__':
    app.run()
