import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { processOffice } from '../dist/office.js';
import { readZip, writeZip, replaceEntry, unpack, crc32 } from '../dist/office-zip.js';

globalThis.DOMParser = class {
  parseFromString(text, type) { return new DOMParser({ onError: (level, message) => { throw new Error(message); } }).parseFromString(text, type); }
};
globalThis.XMLSerializer = XMLSerializer;
const enc = new TextEncoder(), dec = new TextDecoder();
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const word = (body) => `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
const required = { docx: 'word/document.xml', pptx: 'ppt/presentation.xml', xlsx: 'xl/workbook.xml' };
function packageFor(type, files, compressed = false) {
  const entries = new Map();
  const root = { docx: word(''), pptx: '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>', xlsx: `<workbook xmlns="${S}"/>` }[type];
  for (const [path, value] of Object.entries({ '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>', [required[type]]: root, ...files })) {
    replaceEntry(entries, path, typeof value === 'string' ? enc.encode(value) : value);
    const entry = entries.get(path); entry.time = 1234; entry.date = 23456;
    if (compressed) { entry.packed = new Uint8Array(deflateRawSync(entry.packed)); entry.method = 8; }
  }
  return writeZip(entries);
}
async function textPart(bytes, path) { return dec.decode(await unpack((await readZip(bytes)).get(path))); }
function texts(xml, ns, name = 't') { return Array.from(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagNameNS(ns, name)).map((n) => n.textContent); }

test('Word edits across styled runs; XML entities, quotes, figures, tables and binary parts survive', async () => {
  const body = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>In order </w:t></w:r><w:r><w:t>to utilize feedback &amp; improve.</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>“In order </w:t></w:r><w:r><w:t>to utilize 42”</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>We utilize data for 42 teams.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:r><w:t>Family 👩‍👩‍👧‍👦 فارسی می\u200cشود क्‍ष.</w:t></w:r></w:p>';
  const image = new Uint8Array([137, 80, 78, 71, 0, 255, 3]);
  const input = packageFor('docx', { 'word/document.xml': word(body), 'word/media/image1.png': image, 'word/styles.xml': '<styles>preserve</styles>', 'word/header1.xml': word('<w:p><w:r><w:t>utilize</w:t></w:r></w:p>') }, true);
  const snapshot = input.slice();
  const result = await processOffice(input, 'example.docx');
  assert.equal(result.report.edits.length, 3);
  const output = await textPart(result.bytes, 'word/document.xml');
  assert.deepEqual(texts(output, W).slice(0, 4), ['To', ' use feedback & improve.', '“In order ', 'to utilize 42”']);
  assert.match(output, /<w:t xml:space="preserve"> use feedback/);
  assert.match(output, /<w:b\/>/); assert.match(output, /<w:tbl>/); assert.match(output, /می\u200cشود/);
  const original = await readZip(input), exported = await readZip(result.bytes);
  for (const path of ['word/media/image1.png', 'word/styles.xml', 'word/header1.xml']) assert.deepEqual(exported.get(path).packed, original.get(path).packed);
  assert.deepEqual(input, snapshot);
});

test('Word skips headings, fields, tracked changes, code, links and boundaries; locks span runs', async () => {
  const xml = word('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>utilize</w:t></w:r></w:p>'
    + '<w:p><w:fldSimple w:instr="TOC"><w:r><w:t>utilize</w:t></w:r></w:fldSimple></w:p>'
    + '<w:p><w:ins><w:r><w:t>utilize</w:t></w:r></w:ins></w:p>'
    + '<w:p><w:r><w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr><w:t>utilize</w:t></w:r></w:p>'
    + '<w:p><w:hyperlink><w:r><w:t>utilize</w:t></w:r></w:hyperlink></w:p>'
    + '<w:p><w:r><w:t>in order</w:t><w:br/><w:t> to</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>in order </w:t></w:r><w:r><w:t>to utilize</w:t></w:r></w:p>');
  const input = packageFor('docx', { 'word/document.xml': xml });
  const result = await processOffice(input, 'example.docx', { locks: ['in order to utilize'] });
  assert.equal(result.report.edits.length, 0); assert.deepEqual(result.bytes, input);
});

test('quotations spanning paragraphs and multi-paragraph fields remain untouched', async () => {
  const input = packageFor('docx', { 'word/document.xml': word('<w:p><w:r><w:t>“Start</w:t></w:r></w:p><w:p><w:r><w:t>We utilize data in order to compare.</w:t></w:r></w:p><w:p><w:r><w:t>End”</w:t></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p><w:p><w:r><w:t>utilize</w:t></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>') });
  const result = await processOffice(input, 'protected.docx');
  assert.deepEqual(result.bytes, input); assert.equal(result.report.edits.length, 0);
});

test('slides edit across runs and retain shapes, positions, notes and master payloads', async () => {
  const slide = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm rot="123"/></p:spPr><p:txBody><a:p><a:r><a:rPr b="1"/><a:t>In order </a:t></a:r><a:r><a:t>to utilize feedback.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const input = packageFor('pptx', { 'ppt/slides/slide1.xml': slide, 'ppt/notesSlides/notesSlide1.xml': '<notes>utilize</notes>', 'ppt/slideMasters/slideMaster1.xml': '<master/>' });
  const result = await processOffice(input, 'slides.pptx');
  const output = await textPart(result.bytes, 'ppt/slides/slide1.xml');
  assert.deepEqual(texts(output, A), ['To', ' use feedback.']); assert.match(output, /rot="123"/); assert.match(output, /b="1"/);
  assert.equal(await textPart(result.bytes, 'ppt/notesSlides/notesSlide1.xml'), '<notes>utilize</notes>');
});

test('spreadsheets edit eligible shared and inline prose, leaving formulas, headers, labels and cached results', async () => {
  const strings = `<sst xmlns="${S}"><si><t>In order to utilize feedback.</t></si><si><t>We utilize customer feedback daily.</t></si><si><t>utilize</t></si></sst>`;
  const sheet = `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c><c r="D2"><f>SUM(A1:A9)</f><v>42</v></c><c r="E2" t="str"><f>CONCAT(A1)</f><v>We utilize customer feedback.</v></c><c r="F2" t="inlineStr"><is><t>We utilize customer feedback daily.</t></is></c></row></sheetData></worksheet>`;
  const input = packageFor('xlsx', { 'xl/sharedStrings.xml': strings, 'xl/worksheets/sheet1.xml': sheet });
  const result = await processOffice(input, 'sheet.xlsx');
  const ss = await textPart(result.bytes, 'xl/sharedStrings.xml'), ws = await textPart(result.bytes, 'xl/worksheets/sheet1.xml');
  assert.deepEqual(texts(ss, S), ['In order to utilize feedback.', 'We use customer feedback daily.', 'utilize']);
  assert.match(ws, /<f>SUM\(A1:A9\)<\/f><v>42<\/v>/); assert.match(ws, /<v>We utilize customer feedback.<\/v>/); assert.match(ws, /<t>We use customer feedback daily.<\/t>/);
});

test('metadata copy removes defined properties and archive dates while all content payloads remain identical', async () => {
  const input = packageFor('docx', { 'word/document.xml': word('<w:p><w:r><w:t>We utilize data.</w:t></w:r></w:p>'), 'docProps/core.xml': '<cp:coreProperties xmlns:cp="urn:core" xmlns:dc="urn:dc"><dc:creator>Alice &amp; Bob</dc:creator><cp:lastModifiedBy>Writer</cp:lastModifiedBy></cp:coreProperties>', 'docProps/custom.xml': '<Properties xmlns="urn:custom"><property name="Generator"><text>Example AI</text></property></Properties>', 'docProps/app.xml': '<Properties xmlns="urn:app"><Application>Example</Application><Company>Private</Company><Pages>3</Pages></Properties>', 'word/comments.xml': '<comments>Retained</comments>' }, true);
  const result = await processOffice(input, 'private.docx', { metadata: true });
  assert.equal(result.report.properties.length, 5);
  assert.doesNotMatch(await textPart(result.bytes, 'docProps/core.xml'), /Alice|Bob|Writer/);
  assert.doesNotMatch(await textPart(result.bytes, 'docProps/custom.xml'), /Example AI/);
  assert.match(await textPart(result.bytes, 'docProps/app.xml'), /<Pages>3<\/Pages>/);
  const original = await readZip(input), cleaned = await readZip(result.bytes);
  for (const [path, entry] of original) if (!path.startsWith('docProps/')) assert.deepEqual(cleaned.get(path).packed, entry.packed);
  for (const entry of cleaned.values()) { assert.equal(entry.time, 0); assert.equal(entry.date, 33); }
});

test('malformed XML, entities, disguised formats, macros, signatures and unsupported files fail closed', async () => {
  const valid = packageFor('docx', { 'word/document.xml': word('') });
  await assert.rejects(processOffice(valid, 'old.doc'), /Choose/);
  await assert.rejects(processOffice(valid, 'fake.pptx'), /extension/);
  for (const xml of [word('<w:p>'), '<!DOCTYPE root [<!ENTITY secret SYSTEM "file:///private">]><root>&secret;</root>']) await assert.rejects(processOffice(packageFor('docx', { 'word/document.xml': xml }), 'bad.docx'));
  for (const path of ['word/vbaProject.bin', '_xmlsignatures/sig1.xml']) await assert.rejects(processOffice(packageFor('docx', { 'word/document.xml': word(''), [path]: new Uint8Array([1]) }), 'bad.docx'), /supported/);
});

test('ZIP parser catches corruption, duplicates, unsafe paths, overstated sizes and decompression overflow', async () => {
  const input = packageFor('docx', { 'word/document.xml': word('') });
  const corrupt = input.slice(); corrupt[70] ^= 1;
  await assert.rejects(readZip(corrupt));
  const entries = new Map(); replaceEntry(entries, '../document.xml', enc.encode('content'));
  await assert.rejects(readZip(writeZip(entries)));
  const duplicates = new Map(); replaceEntry(duplicates, 'same.xml', enc.encode('a')); duplicates.set('other', { ...duplicates.get('same.xml') });
  await assert.rejects(readZip(writeZip(duplicates)));
  const small = new Map(); replaceEntry(small, 'part', enc.encode('content')); small.get('part').size = 31_000_000;
  await assert.rejects(readZip(writeZip(small)), /large/);
  const overflow = new Map(); replaceEntry(overflow, 'part', enc.encode('a'.repeat(100000))); const e = overflow.get('part'); e.method = 8; e.packed = new Uint8Array(deflateRawSync(e.packed)); e.size = 1; e.crc = crc32(enc.encode('a'));
  await assert.rejects(readZip(writeZip(overflow)));
});

test('one inch mark in a Word file does not stop every later edit', async () => {
  const body = '<w:p><w:r><w:t>The desk is 27" wide.</w:t></w:r></w:p><w:p><w:r><w:t>It is important to note that we utilize it daily.</w:t></w:r></w:p>';
  const result = await processOffice(packageFor('docx', { 'word/document.xml': word(body) }), 'inch.docx', { mode: 'humanize' });
  assert.ok(result.report.edits.length > 0);
  const out = texts(await textPart(result.bytes, 'word/document.xml'), W).join('|');
  assert.ok(out.startsWith('The desk is 27" wide.|'), out);
  assert.ok(!/important to note|utilize/.test(out), out);
});
