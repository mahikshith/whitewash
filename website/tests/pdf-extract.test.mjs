import test from 'node:test';
import assert from 'node:assert/strict';
import { fontStyle, groupLines, lineText, walkOps, matchShows, imageBox, mul, blocksFromPdfPages } from '../dist/pdf-extract.js';

const text = (runs) => runs.map((r) => r.text).join('');
// Test pages are typed by hand: every letter is half its size wide.
const item = (str, x, y, more = {}) => ({ str, x, y, size: 10, width: str.length * (more.size || 10) * 0.5, font: 'ABCDEF+Body-Regular', b: false, i: false, mono: false, ...more });
const line = (str, x, y, more = {}) => groupLines([item(str, x, y, more)])[0];
const row = (y, cells, more = {}) => groupLines(cells.map(([str, x]) => item(str, x, y, more)))[0];
const page = (lines, more = {}) => ({ width: 612, height: 792, lines: lines.flat().sort((a, b) => a.y - b.y || a.x - b.x), images: [], ...more });
const FILL = 'word '.repeat(19).trim();  // 94 letters: 470pt at size 10, a full line from x=72
const para = (y, count, x = 72, words = FILL) => Array.from({ length: count }, (_, n) => line(n === count - 1 ? words.slice(0, 40) + '.' : words, x, y + n * 12));

test('font names give bold, italic and monospace', () => {
  assert.deepEqual(fontStyle('ABCDEF+Calibri-BoldItalic'), { b: true, i: true, mono: false });
  assert.deepEqual(fontStyle('TimesNewRomanPS-ItalicMT'), { b: false, i: true, mono: false });
  assert.deepEqual(fontStyle('CourierNewPSMT'), { b: false, i: false, mono: true });
  assert.deepEqual(fontStyle('XYZABC+Whatever', { bold: true, fallbackName: 'monospace' }), { b: true, i: false, mono: true });
  assert.deepEqual(fontStyle('Arial-Black'), { b: true, i: false, mono: false });
  assert.deepEqual(fontStyle('Helvetica'), { b: false, i: false, mono: false });
});

test('items on one baseline become a line of styled spans', () => {
  const lines = groupLines([
    item('world', 99, 100.3, { font: 'X+Body-Bold', b: true }),
    item('Hello', 72, 100),
    item(' ', 97, 100, { width: 2 }),
    item('2', 124.5, 97, { size: 6 }),
    item('Next line', 72, 112),
    item('far cell', 300, 112),
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].spans.map((s) => [s.text, s.b]), [['Hello ', false], ['world', true], ['2', false]]);
  assert.equal(lines[0].spans[2].sup, true, 'small raised text is a superscript');
  assert.equal(lines[0].y, 100);
  assert.equal(lines[0].size, 10);
  assert.equal(lineText(lines[0]), 'Hello world2');
  assert.equal(lines[1].spans.length, 2, 'a wide gap keeps two spans');
  assert.equal(lineText(lines[1]), 'Next line far cell');
  // The same words drawn twice a hair apart (fake bold) are kept once.
  const twice = groupLines([item('Bold', 72, 50), item('Bold', 72.3, 50)]);
  assert.equal(lineText(twice[0]), 'Bold');
  // Turned text keeps its angle and stays out of the horizontal lines.
  const turned = groupLines([item('Side note', 40, 300, { angle: -90 }), item('Body', 72, 300)]);
  assert.equal(turned.find((l) => l.angle).spans[0].text, 'Side note');
  assert.equal(turned.filter((l) => !l.angle).length, 1);
});

