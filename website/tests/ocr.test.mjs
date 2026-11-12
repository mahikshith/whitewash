// Layout rebuilding for OCR: lines with boxes in, block list out. The line data
// here is synthetic (10 px per character, 20 px tall lines, 30 px line pitch,
// text between x = 100 and x = 900); real scans are checked in a browser run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksFromOcr, textFromOcr, pageFromTesseract, imageDpi, paperWidth } from '../dist/conv-ocr.js';

const CHAR = 10, PITCH = 30;
// One line. `at` is [x, y]; words get boxes from their character positions.
function line(text, [x, y], { height = 20, size = 10, confidence = 95, char = CHAR } = {}) {
  const words = [];
  for (const m of text.matchAll(/\S+/g)) words.push({ text: m[0], x0: x + m.index * char, x1: x + (m.index + m[0].length) * char, y0: y, y1: y + height, confidence });
  return { text: text.replace(/\s+/g, ' ').trim(), x0: words[0].x0, x1: words[words.length - 1].x1, y0: y, y1: y + height, words, confidence, size };
}
// Lines stacked from `y` at the normal pitch.
const stack = (texts, x, y, options) => texts.map((text, i) => line(text, [x, y + i * PITCH], options));
const page = (lines) => ({ width: 1000, height: 1400, lines });
const kinds = (doc) => doc.blocks.map((b) => (b.t === 'h' ? 'h' + b.level : b.t));
const texts = (doc) => doc.blocks.map((b) => (b.runs || []).map((r) => r.text).join(''));
const FULL = 'The committee met on the third of March to review the proposal for a new garden.';   // 80 characters: a full line

test('lines of one paragraph are joined, paragraphs split on a larger gap', () => {
  const doc = blocksFromOcr([page([
    ...stack([FULL, FULL, 'It ends on a short line.'], 100, 100),
    ...stack([FULL, 'Second paragraph ends here.'], 100, 100 + 3 * PITCH + 20),
  ])]);
  assert.deepEqual(kinds(doc), ['p', 'p']);
  assert.equal(texts(doc)[0], FULL + ' ' + FULL + ' It ends on a short line.');
  assert.equal(texts(doc)[1], FULL + ' Second paragraph ends here.');
});

test('a hyphen at the end of a line is removed when the word carries on', () => {
  const doc = blocksFromOcr([page(stack([
    'Members agreed that the site receives enough sunlight and that regular compost-',
    'ing would help. The plan was first drawn up for the north side by the well-',
    'Known gardener Ms Lee and it has not changed much in the years since then, so',
    'nothing more was said.',
  ], 100, 100))]);
  assert.equal(doc.blocks.length, 1);
  assert.match(texts(doc)[0], /regular composting would help/);
  assert.match(texts(doc)[0], /by the well- Known gardener/, 'a hyphen before a capital is kept');
});

test('paragraphs with no gap between them split on a short last line or an indent', () => {
  const short = blocksFromOcr([page(stack([FULL, 'This one stops early.', FULL, 'So does this one.'], 100, 100))]);
  assert.deepEqual(texts(short), [FULL + ' This one stops early.', FULL + ' So does this one.']);
  const body = FULL.slice(0, 76);
  const indented = blocksFromOcr([page([
    line(body, [140, 100]), line(FULL, [100, 130]), line(FULL, [100, 160]),
    line(body, [140, 190]), line(FULL, [100, 220]),
  ])]);
  assert.deepEqual(texts(indented), [body + ' ' + FULL + ' ' + FULL, body + ' ' + FULL]);
});

test('heading levels follow the sizes present; short standalone lines are headings too', () => {
  const doc = blocksFromOcr([page([
    line('Garden Plan', [335, 60], { height: 60, size: 30, char: 30 }),
    line('Background', [100, 180], { height: 30, size: 15, char: 15 }),
    ...stack([FULL, FULL, 'It ends on a short line.'], 100, 225),
    line('Site preparation', [100, 350]),
    ...stack([FULL, 'More text follows the small heading.'], 100, 380),
    line('Budget', [100, 490], { height: 30, size: 15, char: 15 }),
    ...stack([FULL, 'The last paragraph.'], 100, 535),
  ])]);
  assert.deepEqual(kinds(doc), ['h1', 'h2', 'p', 'h3', 'p', 'h2', 'p']);
  assert.equal(doc.title, 'Garden Plan');
  assert.equal(doc.blocks[0].align, 'center');
  assert.equal(doc.blocks[1].align, undefined);
});

