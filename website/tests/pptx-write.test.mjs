import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { writePptx, blocksToSlides, cleanFont } from '../dist/pptx-write.js';
import { slidesFromPages, textBoxes, lift, firstBaseline } from '../dist/pdf-to-pptx.js';
import { readZip, unpack } from '../dist/office-zip.js';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const decode = (bytes) => new TextDecoder().decode(bytes);
const parse = (xml) => new DOMParser().parseFromString(xml, 'text/xml');
async function open(bytes) {
  const entries = await readZip(bytes), parts = {};
  for (const [name, entry] of entries) parts[name] = await unpack(entry);
  return { entries, parts, xml: (name) => parse(decode(parts[name])), text: (name) => decode(parts[name]) };
}
const tags = (node, name) => Array.from(node.getElementsByTagName(name));
const textOf = (node) => tags(node, 'a:t').map((t) => t.textContent).join('');
const p = (text) => ({ t: 'p', runs: [{ text }] });

test('font names from a PDF become families Office knows', () => {
  assert.equal(cleanFont('ABCDEF+Calibri-BoldItalic'), 'Calibri');
  assert.equal(cleanFont('ArialMT'), 'Arial');
  assert.equal(cleanFont('Arial-BoldMT'), 'Arial');
  assert.equal(cleanFont('TimesNewRomanPSMT'), 'Times New Roman');
  assert.equal(cleanFont('TimesNewRomanPS-BoldItalicMT'), 'Times New Roman');
  assert.equal(cleanFont('Helvetica-Oblique'), 'Arial');
  assert.equal(cleanFont('CourierNew'), 'Courier New');
  assert.equal(cleanFont('Times-Roman'), 'Times New Roman');
  assert.equal(cleanFont('XYZXYZ+LiberationSans-Bold'), 'Arial');
  assert.equal(cleanFont('BAAAAA+Carlito-Regular'), 'Calibri');
  assert.equal(cleanFont('SegoeUI-Semibold'), 'Segoe UI');
  assert.equal(cleanFont('Calibri-Light'), 'Calibri Light');
  assert.equal(cleanFont('OpenSans-Regular'), 'Open Sans');
  assert.equal(cleanFont('Georgia,Bold'), 'Georgia');
  assert.equal(cleanFont('sans-serif'), '');
  assert.equal(cleanFont(''), '');
});

