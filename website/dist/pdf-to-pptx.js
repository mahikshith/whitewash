// PDF → PowerPoint, one slide per page. Each slide is a picture of the page
// drawn without its text, with the text put back on top as real text boxes
// in the same place, size, weight and colour. A scan has no text to lift, so
// its slide is just the picture.
import * as libs from './libs.js';
import { loadForReading } from './conv-pdf.js';
import { extractPage, canvasBytes } from './pdf-extract.js';
import { writePptx, cleanFont } from './pptx-write.js';

const right = (o) => o.x + o.width;

// A font's ascent and descent as a share of its size (its Windows metrics).
// PowerPoint sets the first baseline of a single-spaced line about one ascent
// below the top of the box. LibreOffice ignores the font and uses the full
// font size (measured: 1.00 x size for every font). The drop used here sits
// between the two, a third of the way from the font's ascent to the full
// size, so neither app is off by more than a few percent of the text height.
const METRICS = {
  Arial: [0.905, 0.212], 'Times New Roman': [0.891, 0.216], 'Courier New': [0.833, 0.3], Calibri: [0.952, 0.269], 'Calibri Light': [0.952, 0.269], Cambria: [0.95, 0.222],
  Georgia: [0.917, 0.219], Verdana: [1.005, 0.21], Tahoma: [1, 0.207], 'Trebuchet MS': [0.939, 0.222], 'Segoe UI': [1.079, 0.251], Garamond: [0.862, 0.263],
  'DejaVu Sans': [0.928, 0.236], 'DejaVu Serif': [0.939, 0.236], 'DejaVu Sans Mono': [0.928, 0.236],
};
export const fontMetrics = (font) => METRICS[cleanFont(font)] || METRICS.Arial;
export const firstBaseline = (font) => (fontMetrics(font)[0] * 2 + 1) / 3;

// Text we can retype: visible, tied to the operators that draw it, and made of
// real characters. Anything else stays in the picture.
const garbled = (text) => { const odd = (text.match(/[\uE000-\uF8FF\uFFFD\u0000-\u0008\u000E-\u001F]/g) || []).length; return odd > 0 && odd >= text.replace(/\s/g, '').length * 0.3; };
const editable = (span) => !span.hidden && span.ops?.length > 0 && !span.ops.includes(-1) && !!span.text.trim() && !garbled(span.text);

// The spans that become text boxes, and the operators to leave out of the
// picture for them. An operator that also draws text we can't lift has to
// stay, and then so does everything else it draws.
export function lift(page) {
  const spans = new Set(page.lines.flatMap((l) => l.spans).filter(editable)), stay = new Set();
  for (const line of page.lines) for (const span of line.spans) if (!spans.has(span)) for (const k of span.ops || []) stay.add(k);
  for (let changed = true; changed;) {
    changed = false;
    for (const span of spans) if (span.ops.some((k) => stay.has(k))) { spans.delete(span); for (const k of span.ops) stay.add(k); changed = true; }
  }
  const drop = new Set();
  for (const span of spans) for (const k of span.ops) drop.add(k);
  return { spans, drop };
}

const spaceWidth = (font, mono) => mono ? 0.6 : ({ Arial: 0.278, Calibri: 0.226, 'Times New Roman': 0.25, 'Courier New': 0.6, Cambria: 0.22 }[cleanFont(font)] || 0.26);
const runOf = (span, size) => ({ text: span.text, spc: span.gap || span.spacing || undefined, size: span.sup || span.sub ? size : span.size, b: span.b || undefined, i: span.i || undefined, sup: span.sup, sub: span.sub, color: span.color, font: span.font });
const same = (a, b) => a.spc === b.spc && !/^ $/.test(a.text) && !/^ $/.test(b.text) && a.size === b.size && !a.b === !b.b && !a.i === !b.i && !a.sup === !b.sup && !a.sub === !b.sub && a.color === b.color && cleanFont(a.font) === cleanFont(b.font);

