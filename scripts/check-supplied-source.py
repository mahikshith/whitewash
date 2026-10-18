"""Reproduce two narrow findings from the SHA-pinned supplied source review.

Downloads public source only when absent, verifies SHA-256, then executes just
the inspected deterministic PostProcessor class and its literal rule table.
No repository imports, models, detectors or credentials are used.
"""
import ast
import hashlib
import json
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT/'docs/research/supplied-source-manifest.json').read_text(encoding='utf-8'))

def source(repo_name, path):
    repo = next(item for item in manifest['repositories'] if item['repository'] == repo_name)
    entry = next(item for item in repo['files'] if item['path'] == path)
    target = ROOT/'.research'/repo_name.replace('/', '__')/'source'/path
    if not target.exists():
        url = 'https://raw.githubusercontent.com/' + repo_name + '/' + repo['commit'] + '/' + urllib.parse.quote(path)
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read(2_000_001)
        if len(data) > 2_000_000:
            raise ValueError('Source exceeds review limit')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    data = target.read_bytes()
    if hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise ValueError('Source hash mismatch: ' + path)
    return data.decode('utf-8')

tree = ast.parse(source('lynote-ai/humanize-text', 'src/methodologies/postprocess.py'))
selected = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.Assign))]
namespace = {'re': re, 'random': type('FirstChoice', (), {'choice': staticmethod(lambda items: items[0])})}
exec(compile(ast.Module(body=selected, type_ignores=[]), '<reviewed-postprocessor>', 'exec'), namespace)
processor = namespace['PostProcessor']({'postprocess': {'disrupt_rhythm': False}})
original = 'The robust_value identifier and "robust" quote must remain unchanged.'
actual = processor.process(original)
quoted = processor.process('The quote is "robust".')
assert 'strong_value' in actual and '"strong"' in quoted
script = source('AhmadHassan-BTed/Turnitout-Humanizer', 'docs/script.js')
assert 'meterScore.textContent = "4%"' in script and 'dialScoreNum.textContent = "0%"' in script
result = {
    'lynote_postprocessor': {'input': original, 'actual': actual, 'quoted_input_output': quoted, 'identifier_and_quote_changed': True},
    'turnitout_demo': {'hardcoded_4_percent': True, 'hardcoded_0_percent': True},
    'limits': 'Narrow source-path checks only. No model, detector or provider watermark experiment was run.',
}
(ROOT/'docs/research/supplied-source-checks.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
