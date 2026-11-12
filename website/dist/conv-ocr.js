// OCR with Tesseract (English, LSTM engine), fully on this device. Images and
// scanned PDF pages become text, a block list that keeps the layout of the scan
// (headings, paragraphs, lists, tables, columns), or a searchable PDF that keeps
// the page images and puts invisible, selectable text on top.
import * as libs from './libs.js';

const MAX_PAGES = 50;
const MAX_PIXELS = 16e6;     // largest upscaled page
const SMALL_LINE = 16;       // lines shorter than this (px) are read again at twice the size

async function makeWorker(onProgress) {
  const T = await libs.tesseract();
  const worker = await T.createWorker('eng', 1, {
    ...libs.tesseractPaths(),
    logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
    errorHandler: () => {},
  });
  // Automatic page segmentation: finds columns and table cells. The library's
  // default treats the page as one block, which interleaves columns.
  await worker.setParameters({ tessedit_pageseg_mode: '3' });
  return worker;
}

// sources: [Blob|HTMLCanvasElement]. Returns { pages: [{ text, confidence, pdf,
// width, height, lines, pageWidth }] }. `lines` feed blocksFromOcr; `pageWidth`
// is the page width in points for joinPdfs.
export async function recognize(sources, { pdf = false, onPage } = {}) {
  if (sources.length > MAX_PAGES) throw new Error('Up to ' + MAX_PAGES + ' pages at a time.');
  let worker;
  try { worker = await makeWorker((p) => onPage?.(current, sources.length, p)); }
  catch { throw new Error('The text reader couldn’t start. Reload the page and try again.'); }
  let current = 0;
  const pages = [];
  try {
    for (const source of sources) {
      current++;
      onPage?.(current, sources.length, 0);
      const want = { text: true, blocks: true, pdf };
      let { data } = await worker.recognize(source, {}, want), scale = 1;
      const lineHeight = median(tessLines(data.blocks).map((l) => l.bbox.y1 - l.bbox.y0));
      const bitmap = await openBitmap(source);
      if (bitmap && lineHeight && lineHeight < SMALL_LINE) {
        // Whole factors only: in tests ×2 kept ruled tables readable where ×1.8 or ×2.4 lost them.
        scale = Math.min(lineHeight < 8 ? 3 : 2, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
        if (scale > 1.15) ({ data } = await worker.recognize(enlarge(bitmap, scale), {}, want)); else scale = 1;
      }
      const page = pageFromTesseract(data.blocks, scale);
      if (bitmap) { page.width = bitmap.width; page.height = bitmap.height; }
      bitmap?.close?.();
      const pageWidth = source.pageWidth || paperWidth(page.width, page.height, source instanceof Blob ? imageDpi(new Uint8Array(await source.slice(0, 65536).arrayBuffer())) : 0);
      pages.push({ text: data.text || '', confidence: data.confidence || 0, pdf: data.pdf ? new Uint8Array(data.pdf) : null, ...page, pageWidth });
    }
  } finally { await worker.terminate().catch(() => {}); }
  return { pages };
}

// A photo's EXIF rotation is applied, the way Tesseract applies it itself.
async function openBitmap(source) {
  if (!(source instanceof Blob)) return source?.width ? source : null;
  try { return await createImageBitmap(source, { imageOrientation: 'from-image' }); } catch { return null; }
}

function enlarge(bitmap, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// ---------- Page size ----------

// Dots per inch from a PNG (pHYs) or JPEG (JFIF density or EXIF resolution) header, or 0.
export function imageDpi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), size = bytes.length;
  const tag = (at, text) => at + text.length <= size && [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));
  try {
    if (tag(1, 'PNG')) {
      for (let at = 8; at + 12 <= size; at += 12 + view.getUint32(at)) {
        if (tag(at + 4, 'pHYs')) return view.getUint8(at + 16) === 1 ? view.getUint32(at + 8) * 0.0254 : 0;
        if (tag(at + 4, 'IDAT')) break;
      }
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      for (let at = 2; at + 4 <= size && bytes[at] === 0xff && bytes[at + 1] !== 0xda; at += 2 + view.getUint16(at + 2)) {
        if (bytes[at + 1] === 0xe0 && tag(at + 4, 'JFIF')) {
          const unit = bytes[at + 11], density = view.getUint16(at + 12);
          if (unit === 1) return density;
          if (unit === 2) return density * 2.54;
        }
        if (bytes[at + 1] === 0xe1 && tag(at + 4, 'Exif')) {
          const tiff = at + 10, little = bytes[tiff] === 0x49, ifd = tiff + view.getUint32(tiff + 4, little);
          let dpi = 0, unit = 2;
          for (let i = 0, count = view.getUint16(ifd, little); i < count; i++) {
            const entry = ifd + 2 + i * 12, id = view.getUint16(entry, little);
            if (id === 0x011a) { const value = tiff + view.getUint32(entry + 8, little); dpi = view.getUint32(value, little) / (view.getUint32(value + 4, little) || 1); }
            if (id === 0x0128) unit = view.getUint16(entry + 8, little);
          }
          if (dpi) return unit === 3 ? dpi * 2.54 : dpi;
        }
      }
    }
  } catch { /* a cut-off header has no usable DPI */ }
  return 0;
}