test('a short first line of an ordinary paragraph is not a heading', () => {
  // In a narrow column the line stops because the next word doesn't fit, not because it is a heading.
  const doc = blocksFromOcr([page([
    ...stack(['Complaints about pressure', 'fell by a third this year.'], 100, 100),
    ...stack(['Staff training continued', 'throughout the period with', 'forty employees completing', 'the course.'], 100, 200),
  ])]);
  assert.deepEqual(kinds(doc), ['p', 'p']);
});

test('bullets that OCR misread become list items', () => {
  const doc = blocksFromOcr([page([
    ...stack([FULL, 'Things to do first.'], 100, 100),
    ...stack(['e  Clear the weeds', 'o  Build twelve raised beds', '*  Install a barrel', '»  Plant a hedge', '«Paint the shed'], 120, 190),
    ...stack(['a small paragraph follows the list and runs to the end of the line here, yes', 'and then it stops.'], 100, 360),
  ])]);
  assert.deepEqual(kinds(doc), ['p', 'li', 'li', 'li', 'li', 'li', 'p']);
  assert.deepEqual(texts(doc).slice(1, 6), ['Clear the weeds', 'Build twelve raised beds', 'Install a barrel', 'Plant a hedge', 'Paint the shed']);
  assert.ok(doc.blocks.slice(1, 6).every((b) => b.ordered === false && b.depth === 0));
});

test('a real bullet works alone; a lone doubtful one and a lone number stay text', () => {
  assert.deepEqual(kinds(blocksFromOcr([page([line('•  Only item', [100, 100])])])), ['li']);
  assert.deepEqual(texts(blocksFromOcr([page([...stack([FULL, 'e  mail us for details.'], 100, 100)])])), [FULL + ' e mail us for details.']);
  const numbered = blocksFromOcr([page([...stack([FULL, 'The meeting closed at noon.'], 100, 100), line('3. The results were good and nothing else was said.', [100, 200])])]);
  assert.deepEqual(kinds(numbered), ['p', 'p']);
});

test('numbered items keep their numbers, wrapped lines and nesting', () => {
  const doc = blocksFromOcr([page([
    line('1. Read the meter on the first working day of each month and record the', [100, 100]),
    line('figure in the log book.', [130, 130]),
    line('2. Compare the reading with last month.', [100, 160]),
    line('-  Report a change over fifteen percent', [140, 190]),
    line('-  Keep the old sheet', [140, 220]),
    line('3. File the signed sheet.', [100, 250]),
  ])]);
  assert.deepEqual(doc.blocks.map((b) => [b.t, b.ordered, b.n, b.depth]), [['li', true, 1, 0], ['li', true, 2, 0], ['li', false, 1, 1], ['li', false, 1, 1], ['li', true, 3, 0]]);
  assert.equal(texts(doc)[0], 'Read the meter on the first working day of each month and record the figure in the log book.');
});

const LEFT = ['Local history groups have spent the', 'past decade collecting photographs', 'and maps that show how the town', 'changed after the railway arrived.', 'The archive holds four thousand', 'items given by local families.'];
const RIGHT = ['The reading room is open from ten', 'until four on weekdays. Visitors', 'may consult the catalogue freely', 'but documents are handled only', 'with gloves and under the eye of', 'a member of staff.'];

test('two columns are read one after the other, under a title that spans both', () => {
  const title = line('The Town Archive Newsletter', [230, 40], { height: 40, size: 20, char: 20 });
  const expected = ['The Town Archive Newsletter', LEFT.join(' '), RIGHT.join(' ')];
  const separate = blocksFromOcr([page([title, ...stack(LEFT, 100, 140), ...stack(RIGHT, 540, 140)])]);
  assert.deepEqual(texts(separate), expected);
  // The same page as an engine without layout analysis gives it: each line runs across both columns.
  const pad = (text) => text.padEnd(44);
  const across = blocksFromOcr([page([title, ...LEFT.map((text, i) => line(pad(text) + RIGHT[i], [100, 140 + i * PITCH]))])]);
  assert.deepEqual(texts(across), expected);
});