test('writePptx makes a package PowerPoint can open', async () => {
  const bytes = await writePptx({ width: 612, height: 792, slides: [
    { background: '102030', items: [
      { type: 'image', x: 0, y: 0, w: 612, h: 792, bytes: PNG, mime: 'image/png' },
      { type: 'text', x: 72, y: 100, w: 200, h: 20, wrap: false, autofit: true, paragraphs: [{ runs: [
        { text: 'Hello & <world>\u0001', size: 12, b: true, color: 'c00000', font: 'ABCDEF+Calibri-Bold' },
        { text: ' link', size: 12, i: true, u: true, href: 'https://example.com/a?b=1&c=2' },
        { text: ' bad', href: 'javascript:alert(1)' },
        { text: 'two\nlines', size: 10.5, spc: 1.5 },
      ] }] },
      { type: 'rect', x: 10, y: 20, w: 30, h: 40, fill: 'FF0000', line: '000000' },
      { type: 'table', x: 72, y: 300, w: 300, h: 60, rows: [[{ runs: [{ text: 'Head' }] }, { runs: [{ text: 'B' }] }], [[{ text: 'cell' }], { runs: [{ text: 'd' }] }]] },
    ] },
    { items: [
      { type: 'text', placeholder: 'title', x: 50, y: 30, w: 500, h: 50, paragraphs: [{ runs: [{ text: 'A title', size: 30 }] }] },
      { type: 'text', placeholder: 'body', x: 50, y: 100, w: 500, h: 300, paragraphs: [
        { bullet: 'char', level: 1, runs: [{ text: 'bullet' }] }, { bullet: 'number', start: 3, align: 'center', runs: [{ text: 'third' }] }, { spacing: 14, runs: [{ text: 'spaced' }] }] },
      { type: 'image', x: 1, y: 2, w: 3, h: 4, bytes: JPEG, mime: 'image/jpeg' },
      { type: 'image', x: 5, y: 6, w: 7, h: 8, bytes: PNG, mime: 'image/png' },
      { type: 'text', x: 0, y: 0, w: 100, h: 20, rot: 90, paragraphs: [] },
    ] },
  ] });
  const pkg = await open(bytes);
  const names = [...pkg.entries.keys()];
  for (const need of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideMasters/_rels/slideMaster1.xml.rels', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/slideLayout2.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/_rels/slide1.xml.rels']) assert.ok(names.includes(need), need);
  assert.equal(names[0], '[Content_Types].xml');
  assert.ok(!names.some((n) => n.startsWith('docProps')), 'no author, dates or app name');
  for (const entry of pkg.entries.values()) assert.deepEqual([entry.time, entry.date], [0, 33], 'no timestamps in the zip');
  // Every XML part parses, and every relationship points at a part that exists.
  const types = pkg.xml('[Content_Types].xml');
  const overrides = tags(types, 'Override').map((o) => o.getAttribute('PartName'));
  for (const name of names) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const doc = pkg.xml(name);
    assert.ok(doc.documentElement, name);
    if (!name.endsWith('.rels') && name !== '[Content_Types].xml') assert.ok(overrides.includes('/' + name), 'content type for ' + name);
    if (!name.endsWith('.rels')) continue;
    const base = name.replace(/_rels\/[^/]+$/, '');
    for (const rel of tags(doc, 'Relationship')) {
      if (rel.getAttribute('TargetMode') === 'External') continue;
      const target = new URL(rel.getAttribute('Target'), 'http://x/' + base).pathname.slice(1);
      assert.ok(names.includes(target), name + ' → ' + target);
    }
  }
  assert.deepEqual(tags(types, 'Default').map((d) => d.getAttribute('Extension')).sort(), ['jpeg', 'png', 'rels', 'xml']);

  const pres = pkg.xml('ppt/presentation.xml');
  const size = tags(pres, 'p:sldSz')[0];
  assert.deepEqual([size.getAttribute('cx'), size.getAttribute('cy')], [String(612 * 12700), String(792 * 12700)]);
  assert.equal(tags(pres, 'p:sldId').length, 2);
  assert.ok(tags(pres, 'p:sldId').every((s) => Number(s.getAttribute('id')) >= 256));

  const one = pkg.xml('ppt/slides/slide1.xml'), rels = pkg.xml('ppt/slides/_rels/slide1.xml.rels');
  assert.equal(textOf(one), 'Hello & <world> link badtwolinesHeadBcelld');
  assert.equal(tags(one, 'a:br').length, 1);
  assert.equal(tags(one, 'a:srgbClr')[0].getAttribute('val'), '102030', 'slide background');
  const box = tags(one, 'p:sp')[0], off = tags(box, 'a:off')[0], body = tags(box, 'a:bodyPr')[0];
  assert.deepEqual([off.getAttribute('x'), off.getAttribute('y')], [String(72 * 12700), String(100 * 12700)]);
  assert.deepEqual(['wrap', 'lIns', 'tIns', 'rIns', 'bIns'].map((a) => body.getAttribute(a)), ['none', '0', '0', '0', '0']);
  assert.equal(tags(body, 'a:spAutoFit').length, 1);
  const run = tags(box, 'a:rPr')[0];
  assert.deepEqual([run.getAttribute('sz'), run.getAttribute('b'), tags(run, 'a:latin')[0].getAttribute('typeface'), tags(run, 'a:srgbClr')[0].getAttribute('val')], ['1200', '1', 'Calibri', 'C00000']);
  assert.equal(tags(box, 'a:rPr')[3].getAttribute('spc'), '150');
  const links = tags(rels, 'Relationship').filter((r) => /hyperlink$/.test(r.getAttribute('Type')));
  assert.deepEqual(links.map((r) => [r.getAttribute('Target'), r.getAttribute('TargetMode')]), [['https://example.com/a?b=1&c=2', 'External']]);
  assert.equal(tags(one, 'a:hlinkClick').length, 1, 'only safe links are kept');
  assert.equal(tags(one, 'a:hlinkClick')[0].getAttribute('r:id'), links[0].getAttribute('Id'));
  const image = tags(rels, 'Relationship').find((r) => /image$/.test(r.getAttribute('Type')));
  assert.equal(tags(one, 'a:blip')[0].getAttribute('r:embed'), image.getAttribute('Id'));
  assert.deepEqual(pkg.parts['ppt/media/image1.png'], PNG);
  assert.equal(tags(one, 'a:gridCol').length, 2);
  assert.equal(tags(one, 'a:tr').length, 2);
  assert.match(tags(rels, 'Relationship')[0].getAttribute('Target'), /slideLayout1\.xml$/, 'no placeholders: blank layout');

  const two = pkg.xml('ppt/slides/slide2.xml'), rels2 = pkg.xml('ppt/slides/_rels/slide2.xml.rels');
  assert.match(tags(rels2, 'Relationship')[0].getAttribute('Target'), /slideLayout2\.xml$/);
  assert.deepEqual(tags(two, 'p:ph').map((ph) => ph.getAttribute('type') || 'body'), ['title', 'body']);
  assert.equal(tags(two, 'a:buChar').length, 1);
  assert.equal(tags(two, 'a:buAutoNum')[0].getAttribute('startAt'), '3');
  assert.equal(tags(two, 'a:spcPts').some((s) => s.getAttribute('val') === '1400'), true);
  assert.equal(tags(two, 'a:xfrm').pop().getAttribute('rot'), String(90 * 60000));
  assert.ok(names.includes('ppt/media/image2.jpeg'));
  assert.equal(names.filter((n) => n.startsWith('ppt/media/')).length, 2, 'the same picture is stored once');
  // Shape ids are unique on a slide.
  const ids = tags(two, 'p:cNvPr').map((n) => n.getAttribute('id'));
  assert.equal(new Set(ids).size, ids.length);

  // Nothing to show still gives one blank slide, and odd sizes are pulled into range.
  const empty = await open(await writePptx({ width: 10, height: 99999, slides: [] }));
  const small = tags(empty.xml('ppt/presentation.xml'), 'p:sldSz')[0];
  assert.deepEqual([small.getAttribute('cx'), small.getAttribute('cy')], [String(72 * 12700), String(4032 * 12700)]);
  assert.ok(empty.parts['ppt/slides/slide1.xml']);
});