// Page width in points for an image of width × height pixels. A stated DPI is
// used when it gives a paper-sized page (72 and 96 are camera and screen
// defaults, not scan settings). Otherwise the long side becomes the long side of
// A4 or Letter, whichever shape is closer.
export function paperWidth(width, height, dpi = 0) {
  if (!width || !height) return 0;
  const long = Math.max(width, height), short = Math.min(width, height);
  if (dpi >= 100 && long / dpi <= 17.5 && long / dpi >= 2) return width / dpi * 72;
  const ratio = long / short;
  return width * (Math.abs(ratio - 11 / 8.5) < Math.abs(ratio - Math.SQRT2) ? 792 : 842) / long;
}

// Joins one-page PDFs from Tesseract into one searchable PDF. Tesseract sizes
// a page from a DPI guess, so each page is scaled to the width (in points) it
// should have: the PDF page it came from, or paperWidth() for an image.
export async function joinPdfs(parts, widths = []) {
  const { PDFDocument } = await libs.pdfLib();
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const [i, bytes] of parts.entries()) {
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    for (const page of await out.copyPages(src, src.getPageIndices())) {
      const factor = widths[i] ? widths[i] / page.getWidth() : 1;
      if (Math.abs(factor - 1) > 0.01) page.scale(factor, factor);
      out.addPage(page);
    }
  }
  return out.save();
}

// Pages of a PDF as canvases at OCR resolution (about 200 dpi).
export async function pdfPagesForOcr(bytes, onPage) {
  const { renderPages, pageCount } = await import('./conv-pdf.js');
  const count = await pageCount(bytes);
  if (count > MAX_PAGES) throw new Error('This PDF has ' + count + ' pages. Up to ' + MAX_PAGES + ' at a time.');
  const scale = 2.8;
  const { images } = await renderPages(bytes, { scale, type: 'image/png', onPage });
  return images.map((image) => Object.assign(image.blob, { pageWidth: image.width / scale }));
}

// ---------- Tesseract output → plain lines ----------

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[sorted.length >> 1] : 0; };
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
const tessLines = (blocks) => (blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));

