// The document engine. Every input becomes one block list (headings,
// paragraphs, lists, code, quotes, tables, pictures) and every output is
// written from that list. The model is described in docs/conversion-model.md.
// Readers live here; the Word and PDF writers have their own files.
import { readZip, unpack, deflateEntry, writeZip } from './office-zip.js';
export { toDocx } from './docx-write.js';
export { toPdf } from './pdf-write.js';
export { blocksFromDocx } from './docx-read.js';

const BIG = { maxBytes: 60_000_000, maxEntries: 5000, maxExpanded: 200_000_000, maxPart: 60_000_000 };
const encoder = new TextEncoder(), decoder = new TextDecoder();
export const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '');
export const plain = (runs) => (runs || []).map((r) => r.text).join('');

// ---------- Runs ----------

const STYLE_KEYS = ['b', 'i', 'u', 's', 'code', 'sup', 'sub', 'href', 'color', 'mark', 'size'];
const sameStyle = (a, b) => STYLE_KEYS.every((k) => (a[k] || undefined) === (b[k] || undefined));

// Joins neighbours with the same style and trims the ends.
export function tidy(runs) {
  const out = [];
  for (const run of runs) {
    if (run.img) { out.push(run); continue; }
    const last = out[out.length - 1];
    if (last && !last.img && sameStyle(last, run)) last.text += run.text;
    else out.push({ ...run });
  }
  const text = out.filter((r) => !r.img);
  if (text.length) { text[0].text = text[0].text.replace(/^[ \n]+/, ''); text[text.length - 1].text = text[text.length - 1].text.replace(/[ \n]+$/, ''); }
  for (let i = 1; i < out.length; i++) if (!out[i].img && !out[i - 1].img && /[ \n]$/.test(out[i - 1].text) && out[i].text.startsWith(' ')) out[i].text = out[i].text.replace(/^ +/, '');
  return out.filter((r) => r.img || r.text);
}

// ---------- Pictures ----------

const fromBase64 = (text) => { const raw = atob(text.replace(/\s+/g, '')); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
export function toBase64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

// Pixel size of a PNG or JPEG, read from its header.
export function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) { const v = new DataView(bytes.buffer, bytes.byteOffset); return { mime: 'image/png', width: v.getUint32(16), height: v.getUint32(20) }; }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) { at++; continue; }
      const marker = bytes[at + 1], length = (bytes[at + 2] << 8) | bytes[at + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { mime: 'image/jpeg', height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
      at += 2 + length;
    }
  }
  return null;
}

function dataUri(src) {
  const match = /^data:([a-z0-9.+/-]+)?(;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(src || '');
  if (!match) return null;
  try { return { mime: (match[1] || 'text/plain').toLowerCase(), bytes: match[3] ? fromBase64(match[4]) : encoder.encode(decodeURIComponent(match[4])) }; } catch { return null; }
}

// A picture block from raw bytes. PNG and JPEG go straight in; anything else
// (GIF, WebP, SVG, BMP) is redrawn as PNG when a canvas is around.
export async function imageBlock(bytes, mime, { alt = '', width, height } = {}) {
  let size = imageSize(bytes);
  if (!size && typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: mime || 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      bytes = new Uint8Array(await blob.arrayBuffer()); size = imageSize(bytes);
    } catch { size = null; }
  }
  if (!size || !size.width || !size.height) return null;
  const w = Number(width) > 0 ? Number(width) : Number(height) > 0 ? Number(height) * size.width / size.height : size.width;
  const h = Number(height) > 0 && Number(width) > 0 ? Number(height) : w * size.height / size.width;
  return { t: 'img', bytes, mime: size.mime, width: Math.round(w), height: Math.round(h), alt };
}

// Readers leave { t: 'img', src } placeholders; this fills them in. A picture
// that can't be loaded (a web address, a missing file) becomes a short note
// so the reader knows something was there.
export async function resolveImages(doc, load) {
  const out = [];
  for (const block of doc.blocks) {
    if (block.t !== 'img' || block.bytes) { out.push(block); continue; }
    let found = dataUri(block.src);
    if (!found && load) { try { found = await load(block.src); } catch { found = null; } }
    const image = found ? await imageBlock(found.bytes, found.mime, block) : null;
    if (image) out.push({ ...image, ...(block.quote ? { quote: block.quote } : {}), ...(block.align ? { align: block.align } : {}) });
    else if (block.alt) out.push({ t: 'p', runs: [{ text: '[Picture: ' + block.alt + ']', i: true }], ...(block.quote ? { quote: block.quote } : {}) });
  }
  doc.blocks = out;
  return doc;
}

// ---------- Reading HTML (and everything that passes through it) ----------

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'BODY', 'CENTER', 'DL', 'DD', 'DT', 'ADDRESS', 'DETAILS', 'SUMMARY', 'FORM', 'FIELDSET']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'SVG', 'IFRAME', 'OBJECT', 'BUTTON', 'SELECT', 'TEXTAREA', 'TITLE', 'META', 'LINK']);
const STRUCT = /^(H[1-6]|UL|OL|PRE|TABLE|BLOCKQUOTE|HR)$/;
const tagOf = (node) => node.tagName.toUpperCase();
const kids = (node) => Array.from(node.childNodes || []);
const elements = (node) => kids(node).filter((c) => c.nodeType === 1);
const ALIGN = { center: 'center', right: 'right', justify: 'justify', left: 'left', end: 'right', start: 'left' };
const alignOf = (node) => ALIGN[(node.getAttribute?.('data-align') || node.getAttribute?.('align') || '').toLowerCase()] || (node.tagName && tagOf(node) === 'CENTER' ? 'center' : undefined);
const colorOf = (node) => { const c = (node.getAttribute('data-color') || node.getAttribute('color') || '').replace('#', ''); return /^[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : /^[0-9a-f]{3}$/i.test(c) ? c.replace(/./g, '$&$&').toUpperCase() : undefined; };

function styleFor(node, style) {
  const tag = tagOf(node), next = { ...style };
  if (tag === 'B' || tag === 'STRONG' || node.getAttribute('data-b') === '1') next.b = true;
  if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'VAR' || tag === 'DFN' || node.getAttribute('data-i') === '1') next.i = true;
  if (tag === 'U' || tag === 'INS' || node.getAttribute('data-u') === '1') next.u = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || node.getAttribute('data-s') === '1') next.s = true;
  if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') next.code = true;
  if (tag === 'SUP') { next.sup = true; delete next.sub; }
  if (tag === 'SUB') { next.sub = true; delete next.sup; }
  if (tag === 'MARK') next.mark = true;
  if (tag === 'A' && /^(https?:|mailto:)/i.test(node.getAttribute('href') || '')) next.href = node.getAttribute('href');
  const color = colorOf(node);
  if (color && color !== '000000') next.color = color;
  return next;
}