test('the operator walk follows the transform, text position and colour', () => {
  const OPS = Object.fromEntries(['save', 'restore', 'transform', 'beginGroup', 'endGroup', 'paintFormXObjectBegin', 'paintFormXObjectEnd', 'setFillRGBColor', 'setStrokeRGBColor', 'setFillColorN', 'setStrokeColorN', 'setGState', 'beginText', 'setFont', 'setCharSpacing', 'setWordSpacing', 'setHScale', 'setLeading', 'setTextRise', 'setTextRenderingMode', 'setTextMatrix', 'moveText', 'setLeadingMoveText', 'nextLine', 'showText', 'paintImageXObject', 'paintInlineImageXObject', 'paintImageXObjectRepeat'].map((name, n) => [name, n + 1]));
  const glyphs = (word) => [...word].map((c) => ({ width: 500, isSpace: c === ' ', unicode: c }));
  const list = [
    ['setFillRGBColor', [255, 0, 0]], ['beginText'], ['setFont', ['f1', 10]], ['moveText', [72, 700]], ['showText', [glyphs('Red')]], ['showText', [[...glyphs('ab'), -1000, ...glyphs('c')]]],
    ['save'], ['setFillRGBColor', new Uint8ClampedArray([0, 0, 255])], ['setTextRenderingMode', [3]], ['setTextMatrix', [1, 0, 0, 1, 72, 600]], ['showText', [glyphs('hid')]], ['restore'],
    ['setLeading', [12]], ['nextLine'], ['showText', [glyphs('x')]],
    ['save'], ['transform', [200, 0, 0, 100, 50, 400]], ['paintImageXObject', ['img1', 20, 10]], ['restore'],
  ];
  const base = [1, 0, 0, -1, 0, 792];  // a page 792 high, flipped to a top-left origin
  const { shows, images } = walkOps({ fnArray: list.map(([name]) => OPS[name]), argsArray: list.map(([, args]) => args) }, OPS, base);
  assert.deepEqual(shows.map((s) => [s.k, s.x0, s.y0, s.x1, s.color, s.mode]), [[0, 72, 92, 87, 'FF0000', 0], [1, 87, 92, 112, 'FF0000', 0], [2, 72, 192, 87, '0000FF', 3], [3, 72, 104, 77, 'FF0000', 0]]);
  assert.deepEqual(imageBox(images[0].ctm), { x: 50, y: 292, width: 200, height: 100 });
  assert.deepEqual(mul([2, 0, 0, 2, 10, 10], [1, 0, 0, 1, 5, 5]), [2, 0, 0, 2, 20, 20]);

  const items = [item('Redab c', 72, 92, { width: 40 }), item('hid', 72, 192, { width: 15 }), item('lost', 300, 300)];
  matchShows(items, shows);
  assert.deepEqual(items[0].ops, [0, 1]);
  assert.equal(items[0].color, 'FF0000');
  assert.equal(items[1].hidden, true);
  assert.deepEqual(items[2].ops, [], 'text no operator draws is not claimed');
});

test('headings, paragraphs and inline styles', () => {
  const bold = { font: 'X+Body-Bold', b: true };
  const mixed = groupLines([item('A paragraph with ', 72, 190), item('bold words', 157, 190, bold), item(' in the middle that goes on and on to fill the whole line up to the', 207, 190)])[0];
  const doc = blocksFromPdfPages([page([
    line('The Big Title', 72, 80, { size: 24 }),
    line('First section', 72, 120, { size: 16 }),
    para(150, 3),
    mixed, line(FILL.slice(0, 80) + ' with a hyphen-', 72, 202), line('ated word at the end.', 72, 214),
    line('A bold line on its own', 72, 250, bold),
    para(274, 2),
    line('Second section', 72, 330, { size: 16 }),
    para(360, 2),
  ])]);
  assert.equal(doc.title, 'The Big Title');
  assert.deepEqual(doc.blocks.map((b) => b.t + (b.level || '')), ['h1', 'h2', 'p', 'p', 'h3', 'p', 'h2', 'p']);
  assert.equal(text(doc.blocks[2].runs), FILL + ' ' + FILL + ' ' + FILL.slice(0, 40) + '.');
  const runs = doc.blocks[3].runs;
  assert.deepEqual(runs.map((r) => !!r.b), [false, true, false]);
  assert.equal(runs[1].text, 'bold words');
  assert.match(text(runs), /with a hyphenated word at the end\.$/);
  assert.ok(!doc.blocks.some((b) => b.t === 'break'), 'pages do not leave page breaks behind');

  // When the whole document is set in a bold font, nothing is marked bold.
  const heavy = blocksFromPdfPages([page([para(100, 3).map((l) => line(lineText(l), l.x, l.y, bold))])]);
  assert.equal(heavy.blocks.length, 1);
  assert.equal(heavy.blocks[0].t, 'p');
  assert.ok(heavy.blocks[0].runs.every((r) => !r.b));

  // A sentence cut by the page end carries on in the same paragraph.
  const cut = blocksFromPdfPages([page([para(100, 3).slice(0, 2)]), page([line('carries on here on the next page.', 72, 100)])]);
  assert.equal(cut.blocks.length, 1);
  assert.match(text(cut.blocks[0].runs), /word carries on here/);
});

test('bullets, numbers and nested items become list blocks', () => {
  const doc = blocksFromPdfPages([page([
    para(80, 2),
    row(120, [['•', 72], ['First bullet that is long enough to wrap onto', 90]]), line('a second line', 90, 132),
    row(144, [['•', 72], ['Second bullet', 90]]),
    row(156, [['◦', 90], ['Nested bullet', 108]]),
    line('- dash item', 72, 168),
    line('1. Step one', 72, 200), line('2. Step two', 72, 212), line('3) not the same style but still a number', 72, 224),
    line('(a) lettered', 72, 236),
    para(270, 2),
  ])]);
  const items = doc.blocks.filter((b) => b.t === 'li');
  assert.deepEqual(items.map((b) => [b.ordered, b.depth, b.n, text(b.runs)]), [
    [false, 0, 1, 'First bullet that is long enough to wrap onto a second line'], [false, 0, 1, 'Second bullet'], [false, 1, 1, 'Nested bullet'], [false, 0, 1, 'dash item'],
    [true, 0, 1, 'Step one'], [true, 0, 2, 'Step two'], [true, 0, 3, 'not the same style but still a number'], [true, 0, 1, 'lettered'],
  ]);
  assert.equal(doc.blocks[0].t, 'p');
  assert.equal(doc.blocks[doc.blocks.length - 1].t, 'p');
  // "A. Smith" at the start of a line is a name, not a list.
  const name = blocksFromPdfPages([page([line('A. Smith wrote this sentence and nothing else here.', 72, 100)])]);
  assert.equal(name.blocks[0].t, 'p');
});