// Tesseract's `blocks` JSON as one page of lines for blocksFromOcr. A slightly
// rotated scan is straightened (coordinates only) from the line baselines, and
// each line gets `size`: Tesseract's x-height for the row, which tells headings
// from body text far better than the box height does.
export function pageFromTesseract(blocks, scale = 1) {
  const raw = tessLines(blocks);
  const slopes = raw.filter((l) => l.baseline && l.bbox.x1 - l.bbox.x0 > 8 * (l.bbox.y1 - l.bbox.y0)).map((l) => (l.baseline.y1 - l.baseline.y0) / (l.baseline.x1 - l.baseline.x0));
  const slope = Math.abs(median(slopes)) > 0.002 ? median(slopes) : 0;
  const lines = [];
  let width = 0, height = 0;
  for (const line of raw) {
    const words = (line.words || []).filter((w) => w.text.trim()).map((w) => {
      const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2;
      return { text: w.text.trim(), x0: (w.bbox.x0 + slope * cy) / scale, x1: (w.bbox.x1 + slope * cy) / scale, y0: (w.bbox.y0 - slope * cx) / scale, y1: (w.bbox.y1 - slope * cx) / scale, confidence: w.confidence };
    });
    if (!words.length) continue;
    const row = line.rowAttributes, xHeight = row ? (row.rowHeight - row.ascenders - row.descenders) / scale : 0;
    width = Math.max(width, line.bbox.x1 / scale); height = Math.max(height, line.bbox.y1 / scale);
    lines.push({
      text: words.map((w) => w.text).join(' '), words, confidence: line.confidence,
      x0: Math.min(...words.map((w) => w.x0)), x1: Math.max(...words.map((w) => w.x1)), y0: median(words.map((w) => w.y0)), y1: median(words.map((w) => w.y1)),
      size: xHeight > 0 ? xHeight : undefined,
    });
  }
  return { width, height, lines };
}

// ---------- Lines → blocks ----------

const STRONG = '•●▪■◦‣∙·○';              // a bullet, even on a single line
const WEAK = '*-–—»«°®©+>¢~=¤.,e0oOc';     // how OCR often reads a bullet: only trusted on 2+ lines in a row
const hasLetter = (text) => /[\p{L}\p{N}]/u.test(text);
const glue = (a, b) => !a ? b : /\p{L}[-‐¬]$/u.test(a) && /^\p{Ll}/u.test(b) ? a.slice(0, -1) + b : a + ' ' + b;

function isGarbage(text, confidence) {
  const solid = text.replace(/\s/g, ''), letters = (solid.match(/[\p{L}\p{N}]/gu) || []).length;
  if (!letters) return true;
  const share = letters / solid.length, wordLength = solid.length / text.split(/\s+/).length;
  return (confidence < 25 && (share < 0.6 || wordLength <= 3)) || (confidence < 50 && share < 0.4);
}

// One input line as a row: words with boxes (spread along the line when the
// caller gave none), stray table rules removed.
function toRow(line) {
  let words = line.words?.length ? line.words.map((w) => ({ ...w, text: String(w.text).trim() })) : null;
  if (!words) {
    const parts = String(line.text).trim().split(/\s+/).filter(Boolean), total = parts.join(' ').length || 1, unit = (line.x1 - line.x0) / total;
    let at = 0;
    words = parts.map((text) => { const w = { text, x0: line.x0 + at * unit, x1: line.x0 + (at + text.length) * unit, y0: line.y0, y1: line.y1 }; at += text.length + 1; return w; });
  }
  const tidy = (text) => (text.includes(']') ? text : text.replace(/^[|[]+(?=[\p{L}\p{N}$])/u, '')).replace(/([\p{L}\p{N}.,%])[|\]]+$/u, text.includes('[') ? '$&' : '$1');
  words = words.map((w) => ({ ...w, text: tidy(w.text) }))
    .filter((w) => w.text && !/^[|[\]_]+$/.test(w.text)).sort((a, b) => a.x0 - b.x0);
  return makeRow(words, line.confidence ?? 100, line.size);
}

function makeRow(words, confidence, size) {
  const y0 = Math.min(...words.map((w) => w.y0)), y1 = Math.max(...words.map((w) => w.y1));
  return { words, confidence, size, x0: words[0]?.x0, x1: Math.max(...words.map((w) => w.x1)), y0, y1, cy: (y0 + y1) / 2, text: words.map((w) => w.text).join(' ') };
}

