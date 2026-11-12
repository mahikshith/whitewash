// Things only files saved by real Office apps do. Each of these broke on the
// first run against documents from the web, while library-made fixtures passed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { readZip, writeZip, deflateEntry } from '../dist/office-zip.js';
import { blocksFromPptx } from '../dist/pptx-read.js';

globalThis.DOMParser = DOMParser;
const enc = new TextEncoder();

async function zipOf(files) {
  const entries = new Map();
  for (const [path, text] of Object.entries(files)) await deflateEntry(entries, path, enc.encode(text));
  return writeZip(entries);
}
// Sets the flag word in every local and central header.
function withFlags(zip, flags) {
  const out = zip.slice(), view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i++) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) view.setUint16(i + 6, flags, true);
    else if (sig === 0x02014b50) view.setUint16(i + 8, flags, true);
  }
  return out;
}

test('accepts the compression-option flags Microsoft Office writes', async () => {
  const zip = await zipOf({ 'a.xml': '<a/>', 'b.xml': '<b>' + 'x'.repeat(500) + '</b>' });
  for (const flags of [0x0002, 0x0004, 0x0006, 0x0806]) assert.equal((await readZip(withFlags(zip, flags))).size, 2);
  await assert.rejects(readZip(withFlags(zip, 0x0001)), /Unsupported or damaged/);   // encrypted
});

test('accepts a stray byte after the end record', async () => {
  const zip = await zipOf({ 'a.xml': '<a/>' }), padded = new Uint8Array(zip.length + 1);
  padded.set(zip);
  assert.equal((await readZip(padded)).size, 1);
});

test('converters can raise the unpacked size limits', async () => {
  const entries = new Map();
  await deflateEntry(entries, 'big.xml', new Uint8Array(11_000_000));
  const zip = writeZip(entries);
  await assert.rejects(readZip(zip, { maxBytes: 60e6 }), /too large when unpacked/);
  assert.equal((await readZip(zip, { maxBytes: 60e6, maxPart: 60e6, maxExpanded: 200e6 })).size, 1);
});

test('reads slides in order when the slide id and relationship id differ', async () => {
  const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const slide = (title) => `<p:sld ${P}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
  const deck = await zipOf({
    'ppt/presentation.xml': `<p:presentation ${P}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${rel}" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${rel}" Target="slides/slide2.xml"/></Relationships>`,
    'ppt/slides/slide1.xml': slide('First file'), 'ppt/slides/slide2.xml': slide('Second file'),
  });
  const doc = await blocksFromPptx(withFlags(deck, 0x0006));
  assert.deepEqual(doc.blocks.filter((b) => b.t === 'h').map((b) => b.runs[0].text), ['Second file', 'First file']);
});
