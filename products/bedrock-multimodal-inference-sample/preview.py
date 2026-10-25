"""Run actual image inference; disclose only bounded response length and usage counters."""
import json, sys
from multimodal import ask_about_image
try:
    c=json.load(sys.stdin); response=ask_about_image(image_path=c['image_path'],prompt=c['prompt'],model_id=c['model_id'],region=c.get('region'))
    text=''.join(part.get('text','') for part in response.get('output',{}).get('message',{}).get('content',[]))
    usage=response.get('usage',{})
    print(json.dumps({'ok':True,'status':'inference_complete','response_char_count':min(len(text),65536),'input_token_count':int(usage.get('inputTokens',0)),'output_token_count':int(usage.get('outputTokens',0))}))
except Exception:
    print(json.dumps({'ok':False,'status':'blocked','diagnostic_codes':['multimodal_inference_failed']})); raise SystemExit(2)
