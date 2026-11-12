// Reads a PDF's layout with pdf.js: text lines with their real fonts and
// colours, and the pictures on each page. blocksFromPdfPages turns that into
// the block list every document writer takes (docs/conversion-model.md).
// Everything is in PDF points with a top-left origin, page rotation applied.
import * as libs from './libs.js';
import { loadForReading } from './conv-pdf.js';

// mul(m, n): n happens first, then m. Same as a canvas ctx.transform(n).
export const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const at = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const round = (n) => Math.round(n * 100) / 100;
const right = (o) => o.x + o.width;
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const hex = (r, g, b) => [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

// Bold, italic and monospace from the real font name ("ABCDEF+Calibri-BoldItalic"),
// backed by the flags pdf.js sets on the font.
export function fontStyle(name = '', info = {}) {
  const plain = String(name).replace(/^[A-Z]{6}\+/, '');
  return {
    b: !!(info.bold || info.black) || /bold|black|heavy|semibold|demibold|[-_ ]demi\b|^cmbx?\d|^cmssbx/i.test(plain),
    i: !!info.italic || /italic|oblique|[-_ ]it\b|[-_ ]ital\b|^cm(ti|sl|bxti)\d/i.test(plain),
    mono: info.fallbackName === 'monospace' || info.fontFamily === 'monospace' || /mono|courier|consola|menlo|typewriter|^cmtt\d|sourcecode|fixedsys/i.test(plain),
  };
}

// The unit square an image is painted into, as a box on the page.
export function imageBox(ctm) {
  const xs = [], ys = [];
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const [x, y] = at(ctm, u, v); xs.push(x); ys.push(y); }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// Follows the graphics and text state through an operator list. Returns where
// every "show text" starts and ends on the page (with its colour and render
// mode) and where every picture is painted. `base` is the viewport transform.
export function walkOps({ fnArray, argsArray }, OPS, base, fontOf = () => null) {
  const shows = [], images = [];
  const I = [1, 0, 0, 1, 0, 0];
  let s = { ctm: base, fill: '000000', stroke: '000000', font: null, size: 0, dir: 1, cs: 0, ws: 0, hs: 1, rise: 0, mode: 0, lead: 0, tm: I, x: 0, y: 0, lx: 0, ly: 0 };
  const stack = [];
  const colour = (a) => typeof a[0] === 'string' ? (/^#[0-9a-f]{6}$/i.test(a[0]) ? a[0].slice(1).toUpperCase() : undefined) : a.length >= 3 && a.every((v) => typeof v === 'number') ? hex(a[0], a[1], a[2]) : undefined;
  const setFont = (id, size) => { s.font = fontOf(id); s.dir = size < 0 ? -1 : 1; s.size = Math.abs(size); };
  const move = (x, y) => { s.x = s.lx += x; s.y = s.ly += y; };
  let k = 0;
  for (let n = 0; n < fnArray.length; n++) {
    const fn = fnArray[n], a = argsArray[n] || [];
    switch (fn) {
      case OPS.save: case OPS.beginGroup: stack.push({ ...s }); break;
      case OPS.restore: case OPS.endGroup: case OPS.paintFormXObjectEnd: if (stack.length) s = stack.pop(); break;
      case OPS.transform: s.ctm = mul(s.ctm, a); break;
      case OPS.paintFormXObjectBegin: stack.push({ ...s }); if (Array.isArray(a[0]) && a[0].length === 6) s.ctm = mul(s.ctm, a[0]); break;
      case OPS.setFillRGBColor: s.fill = colour(a); break;
      case OPS.setStrokeRGBColor: s.stroke = colour(a); break;
      case OPS.setFillColorN: s.fill = undefined; break;
      case OPS.setStrokeColorN: s.stroke = undefined; break;
      case OPS.setGState: for (const [key, value] of a[0] || []) if (key === 'Font' && value) setFont(value[0], value[1]); break;
      case OPS.beginText: s.tm = I; s.x = s.y = s.lx = s.ly = 0; break;
      case OPS.setFont: setFont(a[0], a[1]); break;
      case OPS.setCharSpacing: s.cs = a[0]; break;
      case OPS.setWordSpacing: s.ws = a[0]; break;
      case OPS.setHScale: s.hs = a[0] / 100; break;
      case OPS.setLeading: s.lead = -a[0]; break;
      case OPS.setTextRise: s.rise = a[0]; break;
      case OPS.setTextRenderingMode: s.mode = a[0]; break;
      case OPS.setTextMatrix: s.tm = a.slice(0, 6); s.x = s.y = s.lx = s.ly = 0; break;
      case OPS.moveText: move(a[0], a[1]); break;
      case OPS.setLeadingMoveText: s.lead = a[1]; move(a[0], a[1]); break;
      case OPS.nextLine: move(0, s.lead); break;
      case OPS.showText: {
        const m = mul(s.ctm, s.tm), unit = s.size * (s.font?.fontMatrix?.[0] || 0.001), vertical = !!s.font?.vertical;
        let advance = 0;
        for (const glyph of a[0] || []) {
          if (typeof glyph === 'number') advance += (vertical ? 1 : -1) * glyph * s.size / 1000;
          else if (glyph && !vertical) advance += (glyph.width || 0) * unit + ((glyph.isSpace ? s.ws : 0) + s.cs) * s.dir;
        }
        const [x0, y0] = at(m, s.x, s.y + s.rise), [x1, y1] = vertical ? [x0, y0] : at(m, s.x + advance * s.hs, s.y + s.rise);
        shows.push({ k: k++, x0, y0, x1, y1, mode: s.mode, color: (s.mode & 3) === 1 ? s.stroke : s.fill, spacing: s.cs * s.hs * Math.hypot(m[0], m[1]) });
        if (!vertical) s.x += advance * s.hs;
        break;
      }
      case OPS.paintImageXObject: images.push({ id: a[0], ctm: s.ctm }); break;
      case OPS.paintInlineImageXObject: images.push({ data: a[0], ctm: s.ctm }); break;
      case OPS.paintImageXObjectRepeat: for (let p = 0; p + 1 < (a[3]?.length || 0); p += 2) images.push({ id: a[0], ctm: mul(s.ctm, [a[1], 0, 0, a[2], a[3][p], a[3][p + 1]]) }); break;
      default:
    }
  }
  return { shows, images };
}

// Ties each "show text" to the text items it draws, so an item knows its
// colour and whether it is invisible, and the slide maker knows which
// operators draw the text it is about to replace with a text box. One show can
// feed several items (a table row set in one go) and one item several shows.
export function matchShows(items, shows) {
  for (const item of items) { item.ops = []; item._d = Infinity; }
  for (const show of shows) {
    for (const item of items) {
      if (!item.str.trim()) continue;
      const tol = Math.max(1, item.size * 0.3), rad = (item.angle || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      const project = (x, y) => [(x - item.x) * cos + (y - item.y) * sin, Math.abs((y - item.y) * cos - (x - item.x) * sin)];
      const [a0, off0] = project(show.x0, show.y0), [a1, off1] = project(show.x1, show.y1);
      if (off0 > tol || off1 > tol) continue;
      const from = Math.min(a0, a1), to = Math.max(a0, a1), shared = Math.min(to, item.width) - Math.max(from, 0);
      // Either the two overlap along the baseline, or the show starts inside the item.
      if (!(shared > Math.min(item.size * 0.1, item.width * 0.5) || (to - from < 0.01 && a0 >= -tol && a0 <= item.width + tol))) continue;
      // Text that also clips (modes 4 to 7) has to stay drawn: -1 marks the item as not liftable.
      item.ops.push(show.mode >= 4 ? -1 : show.k);
      if (Math.abs(a0) < item._d) { item._d = Math.abs(a0); item.color = show.color; item.hidden = show.mode === 3 || show.mode === 7; item.spacing = Math.abs(show.spacing) > item.size * 0.02 ? round(show.spacing) : 0; }
    }
  }
  for (const item of items) {
    delete item._d;
    if (item.color === undefined) delete item.color;
    if (!item.hidden) delete item.hidden;
    // pdf.js reads widely tracked letters as "T I T L E": take its spaces back out.
    if (item.spacing > item.size * 0.1 && /^(\S )+\S$/.test(item.str)) item.str = item.str.replace(/(\S) /g, '$1');
    if (!item.spacing) delete item.spacing;
  }
  return items;
}

// Private-use characters are glyphs with no real letter behind them (a
// symbol-font bullet, a font with no Unicode table). They get a span to themselves.
const nameless = (text) => /^[\uE000-\uF8FF\uFFFD\s]+$/.test(text);
const styleKey = (o) => [o.font, Math.round(o.size * 4), o.b, o.i, o.mono, o.color, !!o.hidden, !!o.ops?.length, nameless(o.str), o.spacing || 0].join('|');

// Items → lines (same baseline) → spans (same style, no big gap). A span ends
// with a space when the next one starts a new word. Turned text gets a line of
// its own with an `angle`.
export function groupLines(items) {
  const lines = [], turned = [];
  for (const item of items) {
    if (!item.str) continue;
    if (Math.abs(item.angle || 0) > 3) { if (item.str.trim()) turned.push(item); continue; }
    let home = null, near = Infinity;
    for (const line of lines) {
      const d = Math.abs(line.y - item.y);
      if (d < Math.max(line.size, item.size) * 0.4 && d < near) { home = line; near = d; }
    }
    if (home) { home.items.push(item); if (item.size > home.size && item.str.trim()) { home.size = item.size; home.y = item.y; } }
    else lines.push({ y: item.y, size: item.size, items: [item] });
  }
  const out = [];
  for (const { items: row } of lines) {
    row.sort((a, b) => a.x - b.x);
    const spans = [];
    let prev = null, space = false;
    for (const item of row) {
      if (!item.str.trim()) { space = true; continue; }
      // Fake bold draws the same words twice a hair apart: keep one copy.
      if (prev && prev.str === item.str && Math.abs(prev.x - item.x) < item.size * 0.08 && Math.abs(prev.y - item.y) < item.size * 0.08) { spans[spans.length - 1].ops.push(...item.ops || []); continue; }
      const gap = prev ? item.x - right(prev) : 0, last = spans[spans.length - 1];
      const word = prev && (space || gap > item.size * 0.15 || /\s$/.test(prev.str) || /^\s/.test(item.str));
      if (last && gap < item.size * 0.6 && Math.abs(prev.y - item.y) < 0.5 && styleKey(prev) === styleKey(item)) {
        last.text += (word && !/\s$/.test(last.text) ? ' ' : '') + item.str.replace(/^\s+/, '');
        last.width = Math.max(last.width, right(item) - last.x);
        last.ops.push(...item.ops || []);
      } else {
        if (last && word && gap < item.size * 0.6 && !/\s$/.test(last.text)) last.text += ' ';
        const span = { text: item.str.replace(/^\s+/, ''), x: item.x, y: item.y, width: item.width, size: item.size, font: item.font || '', b: !!item.b, i: !!item.i, mono: !!item.mono, ops: [...item.ops || []] };
        if (item.color) span.color = item.color;
        if (item.hidden) span.hidden = true;
        if (item.spacing) span.spacing = item.spacing;
        spans.push(span);
      }
      prev = item; space = false;
    }
    if (!spans.length) continue;
    spans[spans.length - 1].text = spans[spans.length - 1].text.replace(/\s+$/, '');
    out.push(lineOf(spans));
  }
  for (const item of turned) {
    const span = { text: item.str.trim(), x: item.x, y: item.y, width: item.width, size: item.size, font: item.font || '', b: !!item.b, i: !!item.i, mono: !!item.mono, ops: [...item.ops || []] };
    if (item.color) span.color = item.color;
    if (item.hidden) span.hidden = true;
    out.push({ x: item.x, y: item.y, width: item.width, size: item.size, angle: item.angle, spans: [span] });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// A line's own size and baseline are those of most of its letters, so a
// footnote mark or a drop cap doesn't move it.
function lineOf(spans) {
  const weight = new Map();
  for (const s of spans) weight.set(s.size, (weight.get(s.size) || 0) + s.text.length);
  const size = [...weight].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const y = spans.find((s) => s.size === size).y, x = Math.min(...spans.map((s) => s.x));
  for (const s of spans) {
    delete s.sup; delete s.sub;
    if (s.size < size * 0.85 && s.y < y - size * 0.15) s.sup = true;
    else if (s.size < size * 0.85 && s.y > y + size * 0.08) s.sub = true;
  }
  return { x, y, width: Math.max(...spans.map(right)) - x, size, spans };
}

export function lineText(line) {
  let text = '';
  line.spans.forEach((s, n) => {
    const prev = line.spans[n - 1];
    if (prev && !/\s$/.test(text) && s.x - right(prev) > s.size * 0.15) text += ' ';
    text += s.text;
  });
  return text.trim();
}

// ---------- pdf.js ----------

const canvasOf = (w, h) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
const blobOf = (canvas, type, quality) => canvas.convertToBlob ? canvas.convertToBlob({ type, quality }) : new Promise((resolve) => canvas.toBlob(resolve, type, quality));
export async function canvasBytes(canvas, type = 'image/png', quality) {
  const blob = await blobOf(canvas, type, quality);
  if (!blob) throw new Error('This page is too large to draw. Try fewer pages at a time.');
  return new Uint8Array(await blob.arrayBuffer());
}

// pdf.js hands images over as a bitmap or as raw rows of grey, RGB or RGBA.
function drawable(image) {
  if (!image) return null;
  if (image.bitmap) return image.bitmap;
  if (!image.data || !image.width || !image.height) return typeof image.width === 'number' && !image.data ? image : null;
  const { data, width, height, kind } = image, rgba = new Uint8ClampedArray(width * height * 4);
  if (kind === 3) rgba.set(data.subarray(0, rgba.length));
  else if (kind === 2) for (let p = 0, q = 0; q < rgba.length; p += 3, q += 4) { rgba[q] = data[p]; rgba[q + 1] = data[p + 1]; rgba[q + 2] = data[p + 2]; rgba[q + 3] = 255; }
  else if (kind === 1) {
    const stride = (width + 7) >> 3;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const v = data[y * stride + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0, q = (y * width + x) * 4; rgba[q] = rgba[q + 1] = rgba[q + 2] = v; rgba[q + 3] = 255; }
  } else return null;
  const canvas = canvasOf(width, height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

// One flat colour is a shadow, a fill or a mask, not a picture worth keeping.
function flat(canvas) {
  const small = canvasOf(16, 16), ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 16, 16);
  const { data } = ctx.getImageData(0, 0, 16, 16), low = [255, 255, 255], high = [0, 0, 0];
  for (let p = 0; p < data.length; p += 4) { if (data[p + 3] < 16) continue; for (let c = 0; c < 3; c++) { low[c] = Math.min(low[c], data[p + c]); high[c] = Math.max(high[c], data[p + c]); } }
  return high.every((v, c) => v - low[c] <= 10);
}

const waitFor = (store, id) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 1500);
  try { store.get(id, (value) => { clearTimeout(timer); resolve(value); }); } catch { clearTimeout(timer); resolve(null); }
});

async function pictures(page, placed, size, hasText) {
  if (!canvasOf(1, 1)) return [];
  const out = [];
  const boxes = placed.map((p) => ({ ...p, box: imageBox(p.ctm) }))
    .filter(({ box }) => box.width >= 8 && box.height >= 8 && box.x < size.width && box.y < size.height && right(box) > 0 && box.y + box.height > 0)
    .filter(({ box }) => !(hasText && box.width * box.height > size.width * size.height * 0.95))
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height).slice(0, 40);
  for (const { id, data, ctm, box } of boxes) {
    try {
      const image = data || await waitFor(String(id).startsWith('g_') ? page.commonObjs : page.objs, id);
      const source = drawable(image);
      if (!source) continue;
      const iw = image.width || source.width, ih = image.height || source.height;
      // Keep the picture's own pixels where we can, up to 4 MP.
      let scale = Math.min(iw / Math.hypot(ctm[0], ctm[1]), ih / Math.hypot(ctm[2], ctm[3]), 8) || 1;
      scale = Math.min(scale, Math.sqrt(4_000_000 / (box.width * box.height)));
      const canvas = canvasOf(Math.max(1, Math.round(box.width * scale)), Math.max(1, Math.round(box.height * scale)));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(...mul(mul([scale, 0, 0, scale, -box.x * scale, -box.y * scale], ctm), [1 / iw, 0, 0, -1 / ih, 0, 1]));
      ctx.drawImage(source, 0, 0);
      if (flat(canvas)) continue;
      out.push({ x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height), png: await canvasBytes(canvas) });
      canvas.width = canvas.height = 0;
    } catch { /* a picture we can't decode is left out, the text still comes through */ }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// One page. `page` is a pdf.js page, `pdfjs` the library (for its OPS table).
export async function extractPage(page, pdfjs, { images = true } = {}) {
  const view = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  let walked = { shows: [], images: [] };
  const fontOf = (id) => { try { return page.commonObjs.has(id) ? page.commonObjs.get(id) : null; } catch { return null; } };
  try { walked = walkOps(await page.getOperatorList(), pdfjs.OPS, view.transform, fontOf); } catch { /* text without colours or pictures is still worth having */ }
  const items = [];
  for (const it of content.items) {
    if (typeof it.str !== 'string' || !it.str) continue;
    const t = mul(view.transform, it.transform), font = fontOf(it.fontName), family = content.styles?.[it.fontName]?.fontFamily;
    const size = Math.hypot(t[2], t[3]) || it.height || 0;
    if (!size) continue;
    const name = font?.name || '';
    items.push({ str: it.str, x: round(t[4]), y: round(t[5]), width: round(it.width), size: round(size), angle: Math.round(Math.atan2(t[1], t[0]) * 1800 / Math.PI) / 10, font: name || family || '', ...fontStyle(name, { ...font, fontFamily: family }) });
  }
  matchShows(items, walked.shows);
  const lines = groupLines(items);
  const size = { width: round(view.width), height: round(view.height) };
  // `shows` counts the page's show-text operators; span.ops index into them.
  return { ...size, lines, images: images ? await pictures(page, walked.images, size, lines.length > 0) : [], shows: walked.shows.length };
}

export async function extractPages(bytes, { onPage, images = true } = {}) {
  const pdfjs = await libs.pdfjs();
  const doc = await loadForReading(bytes);
  const pages = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onPage?.(n, doc.numPages);
      const page = await doc.getPage(n);
      pages.push(await extractPage(page, pdfjs, { images }));
      page.cleanup();
    }
  } finally { await doc.destroy(); }
  return pages;
}

// ---------- Layout → blocks ----------

const BULLET = /^([\u2022\u25E6\u25AA\u25AB\u2023\u2043\u2219\u25CF\u25CB\u25A0\u25A1\u25B6\u25BA\u27A2\u27A4\u2713\u2714\u2756\u00B7\uF0B7\uF0A7\uF0D8\uF0FC\uF076\uF0A8\u2013\u2014*-])\s+(?=\S)/;
const NUMBER = /^(\(?)(\d{1,3}|[a-zA-Z]|[ivx]{2,5})([.)])\s+(?=\S)/;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const PAGE_NUMBER = /^(page\s+)?[-\u2013\u2014\s]*\d{1,4}[-\u2013\u2014\s]*(\s*(of|\/)\s*\d{1,4})?$/i;
const ENDS = /[.!?:;\u2026"\u201D\u2019)\]]$/;
const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
const plain = (runs) => runs.map((r) => r.text).join('');

// Splits a line into pieces wherever the gap is too wide to be a word space.
function pieces(line, min = Math.max(line.size, 7)) {
  const out = [];
  for (const span of line.spans) {
    const last = out[out.length - 1];
    if (last && span.x - right(last) < min) { last.spans.push(span); last.width = Math.max(last.width, right(span) - last.x); }
    else out.push({ x: span.x, width: span.width, spans: [span] });
  }
  return out;
}

// What most of the text looks like: size, leading, and whether the everyday
// font is itself bold, italic or monospace.
function bodyStats(pages) {
  const sizes = new Map(), fonts = new Map(), colours = new Map(), pitches = new Map();
  const bump = (map, key, by) => map.set(key, (map.get(key) || 0) + by);
  let left = Infinity, edge = 0;
  for (const page of pages) {
    let prev = null;
    for (const line of page.lines) {
      if (line.angle) continue;
      for (const s of line.spans) { bump(sizes, Math.round(s.size * 2) / 2, s.text.length); bump(fonts, s.font, s.text.length); bump(colours, s.color || '', s.text.length); }
      left = Math.min(left, line.x); edge = Math.max(edge, right(line));
      if (prev && Math.abs(prev.size - line.size) < 0.3 && line.y > prev.y) bump(pitches, Math.round((line.y - prev.y) * 2) / 2 + '@' + Math.round(line.size * 2) / 2, 1);
      prev = line;
    }
  }
  const top = (map) => [...map].sort((a, b) => b[1] - a[1])[0]?.[0];
  const size = top(sizes) || 10, font = top(fonts) || '';
  let leading = size * 1.2, best = 0;
  for (const [key, count] of pitches) {
    const [pitch, at] = key.split('@').map(Number);
    if (at === size && pitch > size * 0.9 && pitch < size * 2.6 && count > best) { best = count; leading = pitch; }
  }
  let style = { b: false, i: false, mono: false };
  for (const page of pages) for (const line of page.lines) for (const s of line.spans) if (s.font === font) { style = s; break; }
  return { size, leading, b: !!style.b, i: !!style.i, mono: !!style.mono, color: top(colours) || '', left: Number.isFinite(left) ? left : 0, right: edge };
}

// Running headers, footers and page numbers: the same words at the same height
// on most pages, or a bare number in the top or bottom margin.
function repeated(pages) {
  const drop = new Set(), seen = new Map();
  pages.forEach((page, p) => {
    const flat = page.lines.filter((l) => !l.angle);
    flat.forEach((line, n) => {
      const top = line.y < page.height * 0.12, bottom = line.y > page.height * 0.88;
      if (!top && !bottom) return;
      const text = lineText(line);
      if (PAGE_NUMBER.test(text) && (line.y < page.height * 0.08 || line.y > page.height * 0.9) && (n === 0 || n === flat.length - 1 || flat.slice(n + 1).every((l) => Math.abs(l.y - line.y) < 2) || flat.slice(0, n).every((l) => Math.abs(l.y - line.y) < 2))) { drop.add(line); return; }
      const key = (top ? 'T' : 'B') + text.toLowerCase().replace(/\d+/g, '#') + '@' + Math.round(line.x / 8);
      const list = seen.get(key) || [];
      list.push({ p, y: line.y, line });
      seen.set(key, list);
    });
  });
  const need = Math.max(2, Math.ceil(pages.length * 0.4));
  for (const list of seen.values()) {
    const same = list.filter((e) => Math.abs(e.y - list[0].y) < 6);
    if (new Set(same.map((e) => e.p)).size >= need) for (const e of same) drop.add(e.line);
  }
  return drop;
}

// A lasting empty channel down the page with long lines on both sides means
// columns. Short cells on either side are a table, which is not split here.
function findGutter(lines) {
  if (lines.length < 8) return null;
  const x0 = Math.floor(Math.min(...lines.map((l) => l.x))), x1 = Math.ceil(Math.max(...lines.map(right))), width = x1 - x0;
  if (width < 200) return null;
  const cover = new Uint16Array(width + 1);
  for (const line of lines) for (const piece of pieces(line, Math.max(line.size * 0.7, 5))) for (let x = Math.max(0, Math.floor(piece.x) - x0); x <= Math.min(width, Math.ceil(right(piece)) - x0); x++) cover[x]++;
  const from = Math.round(width * 0.2), to = Math.round(width * 0.8);
  let low = Infinity;
  for (let x = from; x <= to; x++) low = Math.min(low, cover[x]);
  if (low > lines.length * 0.2) return null;
  const allow = low + Math.max(1, Math.floor(lines.length * 0.03));
  let best = null;
  for (let x = from; x <= to; x++) {
    if (cover[x] > allow) continue;
    let end = x;
    while (end + 1 <= width && cover[end + 1] <= allow) end++;
    let start = x;
    while (start - 1 >= 0 && cover[start - 1] <= allow) start--;
    if (!best || end - start > best.b - best.a) best = { a: start, b: end };
    x = end;
  }
  if (!best || best.b - best.a < 7 || best.b >= width - 20 || best.a <= 20) return null;
  const mid = x0 + (best.a + best.b) / 2, lefts = [], rights = [];
  for (const line of lines) {
    if (crosses(line, mid)) continue;
    const [l, r] = splitLine(line, mid);
    if (l) lefts.push(l);
    if (r) rights.push(r);
  }
  const long = (side) => median(side.map((l) => lineText(l).length)) >= 20;
  if (lefts.length < 6 || rights.length < 6 || !long(lefts) || !long(rights)) return null;
  // The right column has to start along one straight edge.
  const starts = new Map();
  for (const l of rights) starts.set(Math.round(l.x / 3), (starts.get(Math.round(l.x / 3)) || 0) + 1);
  const [edge, count] = [...starts].sort((a, b) => b[1] - a[1])[0];
  const near = count + (starts.get(edge - 1) || 0) + (starts.get(edge + 1) || 0);
  return near >= rights.length * 0.5 ? mid : null;
}

function crosses(entry, mid) {
  if (!entry.spans) return entry.x < mid - 4 && right(entry) > mid + 4;
  return pieces(entry, Math.max(entry.size * 0.7, 5)).some((p) => p.x < mid && right(p) > mid);
}

function splitLine(line, mid) {
  if (!line.spans) return right(line) <= mid + 4 ? [line, null] : [null, line];
  const l = line.spans.filter((s) => s.x + s.width / 2 < mid), r = line.spans.filter((s) => s.x + s.width / 2 >= mid);
  return [l.length ? (r.length ? lineOf(l) : line) : null, r.length ? (l.length ? lineOf(r) : line) : null];
}

// Reading order: full-width lines stay where they are, the columns between
// them are read left one first.
function regions(entries, depth = 0) {
  const mid = depth < 3 ? findGutter(entries.filter((e) => e.spans)) : null;
  if (mid === null) return entries.length ? [entries] : [];
  const out = [];
  let band = [], wide = null;
  const flush = () => {
    if (!band.length) return;
    const l = [], r = [];
    for (const e of band) { const [a, b] = splitLine(e, mid); if (a) l.push(a); if (b) r.push(b); }
    out.push(...regions(l, depth + 1), ...regions(r, depth + 1));
    band = [];
  };
  for (const e of entries) {
    if (crosses(e, mid)) { flush(); if (!wide) out.push(wide = []); wide.push(e); }
    else { band.push(e); wide = null; }
  }
  flush();
  return out;
}

// A list marker at the start of a line: what kind, and where the words start.
function marker(line, prevItem) {
  const first = line.spans[0], text = lineText(line), second = line.spans[1];
  const tabbed = second && second.x - right(first) > line.size * 0.5;
  let cut = 0, ordered = false, n = 1, kind = '';
  const bullet = text.match(BULLET), number = text.match(NUMBER);
  if (bullet) cut = bullet[0].length;
  else if (first.text.trim() === 'o' && second && (tabbed || second.font !== first.font)) cut = 2;
  else if (/^[\uE000-\uF8FF]{1,3}$/.test(first.text.trim()) && second) cut = first.text.trim().length + 1;
  else if (number) {
    const [, open, value, close] = number, lower = value.toLowerCase();
    if (open && close !== ')') return null;
    if (/^\d/.test(value)) { n = Number(value); kind = 'd'; }
    else {
      const letter = lower.length === 1 ? lower.charCodeAt(0) - 96 : 0;
      const follows = prevItem?._kind === 'l' && letter === prevItem.n + 1;
      const roman = ROMAN[lower] && !follows && (lower.length > 1 || (prevItem?._kind === 'r' && ROMAN[lower] === prevItem.n + 1) || (lower === 'i' && prevItem?._kind !== 'l'));
      if (roman) { n = ROMAN[lower]; kind = 'r'; } else if (letter) { n = letter; kind = 'l'; } else return null;
      // "A. Smith" starts a sentence more often than a list: want a tab,
      // brackets, or the letter before it.
      if (close === '.' && !open && !tabbed && !(prevItem?._kind === kind && n === prevItem.n + 1)) return null;
    }
    ordered = true; cut = number[0].length;
  } else return null;
  // Drop the marker from the spans and find where the words begin.
  const spans = [];
  let left = cut;
  for (const s of line.spans) {
    if (left <= 0) { spans.push(s); continue; }
    const prev = line.spans[line.spans.indexOf(s) - 1];
    if (prev && s.x - right(prev) > s.size * 0.15 && !/\s$/.test(prev.text)) left--;
    if (s.text.length <= left) { left -= s.text.length; continue; }
    const rest = s.text.slice(Math.max(0, left)).replace(/^\s+/, ''), used = s.text.length - rest.length;
    spans.push({ ...s, text: rest, x: s.x + s.width * used / s.text.length, width: s.width * rest.length / s.text.length });
    left = 0;
  }
  if (!spans.length) return null;
  return { ordered, n, spans, x: line.x, textX: spans[0].x, kind };
}

// White or pale text sat on a dark shape in the PDF. The shape doesn't come
// along, so the colour is left out and the words stay readable.
const pale = (c) => (parseInt(c.slice(0, 2), 16) * 0.299 + parseInt(c.slice(2, 4), 16) * 0.587 + parseInt(c.slice(4, 6), 16) * 0.114) > 185;

// Runs for a list of spans, with styles told apart from the everyday font.
function runsOf(spans, stats, { heading = false } = {}) {
  const runs = [];
  spans.forEach((s, n) => {
    const prev = spans[n - 1];
    const run = { text: s.text };
    if (prev && s.x - right(prev) > s.size * 0.15 && runs.length && !/\s$/.test(runs[runs.length - 1].text)) runs[runs.length - 1].text += ' ';
    if (s.b && !stats.b && !heading) run.b = true;
    if (s.i && !stats.i) run.i = true;
    if (s.mono && !stats.mono) run.code = true;
    if (s.sup) run.sup = true;
    if (s.sub) run.sub = true;
    if (s.color && s.color !== stats.color && !pale(s.color)) run.color = s.color;
    push(runs, run);
  });
  // A space between a styled word and a plain one belongs to the plain side.
  const styled = (r) => r.b || r.i || r.code || r.sup || r.sub;
  runs.forEach((run, n) => {
    const next = runs[n + 1], space = run.text.match(/\s+$/);
    if (next && space && styled(run) && !styled(next)) { run.text = run.text.slice(0, -space[0].length); next.text = ' ' + next.text; }
  });
  if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
  return runs.filter((r) => r.text);
}

const sameStyle = (a, b) => !a.b === !b.b && !a.i === !b.i && !a.code === !b.code && !a.sup === !b.sup && !a.sub === !b.sub && a.color === b.color;
function push(runs, run) {
  const last = runs[runs.length - 1];
  if (last && sameStyle(last, run)) last.text += run.text; else runs.push(run);
}

// Adds a wrapped line to a paragraph: a hyphen at the break goes when the word
// carries on in lower case, otherwise a space joins the two.
function join(runs, more) {
  if (!more.length) return;
  const last = runs[runs.length - 1], next = more[0].text;
  if (last) {
    if (/\u00AD$/.test(last.text)) last.text = last.text.slice(0, -1);
    else if (/[A-Za-z\u00C0-\u024F]-$/.test(last.text) && /^[a-z\u00DF-\u00FF]/.test(next)) last.text = last.text.slice(0, -1);
    else if (!(CJK.test(last.text.slice(-1)) && CJK.test(next[0])) && !/\s$/.test(last.text)) last.text += ' ';
  }
  for (const run of more) push(runs, { ...run });
}

// Rows of cells that keep the same empty channels between them for three or
// more lines in a row. Returns [{ from, to, block }] over the line list.
function findTables(lines, stats) {
  const found = [];
  const cells = (line) => line.spans ? pieces(line) : null;
  for (let i = 0; i < lines.length; i++) {
    const first = cells(lines[i]);
    if (!first || first.length < 2 || marker(lines[i])) continue;
    const channel = Math.max(6, lines[i].size * 0.6);
    let cols = first.map((p) => ({ a: p.x, b: right(p) }));
    const rows = [{ line: lines[i], parts: first, at: i }];
    const beside = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j], parts = cells(line), prev = rows[rows.length - 1].line;
      // A picture next to the table doesn't end it. It is handed back after.
      if (line.img && (line.x > cols[cols.length - 1].b || right(line) < cols[0].a)) { beside.push({ at: j, line }); continue; }
      if (!parts || line.y - prev.y > Math.max(line.size, prev.size) * 4 || line.y <= prev.y || (parts.length > 1 && marker(line))) break;
      const next = cols.map((c) => ({ ...c }));
      let fits = true;
      for (const p of parts) {
        const hit = next.filter((c) => p.x < c.b + 2 && right(p) > c.a - 2);
        if (hit.length > 1) { fits = false; break; }
        if (hit.length) { hit[0].a = Math.min(hit[0].a, p.x); hit[0].b = Math.max(hit[0].b, right(p)); }
        else next.push({ a: p.x, b: right(p) });
      }
      next.sort((a, b) => a.a - b.a);
      if (!fits || next.some((c, n) => n && c.a - next[n - 1].b < channel)) break;
      // A lone piece only belongs if it sits in one column, not across the table.
      if (parts.length === 1 && right(parts[0]) - parts[0].x > (next[next.length - 1].b - next[0].a) * 0.6) break;
      cols = next;
      rows.push({ line, parts, at: j });
    }
    // A wrapped cell sits closer to the line above than a new row does, and
    // leaves some columns empty. Loose single pieces at the end are not rows.
    let gaps, tight;
    for (;;) {
      gaps = rows.slice(1).map((r, n) => r.line.y - rows[n].line.y);
      tight = gaps.length && Math.max(...gaps) > Math.min(...gaps) * 1.25 ? (Math.max(...gaps) + Math.min(...gaps)) / 2 : 0;
      if (rows.length > 1 && rows[rows.length - 1].parts.length === 1 && !(tight && gaps[rows.length - 2] < tight)) rows.pop(); else break;
    }
    const full = rows.filter((r) => r.parts.length > 1).length;
    if (full < 3 || full < rows.length * 0.6 || cols.length < 2) continue;
    const table = [];
    rows.forEach((row, n) => {
      const wrapped = n && tight && gaps[n - 1] < tight && row.parts.length < cols.length;
      if (!wrapped) table.push(cols.map(() => []));
      const target = table[table.length - 1];
      for (const p of row.parts) {
        const c = cols.findIndex((col) => p.x < col.b + 2 && right(p) > col.a - 2);
        if (c >= 0) join(target[c], runsOf(p.spans, stats));
      }
    });
    if (table.length < 3) continue;
    const to = rows[rows.length - 1].at;
    found.push({ from: i, to, block: { t: 'table', rows: table }, beside: beside.filter((b) => b.at < to).map((b) => b.line) });
    i = to;
  }
  return found;
}