test('a block list is laid out as slides', async () => {
  const long = 'This sentence is here to fill the slide with a fair amount of text. '.repeat(6);
  const doc = { title: 'Ignored when the first block is a title', blocks: [
    { t: 'h', level: 1, runs: [{ text: 'The Deck' }] },
    p('Opening words under the title.'),
    { t: 'h', level: 2, runs: [{ text: 'Lists' }] },
    { t: 'li', ordered: false, depth: 0, n: 1, runs: [{ text: 'bullet' }] },
    { t: 'li', ordered: false, depth: 1, n: 1, runs: [{ text: 'nested' }] },
    { t: 'li', ordered: true, depth: 0, n: 4, runs: [{ text: 'four' }] },
    { t: 'li', ordered: true, depth: 0, n: 5, runs: [{ text: 'five', b: true, href: 'https://example.com' }] },
    { t: 'li', ordered: false, depth: 0, n: 1, task: true, runs: [{ text: 'done' }] },
    { t: 'h', level: 3, runs: [{ text: 'A smaller heading' }] },
    { t: 'quote', runs: [{ text: 'Quoted.' }] },
    { t: 'code', text: 'let a = 1;\n\tlet b = 2;' },
    { t: 'hr' },
    { t: 'h', level: 2, runs: [{ text: 'Long part' }] },
    ...Array.from({ length: 8 }, () => p(long)),
    { t: 'h', level: 1, runs: [{ text: 'Data' }] },
    { t: 'table', rows: [[[{ text: 'Name' }], [{ text: 'Qty' }]], ...Array.from({ length: 40 }, (_, n) => [[{ text: 'Row ' + n }], [{ text: String(n) }]])] },
    { t: 'img', bytes: PNG, mime: 'image/png', width: 4000, height: 2000 },
    { t: 'break' },
    p('After the break.'),
    { t: 'mystery', runs: [{ text: 'An unknown block still shows its text.' }], extra: 1 },
    { t: 'mystery' },
  ] };
  const deck = blocksToSlides(doc);
  assert.deepEqual([deck.width, deck.height], [960, 540]);
  const title = (slide) => slide.items.find((i) => i.placeholder === 'title')?.paragraphs[0].runs[0].text;
  const titles = deck.slides.map(title);
  assert.equal(titles[0], 'The Deck');
  assert.equal(titles[1], 'The Deck', 'words after the title get a slide of their own');
  assert.equal(titles[2], 'Lists');
  assert.equal(titles[3], 'Long part');
  assert.equal(titles[4], 'Long part (cont.)');
  assert.ok(titles.filter((t) => t === 'Long part (cont.)').length >= 1);
  assert.ok(titles.includes('Data') && titles.includes('Data (cont.)'));
  assert.ok(!titles.some((t) => /\(cont\.\) \(cont\.\)/.test(t)));

  const lists = deck.slides[2].items.find((i) => i.placeholder === 'body').paragraphs;
  assert.deepEqual(lists.slice(0, 5).map((q) => [q.bullet, q.level, q.start, q.runs.map((r) => r.text).join('')]), [
    ['char', 0, undefined, 'bullet'], ['char', 1, undefined, 'nested'], ['number', 0, 4, 'four'], ['number', 0, 4, 'five'], ['char', 0, undefined, '☑ done']]);
  assert.equal(lists[3].runs[0].href, 'https://example.com');
  assert.equal(lists[5].runs[0].b, true, 'a small heading is bold text in the body');
  const code = deck.slides[2].items.find((i) => i.type === 'text' && i.paragraphs[0]?.runs[0]?.font === 'Courier New');
  assert.deepEqual(code.paragraphs.map((q) => q.runs[0].text), ['let a = 1;', '    let b = 2;']);

  // Everything stays on the slide.
  for (const slide of deck.slides) for (const item of slide.items) {
    assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= 960.01 && item.y + item.h <= 540.01, JSON.stringify([title(slide), item.type, item.x, item.y, item.w, item.h]));
  }
  const tables = deck.slides.flatMap((s) => s.items.filter((i) => i.type === 'table'));
  assert.ok(tables.length > 1, 'a long table is split over slides');
  assert.ok(tables.every((t) => t.rows[0][0].runs[0].text === 'Name'), 'with its header row on each');
  assert.equal(tables.reduce((sum, t) => sum + t.rows.length - 1, 0), 40);
  const picture = deck.slides.flatMap((s) => s.items).find((i) => i.type === 'image');
  assert.ok(Math.abs(picture.w / picture.h - 2) < 0.01, 'pictures keep their shape');
  const all = deck.slides.flatMap((s) => s.items).filter((i) => i.type === 'text').flatMap((i) => i.paragraphs).flatMap((q) => q.runs.map((r) => r.text)).join('|');
  assert.match(all, /After the break\./);
  assert.match(all, /An unknown block still shows its text\./);
  assert.equal((all.match(/This sentence is here/g) || []).length, 48, 'no text is lost when slides overflow');

  // The model writes to a valid package, with real tables and bullets.
  const pkg = await open(await writePptx(deck));
  assert.equal([...pkg.entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, deck.slides.length);
  assert.ok(tags(pkg.xml('ppt/slides/slide3.xml'), 'a:buAutoNum').length === 2);

  // No heading at all: the document title leads, then plain slides.
  const plain = blocksToSlides({ title: 'Notes', blocks: [p('One.'), p('Two.')] });
  assert.equal(title(plain.slides[0]), 'Notes');
  assert.equal(plain.slides.length, 2);
  assert.equal(blocksToSlides({ title: '', blocks: [] }).slides.length, 1);
  // One huge paragraph is cut at a word and carried over.
  const huge = blocksToSlides({ title: '', blocks: [p('word '.repeat(3000))] });
  assert.ok(huge.slides.length > 2);
  assert.equal(huge.slides.flatMap((s) => s.items).flatMap((i) => i.paragraphs || []).flatMap((q) => q.runs).map((r) => r.text).join(' ').match(/word/g).length, 3000);
});