// A page's lines → groups of lines that belong in one text box. A line is cut
// where the gap is too wide for a space (table cells, columns), and lines stack
// into one box when they share a left edge, a size and a steady leading.
export function textBoxes(page) {
  const segments = [], { spans: lifted } = lift(page);
  for (const line of page.lines) {
    let seg = null, prev = null;
    for (const span of line.spans) {
      if (!lifted.has(span)) { seg = null; prev = null; continue; }
      const gap = prev ? span.x - right(prev) : 0;
      if (!seg || gap >= line.size * 2 || line.angle) { seg = { x: span.x, y: line.y, right: right(span), size: 0, spans: [span], angle: line.angle || 0 }; segments.push(seg); }
      else {
        // A gap inside a box becomes one space, stretched or squeezed to the
        // gap's real width so the words after it stay where they were.
        const last = seg.spans[seg.spans.length - 1], wide = spaceWidth(prev.font, prev.mono) * prev.size;
        if (/\s$/.test(last.text)) seg.spans[seg.spans.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') };
        if (gap > span.size * 0.1 || /\s$/.test(last.text)) seg.spans.push({ ...prev, text: ' ', sup: false, sub: false, spacing: 0, gap: Math.abs(gap - wide) > span.size * 0.08 ? gap - wide : 0 });
        seg.spans.push(span);
      }
      seg.right = Math.max(seg.right, right(span));
      if (!span.sup && !span.sub) seg.size = Math.max(seg.size, span.size);
      prev = span;
    }
  }
  for (const seg of segments) { seg.size ||= Math.max(...seg.spans.map((s) => s.size)); seg.font = seg.spans.reduce((a, b) => (b.text.length > a.text.length ? b : a)).font; }
  const boxes = [];
  for (const seg of segments.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const pitch = (box) => seg.y - box.lines[box.lines.length - 1].y;
    const home = seg.angle ? null : boxes.find((box) => !box.angle && Math.abs(box.x - seg.x) < 1 && Math.abs(box.size - seg.size) < 0.2 && cleanFont(box.font) === cleanFont(seg.font)
      && pitch(box) > seg.size * 0.9 && pitch(box) < seg.size * 1.7 && (!box.leading || Math.abs(pitch(box) - box.leading) < 0.4));
    if (home) { home.leading ||= pitch(home); home.lines.push(seg); home.right = Math.max(home.right, seg.right); }
    else boxes.push({ x: seg.x, right: seg.right, size: seg.size, font: seg.font, angle: seg.angle, leading: 0, lines: [seg] });
  }
  return boxes;
}

// The slide model for writePptx. pictures[n] is { bytes, mime, full } for page
// n, or nothing. `full` means the picture still shows the text, so no boxes.
export function slidesFromPages(pages, pictures = []) {
  const first = pages[0] || { width: 960, height: 540 };
  // Slides can't be smaller than 1 inch or larger than 56.
  const fit = Math.min(1, 4032 / Math.max(first.width, first.height)) * Math.max(1, 72 / Math.min(first.width, first.height) || 1);
  const width = first.width * fit, height = first.height * fit;
  const slides = pages.map((page, n) => {
    const k = Math.min(width / page.width, height / page.height), dx = (width - page.width * k) / 2, dy = (height - page.height * k) / 2;
    const items = [], picture = pictures[n];
    if (picture?.bytes?.length) items.push({ type: 'image', x: dx, y: dy, w: page.width * k, h: page.height * k, bytes: picture.bytes, mime: picture.mime });
    if (picture?.full) return { items };
    for (const box of textBoxes(page)) {
      const [ascent, descent] = fontMetrics(box.font), size = box.size, many = box.lines.length > 1;
      const runs = [];
      box.lines.forEach((line, at) => line.spans.forEach((span, n) => {
        const run = runOf(span, line.size), last = runs[runs.length - 1];
        run.size = Math.round(run.size * k * 100) / 100;
        if (at && n === 0) last.text += '\n';
        if (last && same(last, run)) last.text += run.text; else runs.push(run);
      }));
      // One line keeps single spacing. A stack of lines gets the PDF's exact
      // leading, and its first baseline is then that leading less a fifth of
      // the font size below the top (measured in LibreOffice for every font).
      const drop = many ? box.leading - size * 0.2 : firstBaseline(box.font) * size;
      const w = (box.right - box.x) * k, h = (many ? box.leading * box.lines.length : size * (ascent + descent)) * k;
      const item = { type: 'text', x: dx + box.x * k, y: dy + (box.lines[0].y - drop) * k, w, h, wrap: false, autofit: true, paragraphs: [{ runs, ...(many ? { spacing: Math.round(box.leading * k * 100) / 100 } : {}) }] };
      if (box.angle) {
        // Turned text: the box spins round its middle, so place the middle
        // where it keeps the start of the baseline on its spot.
        const rad = box.angle * Math.PI / 180, lx = -w / 2, ly = -h / 2 + drop * k;
        const cx = dx + box.x * k - (lx * Math.cos(rad) - ly * Math.sin(rad)), cy = dy + box.lines[0].y * k - (lx * Math.sin(rad) + ly * Math.cos(rad));
        Object.assign(item, { x: cx - w / 2, y: cy - h / 2, rot: (box.angle % 360 + 360) % 360 });
      }
      items.push(item);
    }
    return { items };
  });
  return { width, height, slides };
}

// ---------- Drawing the page without its text (browser only) ----------

// pdf.js sends a page's drawing operators to the main thread in chunks. While
// the page renders, each chunk passes through here and the "show text"
// operators we are replacing are swapped for one that does nothing. Text made
// of real fonts, of outlines and of Type 3 glyphs all goes through that one
// operator, so nothing of it is left to ghost under the text boxes.
async function render(page, pdfjs, canvas, viewport, drop, intent) {
  const { OPS } = pdfjs, original = page._renderPageChunk;
  let seen = 0;
  if (drop) {
    if (typeof original !== 'function') return -1;
    page._renderPageChunk = function (chunk, state) {
      const { fnArray } = chunk;
      for (let n = 0; n < fnArray.length; n++) if (fnArray[n] === OPS.showText && drop.has(seen++)) { fnArray[n] = OPS.markPoint; chunk.argsArray[n] = null; }
      return original.call(this, chunk, state);
    };
  }
  try {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, background: '#ffffff', intent }).promise;
  } finally { if (drop) delete page._renderPageChunk; }
  return seen;
}

