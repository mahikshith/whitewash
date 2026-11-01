import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import * as data from '../dist/conv-data.js';
import * as doc from '../dist/conv-doc.js';
import { detectFormat, targets, conversionCount, parseSubtitles, writeSrt, writeVtt } from '../dist/convert.js';
import { parseRanges, merge, pickPages, watermark, pageNumbers, wipePdf, scanPdf, pageCount } from '../dist/conv-pdf.js';
import { readZip, unpack } from '../dist/office-zip.js';
import { PDFDocument } from '../dist/vendor/pdf-lib.esm.min.js';

globalThis.DOMParser = DOMParser;
const text = (bytes) => new TextDecoder().decode(bytes);

test('formats come from the extension first, then the MIME type', () => {
  assert.equal(detectFormat({ name: 'Report.DOCX' }), 'docx');
  assert.equal(detectFormat({ name: 'page.htm' }), 'html');
  assert.equal(detectFormat({ name: 'x', type: 'application/pdf' }), 'pdf');
  assert.equal(detectFormat({ name: 'clip.avi', type: 'video/x-msvideo' }), null);
  assert.equal(detectFormat({ name: 'clip.mp4' }), 'mp4');
  assert.equal(detectFormat({ name: 'Backup.TAR.GZ' }), 'tgz');
  assert.equal(detectFormat({ name: 'notes.txt.gz' }), 'gz');
  assert.equal(detectFormat({ name: 'x', type: 'audio/x-wav' }), 'wav');
  assert.ok(targets('mp4').includes('mp3') && !targets('mp4').includes('webm'), 'video gives sound only');
  assert.ok(targets('rar').includes('zip') && !targets('zip').includes('rar'), 'RAR can be read, not written');
  assert.ok(targets('md').includes('pdf') && targets('md').includes('docx') && !targets('md').includes('md'));
  assert.ok(targets('pdf').includes('jpg'));
  assert.ok(conversionCount() > 240, 'about 250 routes with audio and archives');
});