// Inline content as runs. `flat` is for table cells and list items, where
// nested paragraphs and lists have to fit in one run list.
function inline(node, style = {}, runs = [], flat = false) {
  for (const child of kids(node)) {
    if (child.nodeType === 3) {
      const text = style.pre ? child.nodeValue : child.nodeValue.replace(/[ \t\r\n\f]+/g, ' ');
      if (text) { const { pre, ...rest } = style; runs.push({ text, ...rest }); }
    } else if (child.nodeType === 1) {
      const tag = tagOf(child);
      if (SKIP.has(tag)) continue;
      const { pre, ...rest } = style;
      if (tag === 'BR') { runs.push({ text: '\n', ...rest }); continue; }
      if (tag === 'IMG') { runs.push({ img: imgOf(child), text: '' }); continue; }
      if (tag === 'INPUT') { if ((child.getAttribute('type') || '').toLowerCase() === 'checkbox') runs.push({ text: child.hasAttribute('checked') ? '☑ ' : '☐ ' }); continue; }
      if (tag === 'UL' || tag === 'OL' || tag === 'TABLE') {
        if (!flat) continue;
        if (tag === 'TABLE') { runs.push({ text: '\n' + child.textContent.replace(/\s+/g, ' ').trim() }); continue; }
        let n = Number(child.getAttribute('start') || 1);
        for (const item of elements(child).filter((c) => tagOf(c) === 'LI')) { runs.push({ text: '\n' + (tag === 'OL' ? n++ + '. ' : '• ') }); inline(item, style, runs, true); }
        continue;
      }
      if (flat && (BLOCK.has(tag) || tag === 'LI' || /^H[1-6]$/.test(tag) || tag === 'PRE' || tag === 'BLOCKQUOTE') && runs.some((r) => r.text?.trim() || r.img) && !/\n$/.test(runs[runs.length - 1].text || '')) runs.push({ text: '\n' });
      inline(child, tag === 'PRE' ? { ...styleFor(child, style), pre: true, code: true } : styleFor(child, style), runs, flat);
    }
  }
  return runs;
}

const imgOf = (node) => ({ src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || node.getAttribute('title') || '', width: parseFloat(node.getAttribute('width')) || undefined, height: parseFloat(node.getAttribute('height')) || undefined });

// Turns a run list into blocks: text becomes one block made by `make`, and each
// picture inside it becomes its own block in the same place.
function emit(out, runs, make, extra = {}) {
  let pending = [], made = false;
  const flush = () => { const text = tidy(pending); pending = []; if (text.length) { out.push({ ...make(text, made), ...extra }); made = true; } };
  for (const run of runs) {
    if (run.img) { flush(); if (run.img.src) out.push({ t: 'img', ...run.img, ...extra }); }
    else pending.push(run);
  }
  flush();
  return made;
}

