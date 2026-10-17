import ast
import collections.abc
import contextlib
import copy
import importlib.util
import io
import json
import math
import pathlib
from types import SimpleNamespace

# Reproduce narrow checks against reviewed, SHA-256-pinned public source.
# No model inference; fetched Python is executed only in the inspected paths.
import hashlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1] / '.research'
manifest = json.loads((ROOT.parent/'docs/research/source-manifest.json').read_text(encoding='utf-8'))
needed = {
    'op7418/Humanizer-zh': ['tests/check_structure.py'],
    'liamdugan/raid': ['raid/evaluate.py'],
    'hlzhang109/impossibility-watermark': [
        'text/evaluation/pipelines/detection.py',
        'text/evaluation/tools/text_editor.py',
    ],
}
for repo in manifest['repositories']:
    for entry in repo.get('files', []):
        if entry['path'] not in needed.get(repo['repository'], []):
            continue
        path = ROOT/repo['repository'].replace('/', '__')/'source'/entry['path']
        if not path.exists():
            with urllib.request.urlopen(entry['url'], timeout=30) as response:
                data = response.read(2_000_001)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f'Source hash mismatch: {path}')

results = []

def load_function(path, name, namespace):
    tree = ast.parse(path.read_text(encoding='utf-8'))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), namespace)
    return namespace[name]

p = ROOT/'op7418__Humanizer-zh/source/tests/check_structure.py'
spec = importlib.util.spec_from_file_location('inspected_structure', p)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
tilde = 'Opening.\n\n~~~python\nanswer = 42\n~~~\n\nClosing.\n'
backtick = tilde.replace('~~~', '```')
assert module.protected_parts(tilde) == module.protected_parts(tilde.replace('42','7'))
assert module.protected_parts(backtick) != module.protected_parts(backtick.replace('42','7'))
results.append({'check':'Markdown protected parts', 'tilde_code_change_missed':True,'backtick_control_change_detected':True})

observed={}
def score_stub(df, thresholds, require_complete=True, include_all=True):
    observed['include_all'] = include_all
    return []
namespace={'Sequence':collections.abc.Sequence,'load_detection_result':lambda df,r:df,'compute_thresholds':lambda *a:({},{}),'compute_scores':score_stub,'remove_failed_fpr_scores':lambda scores,*a:scores}
fn=load_function(ROOT/'liamdugan__raid/source/raid/evaluate.py','run_evaluation',namespace)
fn([],[],include_all=False)
assert observed['include_all'] is True
results.append({'check':'RAID include_all=False propagation','downstream_received':True,'argument_not_forwarded':True})

p=ROOT/'hlzhang109__impossibility-watermark/source/text/evaluation/pipelines/detection.py'
tree=ast.parse(p.read_text(encoding='utf-8'))
cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='WatermarkDetectionPipeline')
fn_node=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='evaluate')
def result_stub(a,b,c):
    return SimpleNamespace(generated_or_retrieved_text=a,edited_text=b,detect_result=c)
namespace={'BaseWatermark':object,'WatermarkDetectionResult':result_stub,'DetectionPipelineReturnType':SimpleNamespace(FULL=1,SCORES=2,IS_WATERMARKED=3),'json':json}
exec(compile(ast.Module(body=[fn_node],type_ignores=[]),str(p),'exec'),namespace)
target=ROOT/'check-output'
target.mkdir(exist_ok=True)
watermark_source=target/'watermarked.json'
self=SimpleNamespace(text_editor_list=[object()],dataset=SimpleNamespace(watermark_source=str(watermark_source),get_prompt=lambda i:'prompt'+str(i)),return_type=2)
self._get_iterable=lambda:range(2)
self._get_progress_bar=lambda x:x
self._generate_or_retrieve_text=lambda i,w:'raw'+str(i)
self._edit_text=lambda text,prompt,watermark=None:'edited'+text[-1]
self._detect_watermark=lambda text,w:{'score':[0.1,0.9][int(text[-1])],'is_watermarked':text[-1]=='1'}
with contextlib.redirect_stdout(io.StringIO()):
    returned=namespace['evaluate'](self,object(),attack_name='audit')
rows=[json.loads(line) for line in (target/'audit.json').read_text().splitlines()]
assert returned==[0.1,0.9]
assert [row['score'] for row in rows]==[0.9,0.9]
assert [row['id'] for row in rows]==[1,1]
results.append({'check':'Random-walk repository detection export','returned_scores':returned,'saved_scores':[r['score'] for r in rows],'saved_ids':[r['id'] for r in rows],'last_result_reused_in_export':True})

p=ROOT/'hlzhang109__impossibility-watermark/source/text/evaluation/tools/text_editor.py'
tree=ast.parse(p.read_text(encoding='utf-8'))
cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='RandomWalkAttack')
edit_node=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='edit')
class StopAudit(Exception):
    pass
class Progress:
    def update(self,n): pass
    def close(self): pass
calls=[]
def perturb(prompt,text):
    calls.append(1)
    if len(calls)>6:
        raise StopAudit()
    return text
self=SimpleNamespace(total_steps=2,target_valid_steps=1,quality_oracle=SimpleNamespace(maintain_quality=lambda *a,**k:True),perturb=perturb,grammatical_error_correction=lambda x:x,correct_text=lambda x:x)
logger=SimpleNamespace(setLevel=lambda x:None,info=lambda x:None)
namespace={'logging':SimpleNamespace(getLogger=lambda *a:logger,INFO=20),'copy':copy,'tqdm':lambda **k:Progress(),'np':SimpleNamespace(inf=math.inf)}
exec(compile(ast.Module(body=[edit_node],type_ignores=[]),str(p),'exec'),namespace)
with contextlib.redirect_stdout(io.StringIO()):
    try:
        namespace['edit'](self,'text','prompt',watermark=SimpleNamespace(detect_watermark=lambda *a,**k:(True,3.0)))
    except StopAudit:
        pass
assert len(calls)==7
results.append({'check':'Random-walk total_steps=2 with unchanged positive detector','perturbation_calls_before_audit_stop':len(calls),'total_steps_not_hard_cap':True})

(ROOT/'audit-checks.json').write_text(json.dumps({'scope':'Inspected pure-code paths with synthetic stubs; no model inference or live detector queries','results':results},indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