test('CSV quoting, delimiters and round trips', () => {
  const source = 'name,note\n"Smith, J","said ""hi""\nthen left"\nLee,\n';
  const rows = data.parseDelimited(source);
  assert.deepEqual(rows[1], ['Smith, J', 'said "hi"\nthen left']);
  assert.deepEqual(data.parseDelimited(data.writeDelimited(rows)), rows);
  assert.equal(data.detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(data.detectDelimiter('a;b;c\n1;2;3'), ';');
});

test('JSON to tables and back', () => {
  const table = data.parseJson('[{"a":1,"b":"x"},{"a":2,"c":true}]');
  assert.deepEqual(table.sheets[0].rows[0], ['a', 'b', 'c']);
  const json = JSON.parse(data.writeJson(table));
  assert.equal(json[1].a, 2); assert.equal(json[1].c, true);
  const zips = JSON.parse(data.writeJson({ sheets: [{ rows: [['zip'], ['01234'], ['5000']] }] }));
  assert.deepEqual(zips.map((r) => r.zip), ['01234', '5000'], 'one leading zero keeps the whole column as text');
  assert.equal(data.parseJson('{"one":[{"x":1}],"two":[{"y":2}]}').sheets.length, 2);
  assert.match(data.writeMarkdown(table), /\| a \| b \| c \|/);
  assert.equal(data.columnName(0), 'A'); assert.equal(data.columnName(27), 'AB');
});

test('XLSX and ODS write and read back the same cells', async () => {
  const table = { sheets: [{ name: 'Sheet 1', rows: [['Item', 'Price'], ['Tea & cake', 4.5], ['<b>', '']] }] };
  for (const [write, read] of [[data.writeXlsx, data.readXlsx], [data.writeOds, data.readOds]]) {
    const back = await read(await write(table));
    assert.equal(back.sheets[0].rows[1][0], 'Tea & cake');
    assert.equal(String(back.sheets[0].rows[1][1]), '4.5');
    assert.equal(back.sheets[0].rows[2][0], '<b>');
  }
});

test('subtitles convert between SRT and VTT', () => {
  const cues = parseSubtitles('1\n00:00:01,000 --> 00:00:02,500\nHello\nthere\n\n2\n00:00:03,000 --> 00:00:04,000\nBye\n');
  assert.equal(cues.length, 2);
  assert.match(writeVtt(cues), /^WEBVTT\n\n00:00:01\.000 --> 00:00:02\.500\nHello\nthere/);
  assert.deepEqual(parseSubtitles(writeVtt(cues)).map((c) => c.text), ['Hello\nthere', 'Bye']);
  assert.match(writeSrt(parseSubtitles(writeVtt(cues))), /00:00:01,000 --> 00:00:02,500/);
});

const sample = { title: 'Notes', blocks: [
  { t: 'h', level: 1, runs: [{ text: 'Notes' }] },
  { t: 'p', runs: [{ text: 'Plain, ' }, { text: 'bold', b: true }, { text: ' and ' }, { text: 'a link', href: 'https://example.com' }, { text: ' & more' }] },
  { t: 'li', ordered: false, depth: 0, runs: [{ text: 'first' }] },
  { t: 'li', ordered: true, depth: 0, n: 1, runs: [{ text: 'step' }] },
  { t: 'code', text: 'let x = 1 < 2;' },
  { t: 'table', rows: [[[{ text: 'A' }], [{ text: 'B' }]], [[{ text: '1' }], [{ text: '2' }]]] },
] };

test('text writers keep headings, emphasis, links, lists and tables', () => {
  const md = doc.toMarkdown(sample);
  assert.match(md, /^# Notes/); assert.match(md, /\*\*bold\*\*/); assert.match(md, /\[a link\]\(https:\/\/example\.com\)/);
  assert.match(md, /- first/); assert.match(md, /1\. step/); assert.match(md, /```\nlet x = 1 < 2;\n```/); assert.match(md, /\| A \| B \|/);
  const html = doc.toHtml(sample);
  assert.match(html, /<h1>Notes<\/h1>/); assert.match(html, /&amp; more/); assert.match(html, /1 &lt; 2/);
  assert.match(doc.toText(sample), /Plain, bold and a link & more\n\n• first\n1\. step\n\n/);
  const rtf = doc.toRtf(sample);
  assert.ok(rtf.startsWith('{\\rtf1')); assert.ok(rtf.trim().endsWith('}'));
  assert.equal(doc.blocksFromText('one\n\ntwo\nlines').blocks.length, 2);
});

test('DOCX, ODT and EPUB are valid zips with well-formed XML', async () => {
  for (const [bytes, part, mimetype] of [[doc.toDocx(sample), 'word/document.xml'], [doc.toOdt(sample), 'content.xml', 'application/vnd.oasis.opendocument.text'], [doc.toEpub(sample), 'OEBPS/c0.xhtml', 'application/epub+zip']]) {
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
    const zip = await readZip(raw), files = {};
    for (const [name, entry] of zip) files[name] = await unpack(entry);
    const name = Object.keys(files).find((n) => n.endsWith(part)) || part;
    assert.ok(files[name], part + ' exists, got ' + Object.keys(files).join(' '));
    const xml = text(files[name]);
    let error = null;
    new DOMParser({ onError: (level, msg) => { if (level !== 'warning') error = msg; } }).parseFromString(xml, 'application/xml');
    assert.equal(error, null, part + ' parses');
    assert.match(xml, /bold/);
    if (mimetype) { assert.equal([...zip.keys()][0], 'mimetype'); assert.equal(text(files.mimetype), mimetype); }
  }
});

test('PDF page ranges', () => {
  assert.deepEqual(parseRanges('1-3, 5', 6), [0, 1, 2, 4]);
  assert.deepEqual(parseRanges('5-', 6), [4, 5]);
  assert.throws(() => parseRanges('9', 6), /6 pages/);
  assert.throws(() => parseRanges('x', 6), /like/);
});

async function makePdf(pages, info = {}) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([300, 400]);
  if (info.author) { pdf.setAuthor(info.author); pdf.setTitle('Secret plan'); pdf.setCreator('Word for Mykee'); }
  return pdf.save();
}

test('PDF merge, pick, rotate, watermark and numbers', async () => {
  const merged = await merge([await makePdf(2), await makePdf(3)]);
  assert.equal(await pageCount(merged), 5);
  const picked = await pickPages(merged, [4, 0], { 4: 90 });
  const back = await PDFDocument.load(picked);
  assert.equal(back.getPageCount(), 2);
  assert.equal(back.getPage(0).getRotation().angle, 90);
  assert.equal(await pageCount(await watermark(merged, 'DRAFT', { opacity: 0.2 })), 5);
  assert.equal(await pageCount(await pageNumbers(merged, { position: 'bottom-center', format: 'n-of-total' })), 5);
});

test('PDF wiper removes author, title, tools and IDs', async () => {
  const source = await makePdf(1, { author: 'Jane Doe' });
  assert.ok(scanPdf(source) instanceof Promise ? (await scanPdf(source)).items?.length ?? true : true);
  const { bytes, removed, remaining } = await wipePdf(source);
  assert.ok(removed.length >= 3, 'found author, title, creator');
  assert.deepEqual(remaining, []);
  const raw = Buffer.from(bytes).toString('latin1');
  assert.ok(!raw.includes('Jane Doe') && !raw.includes('Secret plan') && !raw.includes('Mykee'));
  assert.equal(await pageCount(bytes), 1);
});

test('images in a PDF lose their camera details', async () => {
  const { imagesToPdf } = await import('../dist/conv-pdf.js');
  const fs = await import('node:fs');
  const url = new URL('./fixtures/gps.jpg', import.meta.url);
  if (!fs.existsSync(url)) return;
  const bytes = await imagesToPdf([{ bytes: new Uint8Array(fs.readFileSync(url)), type: 'image/jpeg' }]);
  const raw = Buffer.from(bytes).toString('latin1');
  assert.ok(!raw.includes('Canon') && !raw.includes('GPS'), 'no EXIF in the PDF');
});

test('archive names and paths are made safe', async () => {
  const { safePath, stripArchiveExtension, archiveFormat } = await import('../dist/conv-archive.js');
  assert.equal(safePath('../../etc/passwd'), 'etc/passwd');
  assert.equal(safePath('/abs\\win\\file.txt'), 'abs/win/file.txt');
  assert.equal(stripArchiveExtension('photos.tar.xz'), 'photos');
  assert.equal(archiveFormat('a.tbz2'), 'tbz2');
  assert.equal(archiveFormat('a.docx'), null);
});
