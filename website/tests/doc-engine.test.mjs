import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMParser } from '@xmldom/xmldom';
import * as doc from '../dist/conv-doc.js';
import { trimFont } from '../dist/font-trim.js';
import { readZip, unpack } from '../dist/office-zip.js';
import { PDFDocument } from '../dist/vendor/pdf-lib.esm.min.js';
import * as libs from './helpers/node-libs.mjs';

globalThis.DOMParser = DOMParser;
const text = (bytes) => new TextDecoder().decode(bytes);
const parts = async (bytes) => { const out = {}; for (const [name, entry] of await readZip(bytes)) out[name] = await unpack(entry); return out; };
// A 2x1 PNG, enough for size checks.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));

const rich = { title: 'Report', blocks: [
  { t: 'h', level: 1, runs: [{ text: 'Report' }], align: 'center' },
  { t: 'p', runs: [{ text: 'Plain ' }, { text: 'bold', b: true }, { text: ' ' }, { text: 'gone', s: true }, { text: ' ' }, { text: 'under', u: true }, { text: ' x' }, { text: '2', sup: true }, { text: ' ' }, { text: 'site', href: 'https://example.com' }], align: 'justify' },
  { t: 'li', ordered: false, depth: 0, n: 1, runs: [{ text: 'bullet' }] },
  { t: 'li', ordered: false, depth: 1, n: 1, runs: [{ text: 'nested' }] },
  { t: 'li', ordered: true, depth: 0, n: 1, runs: [{ text: 'one' }] },
  { t: 'li', ordered: true, depth: 0, n: 2, runs: [{ text: 'two' }] },
  { t: 'p', runs: [{ text: 'between' }] },
  { t: 'li', ordered: true, depth: 0, n: 5, runs: [{ text: 'five' }] },
  { t: 'li', ordered: false, depth: 0, n: 1, task: true, runs: [{ text: 'done' }] },
  { t: 'quote', quote: 1, runs: [{ text: 'outer' }] },
  { t: 'quote', quote: 2, runs: [{ text: 'inner' }] },
  { t: 'code', lang: 'js', text: 'if (a) {\n    b();\n}' },
  { t: 'table', align: ['left', 'right'], rows: [[[{ text: 'Name' }], [{ text: 'Cost' }]], [[{ text: 'Design' }], [{ text: '$10' }]]] },
  { t: 'img', bytes: PNG, mime: 'image/png', width: 200, height: 100, alt: 'banner' },
  { t: 'break' },
  { t: 'hr' },
] };

test('pictures report their size from the header', () => {
  assert.deepEqual(doc.imageSize(PNG), { mime: 'image/png', width: 2, height: 1 });
  assert.equal(doc.imageSize(new Uint8Array([1, 2, 3, 4])), null);
});

test('Markdown front matter is settings, not content', () => {
  assert.deepEqual(doc.splitFrontMatter('---\ntitle: "My doc"\ntags: a\n---\n# Hi\n'), { body: '# Hi\n', title: 'My doc' });
  assert.equal(doc.splitFrontMatter('---\n\nJust a rule then text\n').body, '---\n\nJust a rule then text\n');
});

test('Markdown keeps tasks, alignment, nested quotes, code language and strikethrough', () => {
  const md = doc.toMarkdown(rich, { image: () => 'pic.png' });
  assert.match(md, /~~gone~~/); assert.match(md, /<u>under<\/u>/); assert.match(md, /x<sup>2<\/sup>/);
  assert.match(md, /- bullet\n {4}- nested\n1\. one\n2\. two/);
  assert.match(md, /5\. five/); assert.match(md, /- \[x\] done/);
  assert.match(md, /> outer\n>\n> > inner/);
  assert.match(md, /```js\nif \(a\) \{\n {4}b\(\);\n\}\n```/);
  assert.match(md, /\| --- \| ---: \|/);
  assert.match(md, /!\[banner\]\(pic\.png\)/);
  assert.equal(doc.toMarkdown({ blocks: [{ t: 'p', runs: [{ text: '# not a heading' }] }, { t: 'p', runs: [{ text: '1. not a list' }] }] }), '\\# not a heading\n\n1\\. not a list\n');
  assert.match(doc.toMarkdown({ blocks: [{ t: 'p', runs: [{ text: 'a ``tick`` b', code: true }] }] }), /^``` a ``tick`` b ```/);
});

test('HTML is valid XHTML too, with nested lists and quotes closed properly', () => {
  const html = doc.toHtmlBody(rich);
  let error = null;
  new DOMParser({ onError: (level, msg) => { if (level !== 'warning') error = msg; } }).parseFromString('<div>' + html + '</div>', 'application/xml');
  assert.equal(error, null);
  assert.match(html, /<ul><li>bullet<ul><li>nested<\/li><\/ul>\n<\/li><\/ul>\n<ol><li>one<\/li>\n<li>two<\/li><\/ol>/);
  assert.match(html, /<ol start="5"><li>five/);
  assert.match(html, /<blockquote>\n<p>outer<\/p>\n<blockquote>\n<p>inner<\/p>\n<\/blockquote>\n<\/blockquote>/);
  assert.match(html, /<th>Name<\/th><th style="text-align:right">Cost<\/th>/);
  assert.match(html, /<img src="data:image\/png;base64,[^"]+" alt="banner" width="200" height="100" \/>/);
});

