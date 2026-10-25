import base64
from pathlib import Path
import boto3

def ask_about_image(*, image_path, prompt, model_id, region=None):
    path = Path(image_path)
    if path.suffix.lower() not in {'.png', '.jpeg', '.jpg', '.gif', '.webp'}:
        raise ValueError('unsupported_image_extension')
    data = path.read_bytes()
    if not data or len(data) > 5 * 1024 * 1024:
        raise ValueError('image_must_be_1_to_5_mib')
    fmt = 'jpeg' if path.suffix.lower() in {'.jpg', '.jpeg'} else path.suffix.lower()[1:]
    client = boto3.client('bedrock-runtime', region_name=region)
    return client.converse(
        modelId=model_id,
        messages=[{'role':'user','content':[
            {'text':prompt}, {'image':{'format':fmt,'source':{'bytes':data}}},
        ]}],
        inferenceConfig={'maxTokens':512},
    )