// Reading order. Returns flows: runs of rows read top to bottom, each with the
// left and right edge of the column it sits in. The page is cut into sections
// at tall empty bands, and each section is checked for a column gutter on its
// own, so columns above a full-width table or list don't drag those in.
function flowsOf(rows, em, bounds) {
  const flows = [];
  const add = (part, edges) => { const last = flows[flows.length - 1]; if (last && last.bounds === edges) last.rows.push(...part); else flows.push({ rows: [...part], bounds: edges }); };
  const sections = [];
  let bottom = -Infinity;
  for (const row of [...rows].sort((a, b) => a.y0 - b.y0)) {
    if (row.y0 - bottom > 1.8 * em) sections.push([]);
    sections[sections.length - 1].push(row); bottom = Math.max(bottom, row.y1);
  }
  let tail = null;   // where a longer left column may carry on below the right one
  for (const section of sections) {
    if (tail && section.every((row) => row.x1 < tail.x) && tail.right < tail.left - 1.5 * em) {
      flows[tail.flow].rows.push(...section); tail.left = Math.max(...section.map((r) => r.y1)); continue;
    }
    tail = null;
    const gutter = section.length >= 6 ? findGutter(section, em) : null;
    if (!gutter) { add(section, bounds); continue; }
    const pieces = [];
    for (const row of section) {
      const left = row.words.filter((w) => w.x1 < gutter.x), right = row.words.filter((w) => w.x0 > gutter.x);
      if (gutter.covers(row)) pieces.push({ row, side: 0 });
      else {
        if (left.length) pieces.push({ row: makeRow(left, row.confidence, row.size), side: -1 });
        if (right.length) pieces.push({ row: makeRow(right, row.confidence, row.size), side: 1 });
      }
    }
    pieces.sort((a, b) => a.row.cy - b.row.cy);
    // Rows that cross the gutter split the section into bands; each band reads left column, then right.
    let band = [];
    const flush = () => {
      tail = null;
      for (const side of [-1, 1]) {
        const part = band.filter((p) => p.side === side).map((p) => p.row), bottom = Math.max(...part.map((r) => r.y1));
        if (part.length) flows.push(...flowsOf(part, em, { x0: Math.min(...part.map((r) => r.x0)), x1: Math.max(...part.map((r) => r.x1)), column: true }));
        if (side < 0 && part.length) tail = { x: gutter.x, flow: flows.length - 1, left: bottom, right: -Infinity };
        else if (tail && part.length) tail.right = bottom;
      }
      band = [];
    };
    for (const piece of pieces) {
      if (piece.side) band.push(piece); else { if (band.length) flush(); tail = null; add([piece.row], bounds); }
    }
    if (band.length) flush();
  }
  return flows;
}

// A gutter is a vertical strip that a run of rows leaves empty, with text on
// both sides that looks like prose (left lines run up to the strip). Table
// columns fail the prose test and are left to the table finder.
function findGutter(rows, em) {
  const sorted = [...rows].sort((a, b) => a.cy - b.cy);
  const x0 = Math.min(...rows.map((r) => r.x0)), x1 = Math.max(...rows.map((r) => r.x1)), step = em / 2;
  if (x1 - x0 < 16 * em) return null;
  const covers = (row, x) => row.words.some((w, i) => x >= w.x0 - step / 2 && x <= Math.max(w.x1, i + 1 < row.words.length && row.words[i + 1].x0 - w.x1 < em ? row.words[i + 1].x0 : 0) + step / 2);
  const scores = [];
  for (let x = x0 + (x1 - x0) * 0.15; x <= x1 - (x1 - x0) * 0.15; x += step) {
    let best = 0, left = 0, right = 0;
    for (const row of sorted) {
      if (covers(row, x)) { left = right = 0; continue; }
      if (row.x0 < x) left++;
      if (row.x1 > x) right++;
      best = Math.max(best, Math.min(left, right));
    }
    scores.push({ x, best });
  }
  const top = Math.max(0, ...scores.map((s) => s.best));
  if (top < 3) return null;
  let run = null, widest = null;
  for (const s of scores) {
    if (s.best >= top * 0.7) { run = run ? { x0: run.x0, x1: s.x } : { x0: s.x, x1: s.x }; if (!widest || run.x1 - run.x0 > widest.x1 - widest.x0) widest = run; }
    else run = null;
  }
  if (!widest) return null;
  // The strip itself: between the text that ends left of it and the text that starts right of it.
  const middle = (widest.x0 + widest.x1) / 2, open = sorted.filter((r) => !covers(r, middle));
  const left = open.map((r) => r.words.filter((w) => w.x1 < middle)).filter((w) => w.length), right = open.map((r) => r.words.filter((w) => w.x0 > middle)).filter((w) => w.length);
  const from = Math.max(...left.map((w) => w[w.length - 1].x1)), to = Math.min(...right.map((w) => w[0].x0));
  if (left.length < 3 || right.length < 3 || to - from < em / 2) return null;
  const leftEdge = Math.min(...left.map((w) => w[0].x0)), full = left.filter((w) => w[w.length - 1].x1 > from - (from - leftEdge) * 0.25).length;
  if (full < left.length * 0.4 || mean(left.map((w) => w.length)) < 2.5 || mean(right.map((w) => w.length)) < 2.5) return null;
  return { x: (from + to) / 2, covers: (row) => covers(row, (from + to) / 2) };
}

