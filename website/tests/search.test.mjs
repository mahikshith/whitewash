import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchAll } from '../dist/search.js';
import { _test } from '../dist/conv-pdf-more.js';

const ids = (q) => searchAll(q, 6).map((r) => (r.kind === 'tool' ? r.tool.id : r.from + '>' + r.to));

test('format pairs find the route or the tool that covers it', () => {
  assert.equal(ids('pdf to word')[0], 'pdf-to-word');
  assert.equal(ids('jpg 2 png')[0], 'jpg>png');
  assert.equal(ids('convert flac → mp3')[0], 'flac>mp3');
  assert.equal(ids('zip to tgz')[0], 'zip>tgz');
});

test('tool names and everyday words find tools', () => {
  assert.equal(ids('compress pdf')[0], 'pdf-compress');
  assert.equal(ids('zip')[0], 'archives');
  assert.equal(ids('ocr')[0], 'ocr');
  assert.equal(ids('image to text')[0], 'ocr');
  assert.equal(ids('encrypt pdf')[0], 'pdf-protect');
  assert.equal(ids('signature')[0], 'pdf-sign');
});

test('a single format lists where it can go', () => {
  assert.ok(ids('mp3').includes('mp3>wav'));
});

test('unknown things return nothing rather than noise', () => {
  assert.deepEqual(ids('heic to jpg'), []);
  assert.deepEqual(ids(''), []);
});

test('ASCII85 and hex unwrapping for PDF image streams', () => {
  const ascii85 = (s) => new TextDecoder().decode(_test.ascii85(new TextEncoder().encode(s)));
  assert.equal(ascii85('87cURD]j7BEbo80~>'), 'Hello world!');
  assert.equal(ascii85('<~=(l;iATqR(BE~>'), 'Whitewash');
  assert.equal(ascii85('<~z~>'), '\0\0\0\0');
  assert.deepEqual([..._test.asciiHex(new TextEncoder().encode('48 65 6c6c 6F7>'))], [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x70]);
});

import { proposeEdits, applyEdits } from '../dist/engine.js';
test('Humanize cuts AI filler but never touches quotes, numbers or links', () => {
  const text = 'Certainly! It is important to note that we leverage a myriad of tools. I hope this helps!\n"We delve into it," said Bo. Revenue was 1,250 at https://x.io/delve-into.';
  const out = applyEdits(text, proposeEdits(text, { mode: 'humanize', format: 'txt' }));
  assert.equal(out.split('\n')[0].trim(), 'We use many tools.');
  assert.ok(out.includes('"We delve into it,"'));
  assert.ok(out.includes('1,250') && out.includes('https://x.io/delve-into'));
});