async function pagePicture(page, pdfjs, layout) {
  const { drop } = lift(layout);
  // Twice the page size, but never more than about 16 million pixels.
  const scale = Math.min(2, Math.sqrt(16_000_000 / Math.max(1, layout.width * layout.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  let full = !drop.size;
  const seen = await render(page, pdfjs, canvas, viewport, full ? null : drop, 'display');
  // If the operators didn't line up with what was read, don't guess: draw the
  // whole page as it is and leave the text in the picture.
  if (!full && seen !== layout.shows) { full = true; await render(page, pdfjs, canvas, viewport, null, 'print'); }
  let bytes = await canvasBytes(canvas, 'image/jpeg', 0.9), mime = 'image/jpeg';
  // Flat pages (lines, fills, a few shapes) are smaller and cleaner as PNG.
  if (bytes.length < 200_000) { const png = await canvasBytes(canvas, 'image/png'); if (png.length < bytes.length) { bytes = png; mime = 'image/png'; } }
  canvas.width = canvas.height = 0;
  return { bytes, mime, full };
}

export async function pdfToPptx(bytes, { onPage } = {}) {
  const pdfjs = await libs.pdfjs();
  const doc = await loadForReading(bytes);
  const pages = [], pictures = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onPage?.(n, doc.numPages);
      const page = await doc.getPage(n);
      const layout = await extractPage(page, pdfjs, { images: false });
      pages.push(layout);
      pictures.push(await pagePicture(page, pdfjs, layout));
      page.cleanup();
    }
  } finally { await doc.destroy(); }
  return writePptx(slidesFromPages(pages, pictures));
}