// Rows top to bottom; pieces that sit on the same line (table cells, a bullet
// read apart from its text) become one row.
function mergeRows(rows) {
  const out = [];
  for (const row of [...rows].sort((a, b) => a.cy - b.cy)) {
    const last = out[out.length - 1];
    if (last && Math.min(last.y1, row.y1) - Math.max(last.y0, row.y0) > 0.5 * Math.min(last.y1 - last.y0, row.y1 - row.y0)) {
      out[out.length - 1] = makeRow([...last.words, ...row.words].sort((a, b) => a.x0 - b.x0), Math.min(last.confidence, row.confidence), last.size && row.size ? Math.max(last.size, row.size) : last.size || row.size);
    } else out.push(row);
  }
  return out.filter((r) => hasLetter(r.text));
}

function listMarker(row) {
  const first = row.words[0].text, more = row.words.length > 1;
  let m;
  if (more && (m = /^\(?(\d{1,3})[.)]$/.exec(first))) return { ordered: true, n: +m[1], drop: 1 };
  if (more && (m = /^\(?([a-z])\)$/.exec(first))) return { ordered: true, n: m[1].charCodeAt(0) - 96, drop: 1 };
  if ((m = /^(\d{1,3})[.)](?=\p{Lu})/u.exec(first))) return { ordered: true, n: +m[1], cut: m[0].length };
  if (more && first.length === 1 && (STRONG + WEAK).includes(first)) {
    const letter = /[e0oOc]/.test(first);
    if (letter && !(/^[\p{Lu}\d]/u.test(row.words[1].text) || (row.words[0].confidence ?? 100) < 70)) return null;
    return { ordered: false, strong: STRONG.includes(first), drop: 1 };
  }
  if (first.length > 1 && (STRONG + '*»«°®©¢¤').includes(first[0]) && /\p{L}/u.test(first[1])) return { ordered: false, strong: STRONG.includes(first[0]), cut: 1 };
  return null;
}

// Cells of a row: words split where the gap is far wider than a space.
function cellsOf(row, em) {
  const cells = [];
  for (const word of row.words) {
    const last = cells[cells.length - 1];
    if (last && word.x0 - last.x1 <= 1.5 * em) { last.x1 = Math.max(last.x1, word.x1); last.text += ' ' + word.text; }
    else cells.push({ x0: word.x0, x1: word.x1, text: word.text });
  }
  return cells;
}

// Column ranges shared by a run of rows, or null when the cells don't line up.
function tableColumns(rowCells) {
  const columns = [];
  for (const cell of rowCells.flat().sort((a, b) => a.x0 - b.x0)) {
    const last = columns[columns.length - 1];
    if (last && cell.x0 <= last.x1) last.x1 = Math.max(last.x1, cell.x1); else columns.push({ x0: cell.x0, x1: cell.x1 });
  }
  if (columns.length < 2) return null;
  for (const cells of rowCells) {
    const used = cells.map((cell) => columns.findIndex((c) => cell.x0 >= c.x0 && cell.x1 <= c.x1));
    if (new Set(used).size !== used.length) return null;
  }
  return columns;
}

