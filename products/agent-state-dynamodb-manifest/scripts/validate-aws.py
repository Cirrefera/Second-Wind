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
import {prepare} from './planner.mjs';
const optional=['status-index','expiry','recovery','change-stream'];
const modules=await Promise.all(optional.map(async id=>(await import('./features/'+id+'.mjs')).feature));
console.log(JSON.stringify(Array.from({length:16},(_,mask)=>{const features=modules.filter((_,i)=>mask&(1<<i));return prepare({language:'javascript',table_name:'agent-state-test'},features);})));
"""
plans = json.loads(subprocess.check_output(['node','--input-type=module','-e',code], cwd=root, text=True))
python_report = json.loads(subprocess.check_output(['python','scripts/variants.py'], cwd=root, text=True))
assert plans == python_report['selections'], 'language_variants_disagree'
plans += python_report['selections']
model = botocore.session.get_session().get_service_model('dynamodb')
count = 0
response_count = 0
for plan in plans:
    for step in plan['steps'] + plan['verification']:
        botocore.validate.validate_parameters(step['input'], model.operation_model(step['operation']).input_shape)
        count += 1
    for request in plan['verification']:
        expected = {}
        for path, value in request['checks'].items():
            fields = path.split('.')
            target = expected
            for field in fields[:-1]:
                target = target.setdefault(field, {})
            target[fields[-1]] = value
        botocore.validate.validate_parameters(expected, model.operation_model(request['operation']).output_shape)
        response_count += 1
report = {
    'sku': 'AWS-0568', 'botocore_version': botocore.__version__,
    'service_api_version': model.api_version, 'component_combinations_per_language': 16,
    'languages': ['javascript', 'python'], 'validated_plans': len(plans),
    'validated_operation_inputs': count, 'validated_partial_response_shapes': response_count, 'result': 'passed',
    'source_hashes': {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in
                      [root/'planner.mjs',root/'planner.py',root/'selection.schema.json',root/'scripts/variants.py',root/'scripts/validate-aws.py',
                       *sorted((root/'features').glob('*.mjs')),*sorted((root/'features').glob('*.py'))]},
    'scope': 'AWS SDK input and partial output shape validation only; no response matcher, AWS deployment or service calls performed',
}
(root/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
