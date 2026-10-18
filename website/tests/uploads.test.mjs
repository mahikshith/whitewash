import test from 'node:test';
import assert from 'node:assert/strict';
import { readTextFile } from '../dist/uploads.js';

function file(name, content) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };
}

test('UTF-8 import preserves the source including BOM, Markdown and meaningful Unicode', async () => {
  const text = '\ufeff# Title\n\n~~~\nutilize\u00a0data\n~~~\n\n中文，👩‍👩‍👧‍👦 فارسی\u200cمتن';
  assert.deepEqual(await readTextFile(file('report.MD', text)), { text, format: 'md', name: 'report.MD' });
});

test('unsupported and oversized files are rejected before bytes are read', async () => {
  let read = false;
  const input = { name: 'report.pdf', size: 10, arrayBuffer: async () => { read = true; } };
  await assert.rejects(readTextFile(input), /\.txt or \.md/);
  await assert.rejects(readTextFile({ ...input, name: 'report.txt', size: 400001 }), /400 KB/);
  assert.equal(read, false);
});

test('invalid UTF-8, binary data and excessive character counts fail visibly', async () => {
  await assert.rejects(readTextFile(file('bad.txt', new Uint8Array([255]))), /valid UTF-8/);
  await assert.rejects(readTextFile(file('binary.txt', 'hello\0world')), /binary data/);
  await assert.rejects(readTextFile(file('long.txt', 'a'.repeat(100001))), /100,000/);
});