function walk(node, out, context = {}) {
  const extra = context.quote ? { quote: context.quote } : {};
  const para = (runs) => context.quote ? { t: 'quote', runs } : context.indent !== undefined ? { t: 'p', runs, indent: context.indent } : { t: 'p', runs };
  let pending = [];
  const flush = (align) => { if (pending.length) { emit(out, pending, (runs) => ({ ...para(runs), ...(align ? { align } : {}) }), extra); pending = []; } };
  for (const child of kids(node)) {
    if (child.nodeType === 3) { if (child.nodeValue.trim() || pending.length) pending.push(...inline({ childNodes: [child] })); continue; }
    if (child.nodeType !== 1) continue;
    const tag = tagOf(child);
    if (SKIP.has(tag)) continue;
    if (/^H[1-6]$/.test(tag)) { flush(); const align = alignOf(child); emit(out, inline(child), (runs) => ({ t: 'h', level: Number(tag[1]), runs, ...(align ? { align } : {}) }), extra); }
    else if (tag === 'UL' || tag === 'OL') { flush(); list(child, out, tag === 'OL', context.indent ?? 0, context); }
    else if (tag === 'PRE') {
      flush();
      const code = elements(child).find((c) => tagOf(c) === 'CODE');
      const lang = /(?:language|lang)-([\w+#.-]+)/.exec((code || child).getAttribute('class') || '')?.[1];
      out.push({ t: 'code', text: child.textContent.replace(/\r\n?/g, '\n').replace(/\n$/, ''), ...(lang ? { lang } : {}), ...extra, ...(context.indent !== undefined ? { indent: context.indent } : {}) });
    }
    else if (tag === 'BLOCKQUOTE') { flush(); walk(child, out, { ...context, quote: (context.quote || 0) + 1 }); }
    else if (tag === 'HR') { flush(); out.push({ t: 'hr', ...extra }); }
    else if (tag === 'TABLE') { flush(); const block = table(child); if (block) out.push({ ...block, ...extra }); }
    else if (tag === 'DT') { flush(); emit(out, inline(child, { b: true }), para, extra); }
    else if (tag === 'DD') { flush(); walk(child, out, { ...context, indent: (context.indent ?? 0) + 1 }); }
    else if (BLOCK.has(tag) || tag === 'LI') {
      flush();
      const align = alignOf(child) || context.align;
      if (elements(child).some((c) => BLOCK.has(tagOf(c)) || STRUCT.test(tagOf(c)))) walk(child, out, align ? { ...context, align } : context);
      else emit(out, inline(child), (runs) => ({ ...para(runs), ...(align ? { align } : {}) }), extra);
    } else pending.push(...inline({ childNodes: [child] }));
  }
  flush(context.align);
  return out;
}

function list(node, out, ordered, depth, context) {
  const extra = context.quote ? { quote: context.quote } : {};
  let n = Number(node.getAttribute('start') || 1);
  for (const item of elements(node).filter((c) => tagOf(c) === 'LI')) {
    const number = item.getAttribute('value') ? (n = Number(item.getAttribute('value')) || n) : n;
    let started = false, pending = [], task;
    const flush = () => {
      if (!pending.length) return;
      const made = emit(out, pending, (runs, again) => started || again ? { t: 'p', runs, indent: depth + 1 } : { t: 'li', ordered, depth, n: number, runs, ...(task !== undefined ? { task } : {}) }, extra);
      started = started || made; pending = [];
    };
    const take = (holder) => {
      for (const child of kids(holder)) {
        if (child.nodeType === 3) { if (child.nodeValue.trim() || pending.length) pending.push(...inline({ childNodes: [child] })); continue; }
        if (child.nodeType !== 1) continue;
        const tag = tagOf(child);
        if (tag === 'INPUT' && (child.getAttribute('type') || '').toLowerCase() === 'checkbox' && !started && !pending.some((r) => r.text.trim())) { task = child.hasAttribute('checked'); continue; }
        if (tag === 'UL' || tag === 'OL') { flush(); if (!started) { out.push({ t: 'li', ordered, depth, n: number, runs: [], ...extra }); started = true; } list(child, out, tag === 'OL', depth + 1, context); }
        else if (tag === 'P' || tag === 'DIV') { flush(); take(child); flush(); }
        else if (STRUCT.test(tag) || BLOCK.has(tag)) { flush(); walk({ childNodes: [child] }, out, { ...context, indent: depth + 1 }); started = true; }
        else pending.push(...inline({ childNodes: [child] }));
      }
    };
    take(item); flush();
    n++;
  }
}

function table(node) {
  const rows = [], align = [];
  let head = 0, body = false;
  const visit = (holder, inHead) => {
    for (const child of elements(holder)) {
      const tag = tagOf(child);
      if (tag === 'THEAD') visit(child, true);
      else if (tag === 'TBODY' || tag === 'TFOOT') visit(child, false);
      else if (tag === 'TR') {
        const cells = elements(child).filter((c) => /^T[HD]$/.test(tagOf(c)));
        if (!cells.length) continue;
        const row = [];
        for (const cell of cells) {
          const runs = tidy(inline(cell, {}, [], true).filter((r) => !r.img || r.img.alt).map((r) => r.img ? { text: '[' + r.img.alt + ']' } : r));
          const span = Math.min(50, Number(cell.getAttribute('colspan')) || 1);
          if (span > 1) runs.span = span;
          const a = alignOf(cell);
          if (a && !align[row.length]) align[row.length] = a;
          row.push(runs);
          for (let k = 1; k < span; k++) { const filler = []; filler.merged = true; row.push(filler); }
        }
        if (!body && (inHead || cells.every((c) => tagOf(c) === 'TH'))) head++; else body = true;
        rows.push(row);
      }
    }
  };
  visit(node, false);
  if (!rows.length) return null;
  const block = { t: 'table', rows };
  if (align.some(Boolean)) block.align = Array.from({ length: Math.max(...rows.map((r) => r.length)) }, (_, i) => align[i] || 'left');
  if (head !== 1) block.head = Math.min(head, rows.length);
  return block;
}

// Style sheets are dropped before parsing: the page's security policy would
// only log warnings. The few style rules that change meaning (alignment,
// colour, bold, italic, underline) are kept as data attributes first.
function keepStyle(match, quoted) {
  const css = quoted.replace(/^["']|["']$/g, '').toLowerCase();
  let out = '';
  const align = /(?:^|;)\s*text-align\s*:\s*(left|right|center|justify|start|end)/.exec(css);
  if (align) out += ' data-align="' + align[1] + '"';
  const color = /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,6}\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/.exec(css);
  if (color) { const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color[1]); out += ' data-color="' + (rgb ? rgb.slice(1, 4).map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('') : color[1].slice(1)) + '"'; }
  if (/font-weight\s*:\s*(bold|[6-9]00)/.test(css)) out += ' data-b="1"';
  if (/font-style\s*:\s*(italic|oblique)/.test(css)) out += ' data-i="1"';
  if (/text-decoration[^;]*underline/.test(css)) out += ' data-u="1"';
  if (/text-decoration[^;]*line-through/.test(css)) out += ' data-s="1"';
  return out;
}
export const inertHtml = (html) => new DOMParser().parseFromString(String(html).replace(/<style\b[\s\S]*?<\/style\s*>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, keepStyle), 'text/html');

export function blocksFromHtml(html) {
  const doc = inertHtml(html);
  const root = doc.body || doc.documentElement;
  const blocks = walk(root, []);
  return { title: (doc.title || '').trim() || firstHeading(blocks), blocks };
}

// Markdown front matter (a block between --- lines at the very top) is
// settings, not content. Its title is kept.
export function splitFrontMatter(source) {
  const match = /^\ufeff?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match || !/^[\w-]+\s*:/m.test(match[1])) return { body: source, title: '' };
  const title = /^title\s*:\s*(.+)$/mi.exec(match[1])?.[1].trim().replace(/^["']|["']$/g, '') || '';
  return { body: source.slice(match[0].length), title };
}

export function blocksFromMarkdown(source, marked) {
  const { body, title } = splitFrontMatter(source.replace(/\r\n?/g, '\n'));
  const doc = blocksFromHtml(marked.parse(body, { gfm: true }));
  if (title) doc.title = title;
  return doc;
}

export function blocksFromText(text) {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((part) => part.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim()).map((part) => ({ t: 'p', runs: [{ text: part }] }));
  return { title: '', blocks };
}

const firstHeading = (blocks) => { const h = blocks.find((b) => b.t === 'h'); return h ? plain(h.runs) : ''; };

export function blocksFromTable(table) {
  const blocks = [];
  for (const sheet of table.sheets) {
    if (table.sheets.length > 1) blocks.push({ t: 'h', level: 2, runs: [{ text: sheet.name }] });
    const numeric = (c) => sheet.rows.slice(1).filter((row) => row[c] !== '' && row[c] != null).length > 0 && sheet.rows.slice(1).every((row) => row[c] === '' || row[c] == null || /^[-+(]?[$€£¥]?\s?\d[\d,.\s]*%?\)?$/.test(String(row[c]).trim()));
    const width = Math.max(0, ...sheet.rows.map((r) => r.length));
    const align = Array.from({ length: width }, (_, c) => numeric(c) ? 'right' : 'left');
    blocks.push({ t: 'table', rows: sheet.rows.map((row) => row.map((v) => v === '' || v == null ? [] : [{ text: String(v) }])), ...(align.includes('right') ? { align } : {}) });
  }
  return { title: '', blocks };
}

const xmlDoc = (bytes) => {
  const text = decoder.decode(bytes);
  if (/<!ENTITY/i.test(text)) throw new Error('This file has an unsupported structure.');
  return new DOMParser().parseFromString(text, 'application/xml');
};
const byLocal = (node, name) => Array.from(node.getElementsByTagName('*')).filter((n) => n.localName === name);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
const mimeOf = (name) => MIME[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const resolvePath = (href, dir) => { try { return decodeURIComponent(new URL(href, 'file:///' + dir).pathname.slice(1)); } catch { return ''; } };

// EPUB chapters in reading order. Pictures inside the book are loaded from
// the package itself.
export async function blocksFromEpub(bytes) {
  const entries = await readZip(bytes, BIG);
  const read = async (name) => { const e = entries.get(name); if (!e) throw new Error('This EPUB is missing ' + name + '.'); return unpack(e); };
  const container = xmlDoc(await read('META-INF/container.xml'));
  const opfPath = byLocal(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB has no table of contents.');
  const opf = xmlDoc(await read(opfPath));
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const items = new Map(byLocal(opf, 'item').map((i) => [i.getAttribute('id'), i.getAttribute('href')]));
  const title = byLocal(opf, 'title')[0]?.textContent || '';
  const blocks = [];
  for (const ref of byLocal(opf, 'itemref')) {
    const href = items.get(ref.getAttribute('idref'));
    if (!href) continue;
    const path = resolvePath(href.split('#')[0], dir);
    if (!entries.has(path)) continue;
    const chapter = decoder.decode(await unpack(entries.get(path)));
    const part = blocksFromHtml(chapter.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || chapter);
    const here = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    await resolveImages(part, async (src) => { const p = resolvePath(src, here); return entries.has(p) ? { bytes: await unpack(entries.get(p)), mime: mimeOf(p) } : null; });
    blocks.push(...part.blocks);
  }
  return { title: title.trim() || firstHeading(blocks), blocks };
}

export async function htmlFromOdt(bytes) {
  const entries = await readZip(bytes, BIG);
  if (!entries.has('content.xml')) throw new Error('This isn’t a readable .odt file.');
  const doc = xmlDoc(await unpack(entries.get('content.xml')));
  const body = byLocal(doc, 'text')[0];
  if (!body) return '';
  // Automatic styles say which spans are bold or italic and how paragraphs align.
  const styles = new Map();
  for (const style of byLocal(doc, 'style')) {
    const text = byLocal(style, 'text-properties')[0], para = byLocal(style, 'paragraph-properties')[0];
    const get = (node, name) => node ? Array.from(node.attributes).find((a) => a.localName === name)?.value : undefined;
    styles.set(style.getAttribute('style:name'), { b: get(text, 'font-weight') === 'bold', i: get(text, 'font-style') === 'italic', u: !!get(text, 'text-underline-style') && get(text, 'text-underline-style') !== 'none', s: !!get(text, 'text-line-through-style') && get(text, 'text-line-through-style') !== 'none', align: ALIGN[get(para, 'text-align')] });
  }
  const attr = (node, name) => Array.from(node.attributes || []).find((a) => a.localName === name)?.value;
  const text = (node) => kids(node).map((c) => {
    if (c.nodeType === 3) return esc(c.nodeValue);
    if (c.nodeType !== 1) return '';
    if (c.localName === 's') return ' '.repeat(Number(attr(c, 'c') || 1));
    if (c.localName === 'tab') return '\t';
    if (c.localName === 'line-break') return '<br>';
    if (c.localName === 'a') return '<a href="' + esc(attr(c, 'href') || '') + '">' + text(c) + '</a>';
    if (c.localName === 'span') { const st = styles.get(attr(c, 'style-name')) || {}; let inner = text(c); if (st.b) inner = '<b>' + inner + '</b>'; if (st.i) inner = '<i>' + inner + '</i>'; if (st.u) inner = '<u>' + inner + '</u>'; if (st.s) inner = '<s>' + inner + '</s>'; return inner; }
    if (c.localName === 'note' || c.localName === 'annotation') return '';
    return text(c);
  }).join('');
  const aligned = (node) => { const a = styles.get(attr(node, 'style-name'))?.align; return a && a !== 'left' ? ' align="' + a + '"' : ''; };
  const convert = (node) => elements(node).map((c) => {
    if (c.localName === 'h') { const level = Math.min(6, Number(attr(c, 'outline-level') || 1)); return '<h' + level + aligned(c) + '>' + text(c) + '</h' + level + '>'; }
    if (c.localName === 'p') return '<p' + aligned(c) + '>' + text(c) + '</p>';
    if (c.localName === 'list') return '<ul>' + elements(c).filter((li) => li.localName === 'list-item').map((li) => '<li>' + elements(li).map((n) => n.localName === 'list' ? convert({ childNodes: [n] }) : text(n)).join('') + '</li>').join('') + '</ul>';
    if (c.localName === 'table') return '<table>' + byLocal(c, 'table-row').map((r) => '<tr>' + byLocal(r, 'table-cell').filter((cell) => cell.parentNode === r).map((cell) => '<td>' + elements(cell).map(text).join('<br>') + '</td>').join('') + '</tr>').join('') + '</table>';
    if (c.localName === 'section') return convert(c);
    return '';
  }).join('');
  return convert(body);
}

// ---------- Writing: text, Markdown, HTML ----------

const quoteOf = (b) => b.quote || (b.t === 'quote' ? 1 : 0);

export function toText({ blocks }) {
  let out = '';
  blocks.forEach((b, i) => {
    let text;
    const pad = '  '.repeat(quoteOf(b));
    if (b.t === 'li') text = '  '.repeat(b.depth) + (b.task !== undefined ? (b.task ? '[x] ' : '[ ] ') : b.ordered ? b.n + '. ' : '• ') + plain(b.runs);
    else if (b.t === 'code') text = b.text;
    else if (b.t === 'hr') text = '----';
    else if (b.t === 'table') text = b.rows.map((row) => row.filter((c) => !c.merged).map((c) => plain(c).replace(/\n/g, ' ')).join('\t')).join('\n');
    else if (b.t === 'img') text = b.alt ? '[Picture: ' + b.alt + ']' : '';
    else if (b.t === 'break') text = '';
    else text = '  '.repeat(b.indent || 0) + plain(b.runs);
    if (!text && b.t !== 'li') return;
    text = text.split('\n').map((line) => pad + line).join('\n');
    if (out) out += b.t === 'li' && blocks[i - 1]?.t === 'li' ? '\n' : '\n\n';
    out += text;
  });
  return out.replace(/\n{3,}/g, '\n\n') + '\n';
}

function mdRuns(runs, start = false) {
  let out = runs.map((r) => {
    if (r.code) { const ticks = '`'.repeat(Math.max(0, ...(r.text.match(/`+/g) || []).map((t) => t.length)) + 1); return ticks + (r.text.startsWith('`') || ticks.length > 1 ? ' ' : '') + r.text.replace(/\n/g, ' ') + (r.text.endsWith('`') || ticks.length > 1 ? ' ' : '') + ticks; }
    const text = r.text.replace(/([\\*_`[\]<])/g, '\\$1').replace(/\n/g, '  \n');
    const pad = text.match(/^\s*/)[0], end = text.slice(pad.length).match(/\s*$/)[0];
    let core = text.trim();
    if (!core) return text;
    if (r.b) core = '**' + core + '**';
    if (r.i) core = '*' + core + '*';
    if (r.s) core = '~~' + core + '~~';
    if (r.u) core = '<u>' + core + '</u>';
    if (r.sup) core = '<sup>' + core + '</sup>';
    if (r.sub) core = '<sub>' + core + '</sub>';
    if (r.mark) core = '<mark>' + core + '</mark>';
    if (r.href) core = '[' + core + '](' + r.href.replace(/\)/g, '%29').replace(/ /g, '%20') + ')';
    return pad + core + end;
  }).join('');
  // A paragraph that happens to start like a heading, list or quote would
  // turn into one.
  if (start) out = out.replace(/^(#{1,6}\s|>|[-+]\s|\d+[.)]\s|={3,}|-{3,})/, (m) => /^\d/.test(m) ? m.replace(/[.)]/, '\\$&') : '\\' + m);
  return out;
}

// Markdown text. `image(block, index)` returns the address to write for a
// picture; by default the picture is embedded in the file as a data address.
export function toMarkdown({ blocks }, { image } = {}) {
  const out = [];
  let pictures = 0;
  for (const [i, b] of blocks.entries()) {
    const prev = blocks[i - 1];
    const tight = b.t === 'li' && prev && (prev.t === 'li' || (prev.t === 'p' && prev.indent)) && quoteOf(prev) === quoteOf(b);
    let text;
    if (b.t === 'h') text = '#'.repeat(b.level) + ' ' + mdRuns(b.runs).replace(/ {2}\n/g, ' ');
    else if (b.t === 'li') text = '    '.repeat(b.depth) + (b.ordered ? b.n + '. ' : '- ') + (b.task !== undefined ? (b.task ? '[x] ' : '[ ] ') : '') + mdRuns(b.runs).replace(/\n/g, '\n' + '    '.repeat(b.depth + 1));
    else if (b.t === 'code') { const fence = '`'.repeat(Math.max(3, ...(b.text.match(/`{3,}/g) || []).map((t) => t.length + 1))); text = fence + (b.lang || '') + '\n' + b.text + '\n' + fence; }
    else if (b.t === 'hr') text = '---';
    else if (b.t === 'break') continue;
    else if (b.t === 'img') { const src = image ? image(b, pictures) : 'data:' + b.mime + ';base64,' + toBase64(b.bytes); pictures++; text = '![' + (b.alt || '').replace(/[[\]]/g, '') + '](' + src + ')'; }
    else if (b.t === 'table') {
      const width = Math.max(1, ...b.rows.map((r) => r.length));
      const row = (r) => '| ' + Array.from({ length: width }, (_, k) => mdRuns(r[k] || []).replace(/\|/g, '\\|').replace(/ {2}\n|\n/g, '<br>')).join(' | ') + ' |';
      const rule = '|' + Array.from({ length: width }, (_, k) => ({ center: ' :---: |', right: ' ---: |' })[b.align?.[k]] || ' --- |').join('');
      text = [row(b.rows[0] || []), rule, ...b.rows.slice(1).map(row)].join('\n');
    } else text = mdRuns(b.runs, true);
    if (b.indent && b.t !== 'li') text = text.split('\n').map((line) => '    '.repeat(b.indent) + line).join('\n');
    const depth = quoteOf(b);
    if (depth) text = text.split('\n').map((line) => '> '.repeat(depth) + line).join('\n');
    const shared = prev ? Math.min(depth, quoteOf(prev)) : 0;
    const gap = !out.length ? '' : tight ? '\n' : shared ? '\n' + '>'.repeat(shared) + '\n' : '\n\n';
    out.push(gap + text);
  }
  return out.join('') + '\n';
}

function htmlRuns(runs) {
  return runs.map((r) => {
    let text = esc(r.text).replace(/\n/g, '<br />');
    if (r.code) text = '<code>' + text + '</code>';
    if (r.b) text = '<strong>' + text + '</strong>';
    if (r.i) text = '<em>' + text + '</em>';
    if (r.u) text = '<u>' + text + '</u>';
    if (r.s) text = '<s>' + text + '</s>';
    if (r.sup) text = '<sup>' + text + '</sup>';
    if (r.sub) text = '<sub>' + text + '</sub>';
    if (r.mark) text = '<mark>' + text + '</mark>';
    if (r.color) text = '<span style="color:#' + esc(r.color) + '">' + text + '</span>';
    if (r.href) text = '<a href="' + esc(r.href) + '">' + text + '</a>';
    return text;
  }).join('');
}

// HTML for the body, written so it is also valid XHTML (for e-books).
export function toHtmlBody({ blocks }, { image } = {}) {
  let html = '', lists = [], quotes = 0, pictures = 0;
  const closeLists = (depth) => { while (lists.length > depth) html += '</li></' + lists.pop() + '>\n'; };
  const align = (b) => b.align && b.align !== 'left' ? ' style="text-align:' + b.align + '"' : '';
  for (const b of blocks) {
    const depth = quoteOf(b);
    const inList = b.t === 'li' || (b.indent && lists.length);
    if (!inList || depth !== quotes) closeLists(0);
    while (quotes < depth) { html += '<blockquote>\n'; quotes++; }
    while (quotes > depth) { html += '</blockquote>\n'; quotes--; }
    if (b.t === 'li') {
      const tag = b.ordered ? 'ol' : 'ul';
      if (lists.length > b.depth + 1) closeLists(b.depth + 1);
      if (lists.length === b.depth + 1 && lists[b.depth] !== tag) closeLists(b.depth);
      if (lists.length === b.depth + 1) html += '</li>\n';
      while (lists.length < b.depth + 1) { html += '<' + tag + (b.ordered && b.n > 1 && lists.length === b.depth ? ' start="' + b.n + '"' : '') + '>'; lists.push(tag); }
      html += '<li>' + (b.task !== undefined ? (b.task ? '☑ ' : '☐ ') : '') + htmlRuns(b.runs);
      continue;
    }
    if (inList) closeLists(Math.min(lists.length, b.indent));
    const wrap = lists.length ? (inner) => inner : (inner) => inner + '\n';
    if (b.t === 'h') html += '<h' + b.level + align(b) + '>' + htmlRuns(b.runs) + '</h' + b.level + '>\n';
    else if (b.t === 'code') html += wrap('<pre><code' + (b.lang ? ' class="language-' + esc(b.lang) + '"' : '') + '>' + esc(b.text) + '</code></pre>');
    else if (b.t === 'hr') html += '<hr />\n';
    else if (b.t === 'break') html += '<div style="page-break-after:always"></div>\n';
    else if (b.t === 'img') { const src = image ? image(b, pictures) : 'data:' + b.mime + ';base64,' + toBase64(b.bytes); pictures++; html += wrap('<p><img src="' + esc(src) + '" alt="' + esc(b.alt || '') + '" width="' + b.width + '" height="' + b.height + '" /></p>'); }
    else if (b.t === 'table') {
      const head = b.head ?? 1;
      const cell = (runs, r, c) => runs.merged ? '' : '<' + (r < head ? 'th' : 'td') + (runs.span > 1 ? ' colspan="' + runs.span + '"' : '') + (b.align?.[c] && b.align[c] !== 'left' ? ' style="text-align:' + b.align[c] + '"' : '') + '>' + htmlRuns(runs) + '</' + (r < head ? 'th' : 'td') + '>';
      const row = (cells, r) => '<tr>' + cells.map((runs, c) => cell(runs, r, c)).join('') + '</tr>';
      html += '<table>' + (head ? '<thead>' + b.rows.slice(0, head).map(row).join('') + '</thead>' : '') + '<tbody>' + b.rows.slice(head).map((cells, r) => row(cells, r + head)).join('') + '</tbody></table>\n';
    }
    else html += wrap('<p' + align(b) + '>' + htmlRuns(b.runs) + '</p>');
  }
  closeLists(0);
  while (quotes-- > 0) html += '</blockquote>\n';
  return html;
}

const PAGE_CSS = 'body{font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#1b1b1f}h1,h2,h3,h4{line-height:1.25;margin:1.6em 0 .5em}img{max-width:100%;height:auto}pre{background:#f5f5f4;padding:1em;overflow:auto;border-radius:6px}code{font-family:ui-monospace,Consolas,monospace;font-size:.92em;background:#f5f5f4;padding:.1em .3em;border-radius:4px}pre code{padding:0;background:none}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #ccc;padding:.4em .7em;text-align:left;vertical-align:top}th{background:#f3f3f2}blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em;color:#555}li{margin:.2em 0}hr{border:0;border-top:1px solid #ccc;margin:2em 0}a{color:#0a58ca}';

export function toHtml(doc) {
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(doc.title || 'Document') + '</title>'
    + '<style>' + PAGE_CSS + '</style></head><body>\n' + toHtmlBody(doc) + '</body></html>\n';
}

export async function zip(files) {
  const entries = new Map();
  for (const [name, content] of files) await deflateEntry(entries, name, typeof content === 'string' ? encoder.encode(content) : content);
  return writeZip(entries);
}

// ---------- Writing: OpenDocument, RTF, EPUB ----------

export async function toOdt(doc) {
  const pictures = [];
  const span = (r) => {
    const text = esc(r.text).replace(/\n/g, '<text:line-break/>').replace(/\t/g, '<text:tab/>').replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>');
    const style = [r.b && 'B', r.i && 'I', r.u && 'U', r.s && 'S', r.code && 'C', r.sup && 'Sup', r.sub && 'Sub'].filter(Boolean);
    let inner = text;
    for (const name of style) inner = '<text:span text:style-name="' + name + '">' + inner + '</text:span>';
    return r.href ? '<text:a xlink:type="simple" xlink:href="' + esc(r.href) + '">' + inner + '</text:a>' : inner;
  };
  const runs = (list) => list.map(span).join('');
  const para = (b, fallback = 'Body') => (quoteOf(b) ? 'Quote' : b.align === 'center' ? 'Center' : b.align === 'right' ? 'Right' : b.align === 'justify' ? 'Justify' : b.indent ? 'List' + Math.min(b.indent, 3) : fallback);
  const body = doc.blocks.map((b) => {
    if (b.t === 'h') return '<text:h text:outline-level="' + b.level + '"' + (b.align === 'center' ? ' text:style-name="HCenter"' : '') + '>' + runs(b.runs) + '</text:h>';
    if (b.t === 'li') return '<text:p text:style-name="List' + Math.min(b.depth, 3) + '">' + (b.task !== undefined ? (b.task ? '☑ ' : '☐ ') : b.ordered ? b.n + '. ' : '• ') + runs(b.runs) + '</text:p>';
    if (b.t === 'code') return b.text.split('\n').map((l) => '<text:p text:style-name="Code">' + esc(l).replace(/\t/g, '<text:tab/>').replace(/^ +| {2,}/g, (m) => '<text:s text:c="' + m.length + '"/>') + '</text:p>').join('');
    if (b.t === 'hr') return '<text:p text:style-name="Rule"/>';
    if (b.t === 'break') return '<text:p text:style-name="Break"/>';
    if (b.t === 'img') {
      const name = 'Pictures/image' + (pictures.length + 1) + (b.mime === 'image/jpeg' ? '.jpg' : '.png');
      pictures.push([name, b.bytes, b.mime]);
      const scale = Math.min(1, 6.2 * 96 / b.width, 8.5 * 96 / b.height);
      return '<text:p><draw:frame draw:name="Picture ' + pictures.length + '" text:anchor-type="as-char" svg:width="' + (b.width * scale / 96).toFixed(3) + 'in" svg:height="' + (b.height * scale / 96).toFixed(3) + 'in"><draw:image xlink:href="' + name + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' + (b.alt ? '<svg:title>' + esc(b.alt) + '</svg:title>' : '') + '</draw:frame></text:p>';
    }
    if (b.t === 'table') {
      const width = Math.max(1, ...b.rows.map((r) => r.length)), head = b.head ?? 1;
      return '<table:table table:style-name="Table"><table:table-column table:number-columns-repeated="' + width + '"/>' + b.rows.map((row, r) => '<table:table-row>' + Array.from({ length: width }, (_, c) => {
        const cell = row[c] || [];
        if (cell.merged) return '<table:covered-table-cell/>';
        return '<table:table-cell table:style-name="' + (r < head ? 'HeadCell' : 'Cell') + '" office:value-type="string"' + (cell.span > 1 ? ' table:number-columns-spanned="' + cell.span + '"' : '') + '><text:p text:style-name="' + (b.align?.[c] === 'right' ? 'CRight' : b.align?.[c] === 'center' ? 'HCenter' : 'Standard') + '">' + runs(r < head ? cell.map((x) => ({ ...x, b: true })) : cell) + '</text:p></table:table-cell>';
      }).join('') + '</table:table-row>').join('') + '</table:table>';
    }
    return '<text:p text:style-name="' + para(b) + '">' + runs(b.runs) + '</text:p>';
  }).join('');
  const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
  const textStyle = (name, props) => '<style:style style:name="' + name + '" style:family="text"><style:text-properties ' + props + '/></style:style>';
  const paraStyle = (name, para, text = '') => '<style:style style:name="' + name + '" style:family="paragraph"><style:paragraph-properties ' + para + '/>' + (text ? '<style:text-properties ' + text + '/>' : '') + '</style:style>';
  const border = 'fo:border="0.5pt solid #bbbbbb" fo:padding="0.04in"';
  const styles = '<office:automatic-styles>'
    + textStyle('B', 'fo:font-weight="bold"') + textStyle('I', 'fo:font-style="italic"') + textStyle('U', 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"') + textStyle('S', 'style:text-line-through-style="solid"')
    + textStyle('C', 'style:font-name="Courier New" fo:font-family="\'Courier New\', monospace"') + textStyle('Sup', 'style:text-position="super 58%"') + textStyle('Sub', 'style:text-position="sub 58%"')
    + paraStyle('Code', 'fo:background-color="#f5f5f4" fo:margin-top="0in" fo:margin-bottom="0in"', 'fo:font-family="\'Courier New\', monospace" fo:font-size="10pt"')
    + paraStyle('Quote', 'fo:margin-left="0.4in" fo:border-left="1.5pt solid #bbbbbb" fo:padding-left="0.1in"', 'fo:color="#555555"')
    + paraStyle('Body', 'fo:margin-top="0in" fo:margin-bottom="0.1in"') + paraStyle('Center', 'fo:text-align="center" fo:margin-bottom="0.1in"') + paraStyle('Right', 'fo:text-align="end" fo:margin-bottom="0.1in"') + paraStyle('Justify', 'fo:text-align="justify" fo:margin-bottom="0.1in"') + paraStyle('CRight', 'fo:text-align="end"') + paraStyle('HCenter', 'fo:text-align="center"')
    + paraStyle('Rule', 'fo:border-bottom="0.5pt solid #aaaaaa" fo:padding="0in"') + paraStyle('Break', 'fo:break-after="page"')
    + [0, 1, 2, 3].map((d) => paraStyle('List' + d, 'fo:margin-left="' + (0.25 + d * 0.25) + 'in" fo:margin-top="0in" fo:margin-bottom="0.04in"')).join('')
    + '<style:style style:name="Table" style:family="table"><style:table-properties table:align="left" table:border-model="collapsing"/></style:style>'
    + '<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties ' + border + '/></style:style><style:style style:name="HeadCell" style:family="table-cell"><style:table-cell-properties ' + border + ' fo:background-color="#f2f2f2"/></style:style>'
    + '</office:automatic-styles>';
  return zip([
    ['mimetype', 'application/vnd.oasis.opendocument.text'],
    ['META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' + pictures.map(([name, , mime]) => '<manifest:file-entry manifest:full-path="' + name + '" manifest:media-type="' + mime + '"/>').join('') + '</manifest:manifest>'],
    ['content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content ' + ns + ' office:version="1.2">' + styles + '<office:body><office:text>' + body + '</office:text></office:body></office:document-content>'],
    ...pictures.map(([name, bytes]) => [name, bytes]),
  ]);
}

export function toRtf(doc) {
  const enc = (text) => Array.from(text).map((ch) => {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') return '\\' + ch;
    if (ch === '\n') return '\\line ';
    if (ch === '\t') return '\\tab ';
    if (code < 128) return ch;
    if (code > 0xffff) { const hi = Math.floor((code - 0x10000) / 0x400) + 0xd800, lo = ((code - 0x10000) % 0x400) + 0xdc00; return '\\u' + (hi - 65536) + '?\\u' + (lo - 65536) + '?'; }
    return '\\u' + (code > 32767 ? code - 65536 : code) + '?';
  }).join('');
  const runs = (list) => list.map((r) => '{' + (r.b ? '\\b ' : '') + (r.i ? '\\i ' : '') + (r.code ? '\\f1 ' : '') + (r.u || r.href ? '\\ul ' : '') + (r.s ? '\\strike ' : '') + (r.sup ? '\\super ' : '') + (r.sub ? '\\sub ' : '') + (r.href ? '\\cf2 ' : '') + enc(r.text) + '}').join('');
  const size = { 1: 40, 2: 32, 3: 28, 4: 24, 5: 22, 6: 22 };
  const q = { center: '\\qc', right: '\\qr', justify: '\\qj' };
  const hex = (bytes) => { let s = ''; for (const byte of bytes) s += byte.toString(16).padStart(2, '0'); return s; };
  const body = doc.blocks.map((b) => {
    const left = quoteOf(b) * 720 + (b.indent || 0) * 360, al = q[b.align] || '';
    if (b.t === 'h') return '{\\pard' + al + '\\sb240\\sa80\\keepn\\b\\fs' + size[b.level] + ' ' + runs(b.runs) + '\\par}';
    if (b.t === 'li') return '{\\pard\\li' + (360 + b.depth * 360 + left) + '\\fi-360\\sa60 ' + enc(b.task !== undefined ? (b.task ? '☑\t' : '☐\t') : b.ordered ? b.n + '.\t' : '•\t') + runs(b.runs) + '\\par}';
    if (b.t === 'code') return '{\\pard\\li' + left + '\\f1\\fs20\\cbpat3 ' + enc(b.text) + '\\par}';
    if (b.t === 'hr') return '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}';
    if (b.t === 'break') return '\\page';
    if (b.t === 'img') { const scale = Math.min(1, 6.2 * 96 / b.width, 8.5 * 96 / b.height); return '{\\pard\\sa160 {\\pict\\' + (b.mime === 'image/jpeg' ? 'jpegblip' : 'pngblip') + '\\picw' + b.width + '\\pich' + b.height + '\\picwgoal' + Math.round(b.width * scale * 15) + '\\pichgoal' + Math.round(b.height * scale * 15) + ' ' + hex(b.bytes) + '}\\par}'; }
    if (b.t === 'table') {
      const width = Math.max(1, ...b.rows.map((r) => r.length)), head = b.head ?? 1, col = Math.floor(9000 / width);
      return b.rows.map((row, r) => '{\\trowd\\trgaph80' + Array.from({ length: width }, (_, c) => '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10\\cellx' + col * (c + 1)).join('')
        + Array.from({ length: width }, (_, c) => '\\pard\\intbl' + (q[b.align?.[c]] || '') + ' ' + (r < head ? '{\\b ' + runs(row[c] || []) + '}' : runs(row[c] || [])) + '\\cell').join('') + '\\row}').join('\n') + '{\\pard\\sa160 \\par}';
    }
    return '{\\pard' + al + '\\li' + left + '\\sa160' + (quoteOf(b) ? '\\i' : '') + ' ' + runs(b.runs) + '\\par}';
  }).join('\n');
  return '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1\\fmodern Consolas;}}{\\colortbl;\\red0\\green0\\blue0;\\red5\\green99\\blue193;\\red245\\green245\\blue244;}\\fs22\n' + body + '\n}';
}

export async function toEpub(doc, id = 'urn:uuid:' + (globalThis.crypto?.randomUUID?.() || Date.now())) {
  const title = doc.title || 'Document';
  const split = doc.blocks.some((b) => b.t === 'h' && b.level === 1) ? 1 : doc.blocks.some((b) => b.t === 'h' && b.level === 2) ? 2 : 0;
  const chapters = [];
  for (const block of doc.blocks) {
    if (!chapters.length || (split && block.t === 'h' && block.level === split && chapters[chapters.length - 1].blocks.length)) chapters.push({ title: block.t === 'h' ? plain(block.runs) : title, blocks: [] });
    chapters[chapters.length - 1].blocks.push(block);
  }
  if (!chapters.length) chapters.push({ title, blocks: [] });
  const pictures = [];
  const image = (b) => { const name = 'images/image' + (pictures.length + 1) + (b.mime === 'image/jpeg' ? '.jpg' : '.png'); pictures.push([name, b.bytes, b.mime]); return name; };
  const page = (heading, body) => '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>' + esc(heading) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>' + body + '</body></html>';
  const pages = chapters.map((c) => page(c.title, toHtmlBody({ blocks: c.blocks }, { image })));
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['OEBPS/content.opf', '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">' + esc(id) + '</dc:identifier><dc:title>' + esc(title) + '</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2000-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>'
      + chapters.map((_, i) => '<item id="c' + i + '" href="c' + i + '.xhtml" media-type="application/xhtml+xml"/>').join('') + pictures.map(([name, , mime], i) => '<item id="img' + i + '" href="' + name + '" media-type="' + mime + '"/>').join('') + '</manifest><spine>' + chapters.map((_, i) => '<itemref idref="c' + i + '"/>').join('') + '</spine></package>'],
    ['OEBPS/nav.xhtml', page('Contents', '<nav epub:type="toc"><h1>Contents</h1><ol>' + chapters.map((c, i) => '<li><a href="c' + i + '.xhtml">' + esc(c.title) + '</a></li>').join('') + '</ol></nav>')],
    ['OEBPS/style.css', 'img{max-width:100%;height:auto}pre{background:#f5f5f4;padding:.8em;white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3em .6em;text-align:left}th{background:#f3f3f2}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:1em}'],
    ...pages.map((xhtml, i) => ['OEBPS/c' + i + '.xhtml', xhtml]),
    ...pictures.map(([name, bytes]) => ['OEBPS/' + name, bytes]),
  ]);
}