function codeLine(line, left) {
  const unit = line.size * 0.6;
  let text = ' '.repeat(Math.max(0, Math.round((line.x - left) / unit)));
  line.spans.forEach((s, n) => {
    const prev = line.spans[n - 1];
    if (prev) text += ' '.repeat(Math.max(/\s$/.test(text) ? 0 : (s.x - right(prev) > s.size * 0.15 ? 1 : 0), Math.round((s.x - right(prev)) / unit)));
    text += s.text;
  });
  return text;
}

export function blocksFromPdfPages(pages) {
  const stats = bodyStats(pages), drop = repeated(pages), blocks = [];
  const lead = (size) => stats.leading * size / stats.size;
  for (const page of pages) {
    const entries = [
      ...page.lines.filter((l) => !l.angle && !drop.has(l) && l.spans.length),
      ...(page.images || []).map((img) => ({ img, x: img.x, y: img.y + img.height, width: img.width, size: 0 })),
    ].sort((a, b) => a.y - b.y || a.x - b.x);
    const whole = regions(entries);
    for (const region of whole) {
      const lines = region.filter((e) => e.spans);
      // A column is measured against itself, a full-width run against the
      // margins the whole document keeps.
      const narrow = whole.length > 1 && lines.length > 3;
      const left = narrow ? Math.min(...lines.map((l) => l.x)) : Math.min(stats.left, ...lines.map((l) => l.x));
      const far = narrow ? Math.max(...lines.map(right)) : Math.max(stats.right, ...lines.map(right));
      const centred = (l) => Math.abs(l.x + l.width / 2 - (left + far) / 2) <= Math.max(3, (far - left) * 0.02) && l.x - left > Math.max(12, (far - left) * 0.08);
      // Where lines here really end, to tell a line that stopped early.
      const edge = lines.length >= 3 ? Math.max(...lines.map(right)) : far;
      const tables = findTables(region, stats);
      let para = null, prev = null, first = true;
      for (let n = 0; n < region.length; n++) {
        const line = region[n], table = tables.find((t) => t.from === n);
        const picture = ({ img }) => blocks.push({ t: 'img', bytes: img.png, mime: 'image/png', width: Math.round(img.width * 96 / 72), height: Math.round(img.height * 96 / 72) });
        if (table) { blocks.push(table.block); table.beside.forEach(picture); n = table.to; para = prev = null; first = false; continue; }
        if (line.img) { picture(line); para = prev = null; first = false; continue; }
        const text = lineText(line);
        if (!text) continue;
        const gap = prev ? line.y - prev.y : Infinity, loose = gap > lead(Math.max(line.size, prev?.size || 0)) * 1.3 || gap <= 0;
        const next = region.slice(n + 1).find((e) => e.spans), last = blocks[blocks.length - 1];
        const big = line.size >= stats.size * 1.15 && line.size - stats.size >= 0.9;
        const bold = line.spans.every((s) => s.b) && !stats.b;
        const mono = line.spans.every((s) => s.mono) && !stats.mono;
        const listed = marker(line, last?.t === 'li' ? last : null);

        // Headings: bigger than the body, or a short bold line standing alone.
        const alone = (!prev || loose || para?.t === 'h') && (!next || !next.spans.every((s) => s.b) || next.y - line.y > lead(line.size) * 1.3);
        const heading = !mono && /\p{L}/u.test(text) && !(listed && !listed.ordered)
          && ((big && text.length <= 150 && !(/[.,;]$/.test(text) && line.size < stats.size * 1.5)) || (bold && line.size >= stats.size * 0.95 && text.length <= 90 && text.split(/\s+/).length <= 12 && !/[.,;]$/.test(text) && alone));
        if (heading) {
          if (para?.t === 'h' && !loose && gap < line.size * 1.6 && Math.abs(para._size - line.size) < 0.3 && para._bold === bold && plain(para.runs).length + text.length < 200) join(para.runs, runsOf(line.spans, stats, { heading: true }));
          else { para = { t: 'h', level: 1, runs: runsOf(line.spans, stats, { heading: true }), _size: line.size, _bold: bold, _big: big }; if (centred(line)) para.align = 'center'; blocks.push(para); }
          prev = line; first = false;
          continue;
        }

        if (listed) {
          para = { t: 'li', ordered: listed.ordered, depth: 0, n: listed.n, runs: runsOf(listed.spans, stats), _x: listed.x, _textX: listed.textX, _kind: listed.kind };
          blocks.push(para); prev = line; first = false;
          continue;
        }

        if (mono) {
          if (para?.t === 'code' && gap > 0 && gap < lead(line.size) * 2.6) para.text += '\n'.repeat(gap > lead(line.size) * 1.7 ? 2 : 1) + codeLine(line, para._left);
          else { para = { t: 'code', text: codeLine(line, line.x), _left: line.x }; blocks.push(para); }
          prev = line; first = false;
          continue;
        }

        const runs = runsOf(line.spans, stats), mid = centred(line);
        const sized = prev && Math.abs(prev.size - line.size) < Math.max(0.6, line.size * 0.08);
        // Did the line above stop early, with room left for our first word?
        const word = text.split(/\s+/)[0].length * line.width / Math.max(1, text.length);
        const short = prev && right(prev) + prev.size * 0.3 + word < edge - 1;
        if (para?.t === 'li' && !loose && sized && (line.x > para._x + line.size * 0.5 || (Math.abs(line.x - para._x) < 2 && !short))) { join(para.runs, runs); prev = line; continue; }
        const inList = last && (last.t === 'li' || last.indent !== undefined) && Math.abs(line.x - (last._textX ?? -99)) < 3;
        let fresh = !para || para.t !== 'p' || loose || !sized;
        if (!fresh && para.align === 'center') fresh = !mid;
        else if (!fresh) fresh = short || mid || line.x > para._x + line.size * 0.8 || (para._lines > 1 && line.x < para._x - line.size * 0.8);
        // A sentence cut off by the end of a page or column carries on.
        if (first && !para && last?.t === 'p' && !last.align && !ENDS.test(plain(last.runs)) && /^[a-z\u00DF-\u00FF]/.test(text) && Math.abs((last._size || 0) - line.size) < 0.6) { para = last; para._x = line.x; para._lines = 2; fresh = false; }
        if (fresh) {
          para = { t: 'p', runs, _x: line.x, _lines: 1, _size: line.size };
          if (mid && right(line) < far - Math.max(12, (far - left) * 0.08)) para.align = 'center';
          if (inList) { para.indent = last.t === 'li' ? last.depth : last.indent; para._textX = last._textX; para._li = true; }
          blocks.push(para);
        } else {
          join(para.runs, runs);
          // The second line shows where the paragraph's own left edge is.
          if (para._lines++ === 1) para._x = line.x;
        }
        prev = line; first = false;
      }
    }
  }

  // Heading levels from the sizes that are really there, largest first.
  const sizes = [];
  for (const b of blocks) if (b.t === 'h' && b._big && !sizes.some((s) => Math.abs(s - b._size) <= s * 0.06)) sizes.push(b._size);
  sizes.sort((a, b) => b - a);
  // List depth from how far in each marker sits.
  for (let n = 0; n < blocks.length; n++) {
    if (blocks[n].t !== 'li') continue;
    let end = n;
    while (end + 1 < blocks.length && (blocks[end + 1].t === 'li' || blocks[end + 1]._li)) end++;
    const run = blocks.slice(n, end + 1), xs = [];
    for (const b of run) if (b.t === 'li' && !xs.some((x) => Math.abs(x - b._x) < 5)) xs.push(b._x);
    xs.sort((a, b) => a - b);
    let depth = 0;
    for (const b of run) {
      if (b.t === 'li') depth = b.depth = xs.findIndex((x) => Math.abs(x - b._x) < 5);
      else b.indent = depth;
    }
    n = end;
  }
  for (const b of blocks) {
    if (b.t === 'h') { const at = sizes.findIndex((s) => Math.abs(s - b._size) <= s * 0.06); b.level = Math.min(6, b._big && at >= 0 ? at + 1 : Math.max(2, sizes.length + 1)); }
    for (const key of Object.keys(b)) if (key[0] === '_') delete b[key];
  }
  const title = blocks.find((b) => b.t === 'h' && b.level === 1) || blocks.find((b) => b.t === 'h');
  return { title: title ? plain(title.runs).trim() : '', blocks };
}
