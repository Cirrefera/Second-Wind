"""Validate planner output against botocore's AWS-owned service models.
Install the version recorded in validation.json to reproduce that assessment.
No credentials, AWS API calls, or resources are used.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import botocore
import botocore.session
import botocore.validate

root = Path(__file__).resolve().parent.parent
code = """
import {prepare} from './plan.mjs';
const optional=['status-index','expiry','recovery','change-stream'];
console.log(JSON.stringify(Array.from({length:16},(_,mask)=>prepare({table_name:'agent-state-test',components:['table',...optional.filter((_,i)=>mask&(1<<i))]}))));
"""
plans = json.loads(subprocess.check_output(['node','--input-type=module','-e',code], cwd=root, text=True))
model = botocore.session.get_session().get_service_model('dynamodb')
count = 0
for plan in plans:
    for step in plan['steps'] + plan['verification']:
        botocore.validate.validate_parameters(step['input'], model.operation_model(step['operation']).input_shape)
        count += 1
report = {
    'sku': 'AWS-0568', 'botocore_version': botocore.__version__,
    'service_api_version': model.api_version, 'component_combinations': len(plans),
    'validated_operation_inputs': count, 'result': 'passed',
    'source_hashes': {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['plan.mjs','planner.mjs','config.schema.json', *sorted(str(p.relative_to(root)) for p in (root/'features').glob('*.mjs'))]},
    'scope': 'AWS SDK parameter shape validation; no AWS deployment or service calls performed',
}
(root/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