function blocksOfFlow({ rows, bounds }, em, body) {
  const out = [], count = rows.length;
  const ratio = (row) => (row.size || (row.y1 - row.y0) * 0.5) / body;
  const pitches = rows.slice(1).map((row, i) => row.cy - rows[i].cy).filter((d) => d < 2.2 * em);
  const pitch = median(pitches) || 1.3 * em;
  const width = bounds.x1 - bounds.x0, middle = (bounds.x0 + bounds.x1) / 2;
  const alignOf = (row) => {
    const left = row.x0 - bounds.x0, right = bounds.x1 - row.x1;
    if (left > (bounds.page ? 0.2 : 0.05) * width && right > 0.4 * left && Math.abs((row.x0 + row.x1) / 2 - middle) <= Math.max(0.6 * em, 0.04 * width)) return 'center';
    return left > 0.5 * width && right < em ? 'right' : undefined;
  };

  // Tables: 3+ rows in a row whose cells fall into the same column ranges.
  const table = new Array(count).fill(null), cells = rows.map((row) => (listMarker(row)?.drop && cellsOf(row, em)[0].text === row.words[0].text ? [] : cellsOf(row, em)));
  for (let i = 0; i < count; i++) {
    if (cells[i].length < 2) continue;
    let limit = i + 1, end = 0, columns = null;
    while (limit < count && cells[limit].length >= 2 && rows[limit].cy - rows[limit - 1].cy <= 2.2 * pitch) limit++;
    for (let j = i + 3; j <= limit; j++) { const fit = tableColumns(cells.slice(i, j)); if (!fit) break; columns = fit; end = j; }
    if (columns) { for (let k = i; k < end; k++) table[k] = { start: i, end, columns }; i = end - 1; }
  }

  // Lists: a numbered item needs its neighbour (1. then 2.), a doubtful bullet needs another bullet next to it.
  const marker = rows.map((row, i) => (table[i] ? null : listMarker(row))), item = new Array(count).fill(false);
  for (let i = 0; i < count; i++) {
    if (!marker[i]) continue;
    if (!marker[i].ordered && marker[i].strong) item[i] = true;
    let j = i + 1;
    while (j < count && !table[j] && rows[j].x0 > rows[i].x0 + 0.5 * em && rows[j].cy - rows[j - 1].cy < 1.6 * pitch) j++;   // wrapped lines and nested items
    if (j >= count || !marker[j] || rows[j].cy - rows[j - 1].cy > 2.5 * pitch) continue;
    if (marker[i].ordered ? marker[j].ordered && marker[j].n === marker[i].n + 1 : !marker[j].ordered && Math.abs(rows[j].x0 - rows[i].x0) < 4 * em) item[i] = item[j] = true;
  }

  // The right edge a paragraph line would wrap at: the widest line in its run of evenly spaced lines.
  const flowRight = Math.max(...rows.map((r) => r.x1)), right = new Array(count).fill(flowRight), narrow = new Array(count).fill(false);
  for (let i = 0; i < count;) {
    let j = i + 1;
    while (j < count && !table[j] && !table[j - 1] && !item[j] && !item[j - 1] && rows[j].cy - rows[j - 1].cy < 1.4 * pitch && Math.abs(ratio(rows[j]) - ratio(rows[j - 1])) < 0.2) j++;
    const widest = Math.max(...rows.slice(i, j).map((r) => r.x1));
    for (let k = i; k < j; k++) { if (j - i >= 3) right[k] = widest; narrow[k] = j - i >= 2 && widest < bounds.x0 + 0.6 * width; }
    i = j;
  }

  const textOf = (row, mark) => (mark?.cut ? row.text.slice(mark.cut).trim() : mark?.drop ? row.words.slice(mark.drop).map((w) => w.text).join(' ') : row.text);
  const plainish = (row) => row.words.length <= 8 && row.text.length <= 60 && /^[\p{Lu}\d]/u.test(row.text) && !/[.,;:!?]$/.test(row.text);
  const headingOf = (i) => {
    const row = rows[i], r = ratio(row), prev = rows[i - 1], next = rows[i + 1];
    if (table[i] || item[i]) return 0;
    const tall = row.y1 - row.y0 >= 1.1 * em && !(/[.,;]$/.test(row.text) && r < 1.6);   // a stray size reading on a normal line is not a heading
    if (r >= 1.3 && row.words.length <= 20 && tall) return r;
    const short = row.x1 < bounds.x1 - 0.2 * width || alignOf(row) === 'center';
    if (r >= 1.12 && short && row.words.length <= 14 && /^[\p{Lu}\d]/u.test(row.text) && !/[.,;]$/.test(row.text)) return r;
    // Body-sized: a short line set apart from what is above and tight to the text below it.
    // It also has to stop early: a line that ends where the next word no longer fits is just wrapped text.
    if (!plainish(row) || !next || table[i + 1] || flowRight - row.x1 <= next.words[0].x1 - next.words[0].x0 + 1.2 * em) return 0;
    if (!prev && bounds.column) return 0;   // the top line of a column is usually mid-paragraph
    const above = prev ? row.y0 - prev.y1 : Infinity, below = next.y0 - row.y1;
    const texty = item[i + 1] || next.words.length >= 4;
    return below < 1.2 * em && above > Math.max(1.5 * below, 0.9 * em) && texty && !(plainish(next) && !item[i + 1] && next.x1 < bounds.x1 - 0.2 * width) ? 1 : 0;
  };

  let current = null, listBase = null;
  for (let i = 0; i < count; i++) {
    const row = rows[i], prev = rows[i - 1], gap = prev ? row.cy - prev.cy : Infinity;
    if (table[i]) {
      if (table[i].start === i) {
        const { columns, end } = table[i];
        out.push({ t: 'table', rows: rows.slice(i, end).map((_, k) => columns.map((c) => { const cell = cells[i + k].find((x) => x.x0 >= c.x0 && x.x1 <= c.x1); return cell ? [{ text: cell.text }] : []; })) });
      }
      current = null; continue;
    }
    if (item[i]) {
      if (out[out.length - 1]?.t !== 'li') listBase = row.x0;
      current = { t: 'li', ordered: marker[i].ordered, depth: Math.max(0, Math.min(4, Math.round((row.x0 - listBase) / (1.5 * em)))), n: marker[i].ordered ? marker[i].n : 1, runs: [{ text: textOf(row, marker[i]) }], x0: row.x0 };
      out.push(current); continue;
    }
    if (current?.t === 'li' && gap < 1.6 * pitch && row.x0 > current.x0 + 0.5 * em) {
      // An indented line after an item that had room left is the next item with its bullet lost, not a wrapped line.
      const lost = !current.ordered && /^[\p{Lu}\d]/u.test(row.text) && flowRight - prev.x1 > row.words[0].x1 - row.words[0].x0 + 1.2 * em;
      if (lost) { current = { ...current, runs: [{ text: row.text }] }; out.push(current); } else current.runs[0].text = glue(current.runs[0].text, row.text);
      continue;
    }
    const heading = headingOf(i);
    if (heading) {
      if (current?.t === 'h' && Math.abs(current.ratio - heading) < 0.12 && gap < 1.7 * (row.y1 - row.y0)) { current.runs[0].text += ' ' + row.text; continue; }
      current = { t: 'h', level: 0, ratio: heading, runs: [{ text: row.text }], align: alignOf(row) };
      out.push(current); continue;
    }
    const align = alignOf(row), firstWord = row.words[0].x1 - row.words[0].x0;
    const sameSize = prev && (Math.abs(ratio(row) - ratio(prev)) < 0.25 || Math.abs(row.y1 - row.y0 - (prev.y1 - prev.y0)) < 0.3 * em);
    const continues = current?.t === 'p' && gap < 1.4 * pitch && sameSize && current.align === align;
    if (continues && (narrow[i] || align)) { current.runs[0].text += '\n' + row.text; current.lines++; continue; }
    if (continues && row.x0 - current.left < 0.8 * em && !(current.lines > 1 && current.left - row.x0 > 0.8 * em) && right[i] - prev.x1 <= firstWord + 1.2 * em) {
      current.runs[0].text = glue(current.runs[0].text, row.text); current.left = row.x0; current.lines++; continue;
    }
    current = { t: 'p', runs: [{ text: row.text }], align, left: row.x0, lines: 1 };
    out.push(current);
  }
  return out;
}

