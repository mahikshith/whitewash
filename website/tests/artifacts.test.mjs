import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeEdits, applyEdits } from '../dist/engine.js';

const clean = (text, options = {}) => applyEdits(text, proposeEdits(text, { mode: 'clean', ...options }));

test('ChatGPT citation markers are removed in clean and polish modes without stray spaces', () => {
  const text = 'Growth rose 4% 【9†source】. Costs fell 【45†L75-L83】 【4:0†source】, then rose.\n【12†source】 Next line.';
  const expected = 'Growth rose 4%. Costs fell, then rose.\nNext line.';
  assert.equal(clean(text), expected);
  assert.equal(applyEdits(text, proposeEdits(text, { mode: 'polish' })), expected);
  const edits = proposeEdits(text);
  assert.ok(edits.length && edits.every((edit) => edit.kind === 'artifact' && /ChatGPT|chatbot/.test(edit.reason)));
});

test('turn IDs, Private Use source pills and oaicite references are removed', () => {
  assert.equal(clean('Sales grew.citeturn0search0turn2news13 Next turn0search3. Up citeturn1view0 here.'), 'Sales grew. Next. Up here.');
  assert.equal(clean('Solid turn4file2L20-L28 result.'), 'Solid result.');
  assert.equal(clean('Done :contentReference[oaicite:0]{index=0}. Also [oaicite:3] and (oaicite:5){index=5}!'), 'Done. Also and!');
  assert.equal(clean('Read [oai_citation:0‡reuters.com](https://reuters.com/a) or 【oai_citation:1‡bbc.com】.', { format: 'md' }), 'Read [reuters.com](https://reuters.com/a) or.');
  assert.equal(clean('Done :contentReference[oaicite:0]{index=0}.\n\n- item 【1†source】', { format: 'md' }), 'Done.\n\n- item');
});

test('AI tracking parameters leave a valid URL behind', () => {
  const text = 'A https://a.com/?utm_source=chatgpt.com&b=2 B https://a.com/p?a=1&utm_source=openai. C (https://a.com/p?utm_source=copilot.com&referrer=grok.com#top) D www.x.org/?q=1&utm_source=perplexity&z=3 E [x](https://b.org/doc?utm_source=chatgpt.com)';
  const result = clean(text, { format: 'md' });
  assert.equal(result, 'A https://a.com/?b=2 B https://a.com/p?a=1. C (https://a.com/p#top) D www.x.org/?q=1&z=3 E [x](https://b.org/doc)');
  for (const url of result.match(/https?:\/\/[^\s)]+/g)) assert.doesNotThrow(() => new URL(url.replace(/\.$/, '')));
  const kept = 'https://y.com/?utm_source=newsletter https://y.com/?utm_source=chatgpt.community&x=1 https://y.com/?xutm_source=openai';
  assert.equal(clean(kept), kept);
  assert.ok(proposeEdits(text).every((edit) => edit.after === '' && edit.kind === 'artifact'));
});

test('quotes, code, locks and the artifacts option are respected', () => {
  const text = '"Keep 【9†source】" and “turn0search0”\n`code turn0search0`\n    https://a.com/?utm_source=chatgpt.com\nLocked 【2†source】 here.';
  assert.equal(clean(text, { locks: ['Locked 【2†source】'] }), text);
  const fenced = '```\n【1†source】 https://a.com/?utm_source=openai\n```';
  assert.equal(clean(fenced, { format: 'md' }), fenced);
  assert.equal(clean('Fact 【1†source】.', { artifacts: false }), 'Fact 【1†source】.');
});

test('multilingual text, CJK brackets and emoji are not mistaken for artifacts', () => {
  const text = '【重要】お知らせ 【第3回】 家庭👩‍👩‍👧‍👦，１２３！ فارسی‌متن ‏שלום return2go turn left at 5 ❤️ ';
  assert.equal(clean(text), text);
  const mixed = '中文【3†source】。👩‍👧 Done 【4†source】。';
  assert.equal(clean(mixed), '中文。👩‍👧 Done。');
  assert.equal(clean(clean(mixed)), clean(mixed));
});
