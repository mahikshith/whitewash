import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeEdits, applyEdits, inspectCharacters, validateFile } from '../dist/engine.js';

const polish = (text, options = {}) => applyEdits(text, proposeEdits(text, { mode: 'polish', ...options }));

test('light edits preserve amounts, dates, citations and the source', () => {
  const original = 'In order to ship on 21 October, utilize INR\u00a048,500 for 12 teams. [Smith, 2024]';
  assert.equal(polish(original), 'To ship on 21 October, use INR 48,500 for 12 teams. [Smith, 2024]');
  assert.match(original, /In order to/);
});

test('review can reject any edit or all edits without offset corruption', () => {
  const text = 'Utilize data in order to help a large number of teams.';
  const edits = proposeEdits(text, { mode: 'polish' });
  assert.equal(applyEdits(text, edits, new Set()), text);
  assert.equal(applyEdits(text, edits, new Set([edits[1].id])), 'Utilize data to help a large number of teams.');
  assert.throws(() => applyEdits('edited source', edits), /draft changed/);
});

test('both Markdown fence types, longer fences and unclosed fences stay intact', () => {
  for (const fence of ['```', '~~~', '````', '~~~~']) {
    const text = `In order to work.\n\n${fence}txt\nUtilize\u00a0data in order to test.\n${fence}\n\nUtilize data.`;
    assert.equal(polish(text, { format: 'md' }), text.replace('In order to work.', 'To work.').replace(/Utilize data\.$/, 'Use data.'));
    const open = `~~~txt\nUtilize\u00a0data`;
    assert.equal(polish(open, { format: 'md' }), open);
  }
});

test('Markdown frontmatter, links, tables, HTML, headings, math and indented code are retained', () => {
  const text = '---\ntitle: Utilize data\n---\n# In order to\n[Utilize](https://example.com/utilize)\n| Utilize | x |\n<span>Utilize</span>\n$Utilize$\n    Utilize\u00a0data\n\nUtilize data.';
  assert.equal(polish(text, { format: 'md' }), text.replace(/Utilize data\.$/, 'Use data.'));
});

test('plain-text URLs, quotes, email addresses and explicit locks are immutable', () => {
  const text = 'Utilize https://example.com/in-order-to “utilize\u00a0data” "utilize" team@utilize.com and Utilize Product.';
  assert.equal(polish(text, { locks: ['Utilize Product'] }), text.replace(/^Utilize /, 'Use '));
});

test('English edits do not split mixed-script words or inline code in plain text', () => {
  const text = 'réutilize 中文utilize utilize中文 utilize_data\n`utilize`\n\nUtilize data.';
  assert.equal(polish(text), text.replace(/Utilize data\.$/, 'Use data.'));
  assert.throws(() => proposeEdits('Utilize', { locks: Array(51).fill('term') }), /50 locked/);
});

test('multiline and unfinished quotations remain untouched', () => {
  for (const quoted of ['"Utilize\ndata"', '“Utilize\ndata”', '“Utilize data', '"Utilize data']) {
    assert.equal(polish(`In order to proceed.\n${quoted}`), `To proceed.\n${quoted}`);
  }
});

test('cleanup preserves CJK punctuation, emoji joiners, non-joiners and direction controls', () => {
  const text = '\ufeffHello\u00a0world\u00ad.\u200b 家庭👩‍👩‍👧‍👦，１２３！ فارسی\u200cمتن \u200fשלום';
  const result = polish(text);
  assert.equal(result, text.slice(1).replace('\u00a0', ' ').replace('\u00ad', ''));
  assert.ok(result.includes('\u200b'));
  assert.equal(polish(text, { zeroWidth: true }), result.replace('\u200b', ''));
});

test('clean mode performs no style edits and preference changes are respected', () => {
  const text = 'Utilize\u00a0data\u00ad';
  assert.equal(applyEdits(text, proposeEdits(text, { mode: 'clean', spaces: false, softHyphens: false })), text);
  assert.equal(applyEdits(text, proposeEdits(text, { mode: 'clean' })), 'Utilize data');
});

test('inspector reports counts without claiming watermark detection', () => {
  const text = '👩‍👧 a\u00a0b\u00a0c\u200f';
  const items = inspectCharacters(text);
  assert.equal(items.find((item) => item.code === 'U+00A0').count, 2);
  assert.equal(items.find((item) => item.code === 'U+200D').count, 1);
  assert.ok(items.every((item) => item.positions[0] >= 1));
});

test('unsupported files and oversized inputs fail visibly', () => {
  assert.equal(validateFile('REPORT.MD', 100), 'md');
  assert.throws(() => validateFile('report.pdf', 100), /Office and PDF/);
  assert.throws(() => validateFile('report.txt', 400001), /400 KB/);
  assert.throws(() => proposeEdits('a'.repeat(100001)), /100,000/);
  assert.throws(() => proposeEdits('x\u00a0'.repeat(501)), /500 suggestions/);
});

test('applying proposed edits is idempotent on a multilingual fixture', () => {
  const input = 'In order to utilize data.\n\n中文，１２３。 👩‍👩‍👧‍👦 \u200c\u200f\n~~~\nutilize\u00a0data\n~~~';
  const once = polish(input, { format: 'md' });
  assert.equal(polish(once, { format: 'md' }), once);
});