// pages: [{ width, height, lines: [{ text, x0, y0, x1, y1, words?, confidence?, size? }] }]
// in pixels. `words` are { text, x0, y0, x1, y1, confidence? }; `size` is the
// x-height when known. Returns { title, blocks } (docs/conversion-model.md).
export function blocksFromOcr(pages) {
  const blocks = [];
  let pageEnd = false;
  for (const page of pages || []) {
    const rows = (page.lines || []).filter((l) => l && String(l.text || '').trim() && !isGarbage(String(l.text).trim(), l.confidence ?? 100)).map(toRow).filter((r) => r.words.length);
    if (!rows.length) continue;
    const em = median(rows.map((r) => r.y1 - r.y0)) || 1, body = median(rows.flatMap((r) => new Array(r.words.length).fill(r.size || (r.y1 - r.y0) * 0.5)));
    const bounds = rows.length >= 3 || !page.width ? { x0: Math.min(...rows.map((r) => r.x0)), x1: Math.max(...rows.map((r) => r.x1)) } : { x0: 0, x1: page.width, page: true };   // too few lines to see the margins: measure against the page
    for (const flow of flowsOf(rows, em, bounds)) {
      flow.rows = mergeRows(flow.rows);
      if (!flow.rows.length) continue;
      const next = blocksOfFlow(flow, em, body), last = blocks[blocks.length - 1], first = next[0];
      // A paragraph that runs on into the next column or page.
      if (last?.t === 'p' && first?.t === 'p' && !last.align && !first.align && (flow.bounds.column || pageEnd) && !/[.!?:;"”’)\]]$/.test(last.runs[0].text) && /^\p{Ll}/u.test(first.runs[0].text)) {
        last.runs[0].text = glue(last.runs[0].text, first.runs[0].text); next.shift();
      }
      pageEnd = false;
      blocks.push(...next);
    }
    pageEnd = true;
  }
  // Text that wraps round a picture comes out one line per paragraph. A line
  // that stops mid-sentence and is followed by a lower-case start is the same
  // paragraph, so join them.
  for (let i = blocks.length - 1; i > 0; i--) {
    const last = blocks[i - 1], next = blocks[i];
    if (last.t === 'p' && next.t === 'p' && !last.align && !next.align && /[\p{L}\p{N},\-]$/u.test(last.runs[0].text) && /^\p{Ll}/u.test(next.runs[0].text)) { last.runs[0].text = glue(last.runs[0].text, next.runs[0].text); blocks.splice(i, 1); }
  }
  // Heading levels from the distinct sizes present, largest first. Sizes within
  // 10% are one level (a pixel of x-height is that much on a normal scan).
  // Body-sized headings come after them, or share the last level when that one
  // is only slightly larger than body text.
  const sizes = [];
  for (const r of blocks.filter((b) => b.t === 'h' && b.ratio >= 1.12).map((b) => b.ratio).sort((a, b) => b - a)) if (!sizes.length || r < sizes[sizes.length - 1] / 1.1) sizes.push(r);
  const plainLevel = Math.min(6, Math.max(2, sizes.length + (sizes.length && sizes[sizes.length - 1] < 1.3 ? 0 : 1)));
  for (const block of blocks) {
    if (block.t === 'h') block.level = block.ratio >= 1.12 ? Math.min(5, sizes.findIndex((s) => block.ratio >= s / 1.1) + 1) : plainLevel;
    delete block.ratio; delete block.x0; delete block.left; delete block.lines;
    if (!block.align) delete block.align;
  }
  return { title: blocks.find((b) => b.t === 'h')?.runs[0].text || '', blocks };
}

// The same structure as plain text: flowing paragraphs with a blank line
// between, list items on their own lines, table cells split by tabs.
export function textFromOcr(pages) {
  const { blocks } = blocksFromOcr(pages), text = (runs) => runs.map((r) => r.text).join('');
  let out = '';
  blocks.forEach((b, i) => {
    const line = b.t === 'li' ? '  '.repeat(b.depth) + (b.ordered ? b.n + '. ' : '• ') + text(b.runs) : b.t === 'table' ? b.rows.map((row) => row.map(text).join('\t')).join('\n') : text(b.runs);
    const prev = blocks[i - 1], sameList = prev && b.t === 'li' && prev.t === 'li' && (b.ordered === prev.ordered || b.depth || prev.depth);
    out += (i ? (sameList ? '\n' : '\n\n') : '') + line;
  });
  return out;
}