test('Word files get real lists, a header row, pictures and no author data', async () => {
  const files = await parts(await doc.toDocx(rich));
  assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/media/image1.png', 'word/numbering.xml', 'word/styles.xml']);
  const body = text(files['word/document.xml']), numbering = text(files['word/numbering.xml']);
  for (const xml of [body, numbering, text(files['word/styles.xml'])]) { let error = null; new DOMParser({ onError: (l, m) => { if (l !== 'warning') error = m; } }).parseFromString(xml, 'application/xml'); assert.equal(error, null); }
  assert.ok(!/•\t|1\.\t/.test(body), 'no typed bullets or numbers');
  // Bullets, the first numbered list, and the one that restarts at 5 are three lists.
  assert.deepEqual([...body.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]), ['1', '1', '2', '2', '3']);
  assert.match(numbering, /<w:abstractNum w:abstractNumId="3">.*?<w:lvl w:ilvl="0"><w:start w:val="5"\/><w:numFmt w:val="decimal"\/>/);
  assert.match(numbering, /<w:abstractNum w:abstractNumId="1">.*?<w:numFmt w:val="bullet"\/>/);
  assert.match(body, /<w:tblHeader\/>/); assert.match(body, /<w:jc w:val="both"\/>/); assert.match(body, /<w:strike\/>/);
  assert.match(body, /<a:blip r:embed="rIdImage1"\/>/); assert.match(body, /<w:br w:type="page"\/>/);
  assert.match(body, /<w:pStyle w:val="Code"\/>.*if \(a\) \{<\/w:t><w:br\/><w:t xml:space="preserve"> {4}b\(\);/);
  assert.ok(!Object.keys(files).some((n) => n.startsWith('docProps')), 'no document properties');
});

test('a Word file reads back as the same structure', async () => {
  const back = await doc.blocksFromDocx(await doc.toDocx(rich));
  const shape = (b) => b.t + (b.t === 'li' ? ':' + (b.ordered ? b.n : '•') + '@' + b.depth : b.t === 'h' ? b.level : '');
  assert.deepEqual(back.blocks.map(shape), ['h1', 'p', 'li:•@0', 'li:•@1', 'li:1@0', 'li:2@0', 'p', 'li:5@0', 'p', 'quote', 'quote', 'code', 'table', 'img', 'break', 'p'].slice(0, back.blocks.length));
  assert.equal(back.title, 'Report');
  assert.equal(back.blocks[0].align, 'center');
  const p = back.blocks[1];
  assert.equal(p.align, 'justify');
  assert.ok(p.runs.find((r) => r.text === 'bold').b); assert.ok(p.runs.find((r) => r.text === 'gone').s); assert.ok(p.runs.find((r) => r.text === 'under').u);
  assert.ok(p.runs.find((r) => r.text === '2').sup); assert.equal(p.runs.find((r) => r.text === 'site').href, 'https://example.com');
  const table = back.blocks.find((b) => b.t === 'table');
  assert.deepEqual(table.rows.map((row) => row.map(doc.plain)), [['Name', 'Cost'], ['Design', '$10']]);
  assert.equal(back.blocks.find((b) => b.t === 'code').text, 'if (a) {\n    b();\n}');
  const image = back.blocks.find((b) => b.t === 'img');
  assert.equal(image.mime, 'image/png'); assert.equal(image.width, 200); assert.equal(image.alt, 'banner');
});

test('ODT, RTF and EPUB carry pictures and tables', async () => {
  const odt = await parts(await doc.toOdt(rich));
  assert.ok(odt['Pictures/image1.png']); assert.match(text(odt['META-INF/manifest.xml']), /Pictures\/image1\.png/); assert.match(text(odt['content.xml']), /table:table-cell/);
  const epub = await parts(await doc.toEpub(rich, 'urn:test'));
  assert.ok(epub['OEBPS/images/image1.png']); assert.match(text(epub['OEBPS/content.opf']), /images\/image1\.png" media-type="image\/png"/); assert.match(text(epub['OEBPS/c0.xhtml']), /<img src="images\/image1\.png"/);
  const rtf = doc.toRtf(rich);
  assert.match(rtf, /\\trowd/); assert.match(rtf, /\\pngblip/); assert.match(rtf, /\\strike /);
});

test('the PDF writer lays out every block and keeps the file small', async () => {
  const bytes = await doc.toPdf(rich, libs);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(pdf.getPageCount(), 2, 'the page break starts a second page');
  assert.equal(pdf.getTitle(), 'Report'); assert.equal(pdf.getProducer(), undefined); assert.equal(pdf.getCreationDate(), undefined);
  assert.ok(bytes.length < 120_000, 'fonts are trimmed to the letters used, got ' + bytes.length);
  assert.equal(pdf.getPage(0).node.Annots()?.size(), 1, 'the link is clickable');
  // Long tables carry over to new pages instead of running off the bottom.
  const long = { blocks: [{ t: 'table', rows: Array.from({ length: 120 }, (_, r) => [[{ text: 'Row ' + r }], [{ text: 'A fairly long cell that has to wrap onto a second line inside its column for sure '.repeat(2) }]]) }] };
  assert.ok((await PDFDocument.load(await doc.toPdf(long, libs))).getPageCount() >= 4);
});

test('font trimming keeps glyph numbers and drops unused outlines', async () => {
  const font = new Uint8Array(await readFile(new URL('../dist/vendor/fonts/NotoSans-Regular.ttf', import.meta.url)));
  const small = trimFont(font, new Set([36, 37, 38]));
  assert.ok(small.length < font.length / 8, 'much smaller: ' + small.length);
  const view = new DataView(small.buffer);
  assert.equal(view.getUint32(0), 0x00010000);
  const tags = Array.from({ length: view.getUint16(4) }, (_, i) => String.fromCharCode(...small.subarray(12 + i * 16, 16 + i * 16)));
  assert.ok(tags.includes('glyf') && tags.includes('loca') && tags.includes('hmtx') && !tags.includes('GSUB'));
  assert.equal(trimFont(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), new Set([1])).length, 12, 'unknown data is returned as is');
});