test('two columns are read one after the other', () => {
  const left = Array.from({ length: 12 }, (_, n) => line('left column line number ' + (n + 1) + ' goes here', 72, 150 + n * 12));
  const right = Array.from({ length: 12 }, (_, n) => line('right column line number ' + (n + 1) + ' is here', 320, 150 + n * 12));
  const doc = blocksFromPdfPages([page([line('A title across both columns of the page', 150, 100, { size: 18 }), left, right])]);
  const all = doc.blocks.map((b) => text(b.runs)).join(' ');
  assert.equal(doc.blocks[0].t, 'h');
  assert.ok(all.indexOf('left column line number 12') < all.indexOf('right column line number 1 '), 'the left column comes first');
  assert.ok(!/left column line number 1 goes here right/.test(all), 'lines are not read straight across');
  assert.ok(!doc.blocks.some((b) => b.t === 'table'), 'columns of prose are not a table');
});

test('aligned rows become a table, prose does not', () => {
  const cols = [72, 200, 300, 400];
  const doc = blocksFromPdfPages([page([
    para(80, 2),
    row(130, [['Region', 72], ['Q1', 200], ['Q2', 300], ['Change', 400]], { font: 'X+Body-Bold', b: true }),
    ...[['North', '120', '150', '+25%'], ['South', '90', '91', '+1%'], ['West and islands', '40', '38', '-5%']].map((cells, n) => row(146 + n * 16, cells.map((c, k) => [c, cols[k]]))),
    para(230, 2),
  ])]);
  assert.deepEqual(doc.blocks.map((b) => b.t), ['p', 'table', 'p']);
  const table = doc.blocks[1];
  assert.deepEqual(table.rows.map((r) => r.map(text)), [['Region', 'Q1', 'Q2', 'Change'], ['North', '120', '150', '+25%'], ['South', '90', '91', '+1%'], ['West and islands', '40', '38', '-5%']]);
  assert.equal(table.rows[0][0][0].b, true);
  // Two lines that happen to share a gap are left as text.
  const two = blocksFromPdfPages([page([row(100, [['Name', 72], ['Value', 300]]), row(112, [['Alpha', 72], ['One', 300]]), para(150, 3)])]);
  assert.ok(!two.blocks.some((b) => b.t === 'table'));
});

test('running headers, footers and page numbers are dropped', () => {
  const pages = [1, 2, 3].map((n) => page([
    line('Quarterly Report', 72, 40, { size: 8 }), line('Confidential', 480, 40, { size: 8 }),
    para(100, 3, 72, ('page' + n + ' ').repeat(15).trim() + ' filler text here'),
    line('Page ' + n + ' of 3', 280, 760, { size: 8 }),
  ]));
  const doc = blocksFromPdfPages(pages);
  const all = doc.blocks.map((b) => text(b.runs || [])).join(' ');
  assert.ok(!/Quarterly Report|Confidential|of 3/.test(all), all);
  assert.match(all, /page1 .*page2 .*page3 /);
  // A lone number at the foot of a single page goes too.
  const one = blocksFromPdfPages([page([para(100, 3), line('7', 300, 770)])]);
  assert.ok(!one.blocks.some((b) => text(b.runs) === '7'));
});

test('centred lines, code and pictures', () => {
  const mono = { font: 'X+Courier', mono: true };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const doc = blocksFromPdfPages([page([
    line('A Centred Heading', 221, 80, { size: 20 }),
    line('a centred byline', 266, 110),
    para(140, 3),
    line('def area(w, h):', 72, 200, mono), line('return w * h', 96, 212, mono),
    para(300, 2),
  ], { images: [{ x: 100, y: 230, width: 144, height: 36, png }] })]);
  assert.deepEqual(doc.blocks.map((b) => b.t), ['h', 'p', 'p', 'code', 'img', 'p']);
  assert.equal(doc.blocks[0].align, 'center');
  assert.equal(doc.blocks[1].align, 'center');
  assert.equal(doc.blocks[2].align, undefined);
  assert.equal(doc.blocks[3].text, 'def area(w, h):\n    return w * h');
  assert.deepEqual([doc.blocks[4].mime, doc.blocks[4].width, doc.blocks[4].height, doc.blocks[4].bytes], ['image/png', 192, 48, png]);
});