test('PDF pages become a picture with text boxes on top', () => {
  const span = (text, x, y, more = {}) => ({ text, x, y, width: text.length * 5, size: 10, font: 'ABCDEF+ArialMT', b: false, i: false, mono: false, ops: [more.op ?? 0], ...more });
  const row = (y, ...spans) => ({ x: spans[0].x, y, width: spans[spans.length - 1].x + spans[spans.length - 1].width - spans[0].x, size: Math.max(...spans.map((s) => s.size)), spans });
  const page = { width: 612, height: 792, shows: 9, lines: [
    row(100, span('Title here', 72, 100, { size: 20, width: 100, b: true, color: 'C00000', op: 1 })),
    row(140, span('First line of a paragraph', 72, 140, { op: 2 }), span('bold end', 200, 140, { b: true, op: 3 })),
    row(152, span('second line of it', 72, 152, { op: 4 })),
    row(164, span('third line of it', 72, 164, { op: 5 })),
    row(200, span('Cell A', 72, 200, { op: 6 }), span('Cell B', 300, 200, { op: 6 })),
    row(240, span('invisible', 72, 240, { hidden: true, op: 7 })),
    row(260, span('', 72, 260, { width: 5, op: 8 }), span('after a symbol', 90, 260, { op: 8 })),
    row(280, span('never matched', 72, 280, { ops: [] })),
    { ...row(400, span('Sideways', 40, 400, { op: 0 })), angle: -90 },
  ] };
  const { spans, drop } = lift(page);
  assert.deepEqual([...drop].sort(), [0, 1, 2, 3, 4, 5, 6], 'operators shared with text that stays are not dropped');
  assert.equal(spans.size, 8);

  const boxes = textBoxes(page);
  assert.deepEqual(boxes.map((b) => b.lines.length), [1, 3, 1, 1, 1]);
  assert.equal(boxes[1].leading, 12);

  const picture = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: 'image/jpeg' };
  const deck = slidesFromPages([page, { ...page, width: 1224, height: 792 }, page], [picture, picture, { ...picture, full: true }]);
  assert.deepEqual([deck.width, deck.height], [612, 792]);
  const [one, two, three] = deck.slides;
  assert.deepEqual([one.items[0].type, one.items[0].x, one.items[0].y, one.items[0].w, one.items[0].h], ['image', 0, 0, 612, 792]);
  const texts = one.items.filter((i) => i.type === 'text');
  assert.deepEqual(texts.map((i) => i.paragraphs[0].runs.map((r) => r.text).join('')), ['Title here', 'First line of a paragraph bold end\nsecond line of it\nthird line of it', 'Cell A', 'Cell B', 'Sideways']);
  assert.ok(texts.every((i) => i.wrap === false && i.autofit === true));
  // A single line: the baseline sits the calibrated drop below the top of the box.
  const head = texts[0], run = head.paragraphs[0].runs[0];
  assert.ok(Math.abs(head.y + firstBaseline('ArialMT') * 20 - 100) < 0.01);
  assert.ok(firstBaseline('ArialMT') > 0.9 && firstBaseline('ArialMT') < 1);
  assert.deepEqual([head.x, run.size, run.b, run.color, run.font], [72, 20, true, 'C00000', 'ABCDEF+ArialMT']);
  // Stacked lines: exact leading, first baseline one leading less a fifth of the size down.
  const stack = texts[1];
  assert.equal(stack.paragraphs[0].spacing, 12);
  assert.ok(Math.abs(stack.y + 12 - 2 - 140) < 0.01);
  assert.equal(stack.paragraphs[0].runs.find((r) => r.b).text, 'bold end\n');
  assert.equal(texts[4].rot, 270);
  // A page of another size is scaled to fit and centred.
  const scaled = two.items.find((i) => i.type === 'text');
  assert.deepEqual([two.items[0].w, two.items[0].h, two.items[0].y], [612, 396, 198]);
  assert.equal(scaled.paragraphs[0].runs[0].size, 10);
  assert.equal(scaled.x, 36);
  // A picture that still shows its text gets no boxes.
  assert.deepEqual(three.items.map((i) => i.type), ['image']);
});