test('a longer left column carries on below the right one', () => {
  const more = ['How to help', 'Anyone with material to share can', 'bring it in on Saturday.'];
  const doc = blocksFromOcr([page([...stack(LEFT, 100, 100), ...stack(RIGHT.slice(0, 3), 540, 100), ...stack(more, 100, 100 + 6 * PITCH + 50)])]);
  assert.deepEqual(texts(doc), [LEFT.join(' '), more[0], more.slice(1).join(' '), RIGHT.slice(0, 3).join(' ')]);
});

const ROWS = [['Item', 'Quantity', 'Cost'], ['Timber boards', '48', '$620'], ['Topsoil bags', '30', '$285'], ['Tool shed', '1', '$450']];
const tableLines = (y) => ROWS.map((row, i) => line(row[0].padEnd(30) + row[1].padEnd(30) + row[2], [100, y + i * PITCH]));

test('rows with stable columns become a table; text around it stays text', () => {
  const doc = blocksFromOcr([page([...stack([FULL, 'Costs so far.'], 100, 100), ...tableLines(190), ...stack([FULL, 'After the table.'], 100, 340)])]);
  assert.deepEqual(kinds(doc), ['p', 'table', 'p']);
  assert.deepEqual(doc.blocks[1].rows.map((row) => row.map((cell) => cell.map((r) => r.text).join(''))), ROWS);
});

test('table finding is conservative', () => {
  // Two rows are not enough, and wide gaps that don't line up are not columns.
  assert.ok(!kinds(blocksFromOcr([page(tableLines(100).slice(0, 2))])).includes('table'));
  const ragged = blocksFromOcr([page([line('Name      Mary Jones', [100, 100]), line('Date of birth          4 May', [100, 130]), line('Town    Leeds', [100, 160])])]);
  assert.ok(!kinds(ragged).includes('table'));
  // A table that fills the page is not mistaken for columns of prose.
  assert.deepEqual(kinds(blocksFromOcr([page([...tableLines(100), ...tableLines(220), ...tableLines(340)])])), ['table']);
});

test('centred and right-aligned lines keep their alignment', () => {
  const doc = blocksFromOcr([page([
    line('12 May 2023', [790, 60]),
    line('NOTICE OF MEETING', [415, 120]),
    ...stack([FULL, FULL, 'Ends here.'], 100, 200),
    ...stack(['Margaret Holloway', 'Northgate Supplies', '14 Canal Street'], 100, 330),
  ])]);
  assert.equal(doc.blocks[0].align, 'right');
  assert.equal(doc.blocks[1].align, 'center');
  assert.equal(doc.blocks[2].align, undefined);
  assert.equal(texts(doc)[3], 'Margaret Holloway\nNorthgate Supplies\n14 Canal Street', 'short lines keep their line breaks');
});

test('low-confidence garbage is dropped, real text is kept', () => {
  const doc = blocksFromOcr([page([
    line('EE RE EE BE RR ee pe re', [100, 60], { confidence: 20 }),
    line('~~ |] .. -- [[ ~', [100, 90], { confidence: 10 }),
    line('. _ |', [100, 120], { confidence: 80 }),
    ...stack([FULL, 'A faint but real sentence.'], 100, 200, { confidence: 24 }),
    line('[Topsoil bags|', [100, 300]),
  ])]);
  assert.deepEqual(texts(doc), [FULL + ' A faint but real sentence.', 'Topsoil bags']);
  assert.deepEqual(blocksFromOcr([page([])]), { title: '', blocks: [] });
  assert.deepEqual(blocksFromOcr([]), { title: '', blocks: [] });
});

test('lines without word boxes still work, and pages follow each other', () => {
  const bare = (text, x, y) => ({ text, x0: x, x1: x + text.length * CHAR, y0: y, y1: y + 20 });
  const first = page([bare(FULL, 100, 100), bare('and it carries on over the page without a full stop at the end of the line', 100, 130)]);
  const second = page([bare('because the sentence ends here.', 100, 100), bare(FULL, 100, 160), bare('The end.', 100, 190)]);
  const doc = blocksFromOcr([first, second]);
  assert.equal(doc.blocks.length, 2);
  assert.match(texts(doc)[0], /end of the line because the sentence ends here\.$/);
});

test('textFromOcr: paragraphs flow, blank line between blocks, lists and tables kept', () => {
  const text = textFromOcr([page([
    line('Garden Plan', [335, 60], { height: 60, size: 30, char: 30 }),
    ...stack([FULL, 'It ends on a short line.'], 100, 180),
    ...stack(['•  Clear the weeds', '•  Plant a hedge'], 120, 270),
    ...stack(['1. Apply for the grant', '2. Order materials'], 120, 360),
    ...tableLines(450),
  ])]);
  assert.equal(text, [
    'Garden Plan', '', FULL + ' It ends on a short line.', '', '• Clear the weeds', '• Plant a hedge', '', '1. Apply for the grant', '2. Order materials', '',
    ...ROWS.map((row) => row.join('\t')),
  ].join('\n'));
});

test('pageFromTesseract straightens a tilted page and reads the x-height', () => {
  const slope = 0.02;   // about 1.1 degrees
  const tess = (text, x, y, rowHeight = 20) => {
    const words = [];
    for (const m of text.matchAll(/\S+/g)) { const wx = x + m.index * CHAR; words.push({ text: m[0], confidence: 90, bbox: { x0: wx, x1: wx + m[0].length * CHAR, y0: y + slope * wx, y1: y + rowHeight + slope * wx } }); }
    const x1 = x + text.length * CHAR;
    return { text: text + '\n', confidence: 90, bbox: { x0: x, y0: y + slope * x, x1, y1: y + rowHeight + slope * x1 }, baseline: { x0: x, y0: y + 16 + slope * x, x1, y1: y + 16 + slope * x1 }, rowAttributes: { rowHeight, ascenders: rowHeight / 4, descenders: rowHeight / 4 }, words };
  };
  const blocks = [{ paragraphs: [{ lines: [tess(FULL, 100, 100), tess(FULL, 100, 130), tess('Short.', 100, 160)] }] }, { paragraphs: [{ lines: [tess('Big', 100, 300, 40)] }] }];
  const { lines } = pageFromTesseract(blocks);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].text, FULL);
  assert.ok(lines[0].y1 - lines[0].y0 < 22, 'a straightened line is as tall as its words');
  assert.ok(Math.abs(lines[0].x0 - lines[2].x0) < 2, 'left edges line up again');
  assert.equal(lines[0].size, 10);
  assert.equal(lines[3].size, 20);
  assert.equal(pageFromTesseract(blocks, 2).lines[0].size, 5, 'an upscaled read is reported in original pixels');
  assert.deepEqual(pageFromTesseract(null).lines, []);
});

test('page size for a searchable PDF made from an image', () => {
  assert.equal(Math.round(paperWidth(1275, 1650, 150)), 612, 'a stated scan resolution is used');
  assert.equal(Math.round(paperWidth(1275, 1650, 72)), 612, '72 dpi is a default, not a scan setting: fit to Letter');
  assert.equal(Math.round(paperWidth(1240, 1754)), 595, 'A4-shaped image fits A4');
  assert.equal(Math.round(paperWidth(1754, 1240)), 842, 'landscape keeps its long side');
  assert.equal(Math.round(paperWidth(4000, 3000, 300)), 960, 'a plausible stated size is kept');
  assert.equal(Math.round(paperWidth(9000, 12000, 300)), 594, 'a poster-sized claim is not');
  assert.equal(paperWidth(0, 0), 0);
  const png = new Uint8Array(8 + 25 + 21);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  png.set([0, 0, 0, 9, 0x70, 0x48, 0x59, 0x73, 0, 0, 0x2e, 0x23, 0, 0, 0x2e, 0x23, 1], 33);   // pHYs: 11811 px per metre
  assert.equal(Math.round(imageDpi(png)), 300);
  const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 200, 0, 200, 0, 0, 0xff, 0xda]);
  assert.equal(imageDpi(jfif), 200);
  const exif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 48, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 2,
    0x01, 0x1a, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0x26, 0x01, 0x28, 0, 3, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0x58, 0, 0, 0, 1, 0xff, 0xda]);
  assert.equal(imageDpi(exif), 600);
  assert.equal(imageDpi(new Uint8Array([1, 2, 3])), 0);
  assert.equal(imageDpi(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 200, 0x45, 0x78, 0x69, 0x66])), 0, 'a cut-off header is not an error');
});
