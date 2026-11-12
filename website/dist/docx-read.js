// Reads a Word file straight into the block list (docs/conversion-model.md).
// It follows the file's own styles and numbering, so headings, real lists,
// tables, alignment, colours, pictures, footnotes and page breaks come through.
import { readZip, unpack } from './office-zip.js';
import { tidy, imageBlock } from './conv-doc.js';

const decoder = new TextDecoder();
const kids = (node) => Array.from(node?.childNodes || []).filter((c) => c.nodeType === 1);
const child = (node, name) => kids(node).find((c) => c.localName === name);
const all = (node, name) => kids(node).filter((c) => c.localName === name);
const attr = (node, name) => { if (!node?.attributes) return undefined; for (const a of Array.from(node.attributes)) if (a.localName === name) return a.value; return undefined; };
const on = (node) => !!node && !['0', 'false', 'off', 'none'].includes(attr(node, 'val') ?? '1');
const deep = (node, name, out = []) => { for (const c of kids(node)) { if (c.localName === name) out.push(c); deep(c, name, out); } return out; };
const MONO = /consolas|courier|mono|menlo|monaco|source code|fira code|lucida console/i;
const HIGHLIGHT = new Set(['yellow', 'green', 'cyan', 'magenta', 'red', 'lightGray', 'darkYellow']);

const pale = (hex) => (0.299 * parseInt(hex.slice(0, 2), 16) + 0.587 * parseInt(hex.slice(2, 4), 16) + 0.114 * parseInt(hex.slice(4, 6), 16)) > 215;

export async function blocksFromDocx(bytes) {
  let entries;
  try { entries = await readZip(bytes, { maxBytes: 60_000_000, maxEntries: 5000, maxExpanded: 200_000_000, maxPart: 60_000_000 }); }
  catch (error) { if (/too large/.test(error.message)) throw error; throw new Error('This Word file looks damaged, or it isn’t a .docx. Old .doc files need saving as .docx first.'); }
  const xml = async (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    const text = decoder.decode(await unpack(entry));
    if (/<!ENTITY/i.test(text)) throw new Error('This file has an unsupported structure.');
    return new DOMParser().parseFromString(text, 'application/xml');
  };
  const main = await xml('word/document.xml');
  const body = main && deep(main, 'body')[0];
  if (!body) throw new Error('This Word file looks damaged, or it isn’t a .docx. Old .doc files need saving as .docx first.');

  // Styles: name, parent, and the few properties that change the outcome.
  const styles = new Map();
  for (const s of deep((await xml('word/styles.xml')) || { childNodes: [] }, 'style')) {
    if (attr(s, 'default') === '1' && attr(s, 'type') === 'paragraph') styles.normal = attr(s, 'styleId');
    const pPr = child(s, 'pPr'), rPr = child(s, 'rPr');
    styles.set(attr(s, 'styleId'), {
      name: (attr(child(s, 'name'), 'val') || '').toLowerCase(), based: attr(child(s, 'basedOn'), 'val'),
      outline: pPr && child(pPr, 'outlineLvl') ? Number(attr(child(pPr, 'outlineLvl'), 'val')) : undefined,
      numId: attr(child(child(pPr, 'numPr'), 'numId'), 'val'), ilvl: attr(child(child(pPr, 'numPr'), 'ilvl'), 'val'),
      jc: attr(child(pPr, 'jc'), 'val'), rPr,
    });
  }
  const stylesDoc = await xml('word/styles.xml');
  const defaults = child(child(child(stylesDoc && deep(stylesDoc, 'docDefaults')[0], 'rPrDefault'), 'rPr'), 'sz');
  const chain = (id) => { const out = []; for (let s = styles.get(id), n = 0; s && n < 12; s = styles.get(s.based), n++) out.push(s); return out; };
  const fromStyle = (id, key) => chain(id).find((s) => s[key] !== undefined)?.[key];
  // Font size and colour a paragraph style gives its text, in points and RRGGBB.
  const styleFont = (id) => {
    const found = {};
    for (const s of chain(id)) {
      const sz = attr(child(s.rPr, 'sz'), 'val'), color = attr(child(s.rPr, 'color'), 'val');
      if (found.size === undefined && sz) found.size = Number(sz) / 2;
      if (found.color === undefined && color && /^[0-9a-f]{6}$/i.test(color)) found.color = color.toUpperCase();
    }
    return found;
  };
  const baseSize = styleFont(styles.normal).size || (defaults ? Number(attr(defaults, 'val')) / 2 : 10);
  // Sizes are kept relative to the body text, on an 11 point base.
  const relative = (size) => Math.round(Math.max(6, Math.min(40, size * 11 / baseSize)) * 2) / 2;

  // Numbering: which lists are bullets, which are numbers, and where they start.
  const numbering = await xml('word/numbering.xml');
  const abstracts = new Map(), nums = new Map();
  if (numbering) {
    for (const a of deep(numbering, 'abstractNum')) abstracts.set(attr(a, 'abstractNumId'), new Map(all(a, 'lvl').map((l) => [attr(l, 'ilvl'), { format: attr(child(l, 'numFmt'), 'val') || 'decimal', start: Number(attr(child(l, 'start'), 'val') || 1) }])));
    for (const n of deep(numbering, 'num')) {
      const levels = new Map(abstracts.get(attr(child(n, 'abstractNumId'), 'val')) || []);
      for (const o of all(n, 'lvlOverride')) { const start = attr(child(o, 'startOverride'), 'val'), lvl = child(o, 'lvl'), key = attr(o, 'ilvl'); const base = levels.get(key) || { format: 'decimal', start: 1 }; levels.set(key, { format: lvl ? attr(child(lvl, 'numFmt'), 'val') || base.format : base.format, start: start !== undefined ? Number(start) : lvl && child(lvl, 'start') ? Number(attr(child(lvl, 'start'), 'val')) : base.start }); }
      nums.set(attr(n, 'numId'), levels);
    }
  }
  const counters = new Map();
  const nextNumber = (numId, level) => {
    const state = counters.get(numId) || [];
    counters.set(numId, state);
    const start = nums.get(numId)?.get(String(level))?.start ?? 1;
    state[level] = state[level] === undefined ? start : state[level] + 1;
    state.length = level + 1;
    return state[level];
  };

  const rels = new Map();
  for (const r of deep((await xml('word/_rels/document.xml.rels')) || { childNodes: [] }, 'Relationship')) rels.set(attr(r, 'Id'), { target: attr(r, 'Target'), external: attr(r, 'TargetMode') === 'External' });
  const pictureCache = new Map();
  const picture = async (id, size = {}) => {
    const rel = rels.get(id);
    if (!rel || rel.external) return null;
    const path = rel.target.startsWith('/') ? rel.target.slice(1) : 'word/' + rel.target.replace(/^\.\//, '');
    if (!entries.has(path)) return null;
    if (!pictureCache.has(path)) pictureCache.set(path, unpack(entries.get(path)));
    const ext = path.split('.').pop().toLowerCase();
    return imageBlock(await pictureCache.get(path), { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || '', size);
  };

  // Footnotes and endnotes are numbered in the text and listed at the end.
  const notes = [];
  const noteParts = { footnoteReference: await xml('word/footnotes.xml'), endnoteReference: await xml('word/endnotes.xml') };

  const runStyle = (rPr, base = {}) => {
    const style = { ...base };
    if (!rPr) return style;
    for (const s of chain(attr(child(rPr, 'rStyle'), 'val')).reverse()) Object.assign(style, runStyle(s.rPr));
    const flag = (name, key) => { const node = child(rPr, name); if (node) { if (on(node)) style[key] = true; else delete style[key]; } };
    flag('b', 'b'); flag('i', 'i'); flag('strike', 's'); flag('dstrike', 's');
    const u = child(rPr, 'u'); if (u) { if (on(u)) style.u = true; else delete style.u; }
    const vert = attr(child(rPr, 'vertAlign'), 'val');
    if (vert === 'superscript') style.sup = true; else if (vert === 'subscript') style.sub = true;
    const color = attr(child(rPr, 'color'), 'val');
    // Near-white text sat on a dark shape in Word; on a plain page it would vanish.
    if (color && /^[0-9a-f]{6}$/i.test(color) && color !== '000000' && !pale(color)) style.color = color.toUpperCase();
    if (HIGHLIGHT.has(attr(child(rPr, 'highlight'), 'val'))) style.mark = true;
    const sz = Number(attr(child(rPr, 'sz'), 'val')) / 2;
    if (sz && Math.abs(sz - baseSize) >= 1.5) style.size = relative(sz); else if (sz) delete style.size;
    const font = attr(child(rPr, 'rFonts'), 'ascii');
    if (font && MONO.test(font)) style.code = true;
    return style;
  };

  // Inline content of a paragraph as runs. Pictures ride along as { img }.
  async function inline(node, base, out, href) {
    for (const c of kids(node)) {
      const name = c.localName;
      if (name === 'r') {
        const style = runStyle(child(c, 'rPr'), base);
        if (href) { style.href = href; delete style.color; delete style.u; }
        for (const part of kids(c)) {
          const tag = part.localName;
          if (tag === 't') out.push({ text: part.textContent, ...style });
          else if (tag === 'tab') out.push({ text: '\t', ...style });
          else if (tag === 'br' || tag === 'cr') { if (attr(part, 'type') === 'page') out.push({ pageBreak: true, text: '' }); else if (attr(part, 'type') !== 'column') out.push({ text: '\n', ...style }); }
          else if (tag === 'noBreakHyphen') out.push({ text: '‑', ...style });
          else if (tag === 'sym') { const code = parseInt(attr(part, 'char') || '', 16); out.push({ text: code === 0xf0b7 || code === 0xb7 ? '•' : code === 0xf0fc ? '✓' : code === 0xf0e0 ? '→' : '', ...style }); }
          else if (tag === 'drawing' || tag === 'pict' || tag === 'object') await drawing(part, out);
          else if (tag === 'AlternateContent') { const choice = child(part, 'Choice') || child(part, 'Fallback'); if (choice) for (const d of kids(choice)) if (d.localName === 'drawing' || d.localName === 'pict') await drawing(d, out); }
          else if (tag === 'footnoteReference' || tag === 'endnoteReference') {
            const note = deep(noteParts[tag] || { childNodes: [] }, tag === 'footnoteReference' ? 'footnote' : 'endnote').find((n) => attr(n, 'id') === attr(part, 'id'));
            if (note) { notes.push(note); out.push({ text: String(notes.length), sup: true }); }
          }
        }
      } else if (name === 'hyperlink') {
        const rel = rels.get(attr(c, 'id'));
        const target = rel?.external && /^(https?:|mailto:)/i.test(rel.target) ? rel.target : null;
        await inline(c, base, out, target || href);
      } else if (name === 'ins' || name === 'smartTag' || name === 'fldSimple' || name === 'sdt' || name === 'sdtContent' || name === 'customXml' || name === 'bdo' || name === 'dir') await inline(c, base, out, href);
    }
    return out;
  }

  async function drawing(node, out) {
    const boxes = deep(node, 'txbxContent');
    if (boxes.length) { out.push({ box: boxes[0], text: '' }); return; }
    const blip = deep(node, 'blip')[0] || deep(node, 'imagedata')[0];
    const id = attr(blip, 'embed') || attr(blip, 'id');
    if (!id) return;
    const extent = deep(node, 'extent')[0];
    const size = extent ? { width: Number(attr(extent, 'cx')) / 9525, height: Number(attr(extent, 'cy')) / 9525 } : {};
    const image = await picture(id, { ...size, alt: attr(deep(node, 'docPr')[0], 'descr') || '' });
    if (image) out.push({ img: image, text: '' });
  }

  function kindOf(p) {
    const pPr = child(p, 'pPr'), styleId = attr(child(pPr, 'pStyle'), 'val');
    const names = chain(styleId).map((s) => s.name);
    const direct = child(pPr, 'outlineLvl');
    const outline = direct ? Number(attr(direct, 'val')) : fromStyle(styleId, 'outline');
    const heading = names.map((n) => /^heading (\d)/.exec(n)).find(Boolean);
    const numPr = child(pPr, 'numPr');
    const numId = numPr ? attr(child(numPr, 'numId'), 'val') : fromStyle(styleId, 'numId');
    const level = Number((numPr && attr(child(numPr, 'ilvl'), 'val')) ?? fromStyle(styleId, 'ilvl') ?? 0);
    const jc = attr(child(pPr, 'jc'), 'val') || fromStyle(styleId, 'jc');
    const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc];
    const font = styleFont(styleId);
    const info = { align, breakBefore: on(child(pPr, 'pageBreakBefore')), font };
    const listStyle = names.map((n) => /^list (bullet|number|continue)(?: (\d))?$/.exec(n)).find(Boolean);
    if (heading) return { ...info, t: 'h', level: Math.min(6, Number(heading[1])) };
    if (names.includes('title')) return { ...info, t: 'h', level: 1 };
    if (outline !== undefined && outline < 9 && !(numId && numId !== '0')) return { ...info, t: 'h', level: Math.min(6, outline + 1) };
    if (numId && numId !== '0' && listStyle) return { ...info, t: 'li', numId, depth: Math.max(level, Number(listStyle[2] || 1) - 1), ordered: listStyle[1] === 'number' };
    if (numId && numId !== '0') { const format = nums.get(numId)?.get(String(level))?.format || 'bullet'; return { ...info, t: 'li', numId, depth: level, ordered: format !== 'bullet' && format !== 'none' }; }
    const listName = names.find((n) => /^list (bullet|number)/.test(n));
    if (listName) return { ...info, t: 'li', numId: 'style:' + listName, depth: Math.max(0, Number(/\d+$/.exec(listName)?.[0] || 1) - 1), ordered: /number/.test(listName) };
    if (names.some((n) => /quote/.test(n))) return { ...info, t: 'quote' };
    if (names.some((n) => /\b(code|source|verbatim|preformatted|html pre)/.test(n))) return { ...info, t: 'code' };
    return { ...info, t: 'p' };
  }

  // Splits a run list into blocks around pictures, page breaks and text boxes.
  async function emit(out, runs, make) {
    let pending = [];
    const flush = () => { const text = tidy(pending); pending = []; if (text.length) out.push(make(text)); };
    for (const run of runs) {
      if (run.img) { flush(); out.push(run.img); }
      else if (run.pageBreak) { flush(); out.push({ t: 'break' }); }
      else if (run.box) { flush(); await blocksOf(run.box, out); }
      else pending.push(run);
    }
    flush();
  }

  // A cell holds text only, so its pictures and text boxes are handed back in
  // `loose` and placed straight after the table.
  async function cellRuns(cell, loose, aligns) {
    const out = [];
    for (const node of kids(cell)) {
      if (node.localName === 'p') {
        const kind = kindOf(node), runs = await inline(node, {}, []);
        for (const r of runs) { if (r.img) loose.push(r.img); else if (r.box) await blocksOf(r.box, loose); }
        const text = tidy(runs.filter((r) => !r.img && !r.pageBreak && !r.box));
        if (!text.length) continue;
        aligns.push(kind.align || 'left');
        if (out.length) out.push({ text: '\n' });
        if (kind.t === 'li') out.push({ text: kind.ordered ? nextNumber(kind.numId, kind.depth) + '. ' : '• ' });
        out.push(...(kind.t === 'h' ? text.map((r) => ({ ...r, b: true })) : text));
      } else if (node.localName === 'tbl') { const inner = deep(node, 't').map((t) => t.textContent).join(' ').trim(); if (inner) { if (out.length) out.push({ text: '\n' }); out.push({ text: inner }); } }
    }
    return tidy(out);
  }

  async function blocksOf(parent, out) {
    for (const node of kids(parent)) {
      const name = node.localName;
      if (name === 'p') {
        const kind = kindOf(node);
        const runs = await inline(node, {}, []);
        if (kind.breakBefore && out.length) out.push({ t: 'break' });
        const align = kind.align ? { align: kind.align } : {};
        if (kind.t === 'code') {
          const text = runs.filter((r) => !r.img && !r.pageBreak && !r.box).map((r) => r.text).join('');
          const last = out[out.length - 1];
          if (last?.t === 'code' && last.fromStyle) last.text += '\n' + text; else out.push({ t: 'code', text, fromStyle: true });
          continue;
        }
        if (kind.t === 'li') { let n; await emit(out, runs, (text) => ({ t: 'li', ordered: kind.ordered, depth: Math.min(kind.depth, 8), n: n ?? (n = nextNumber(kind.numId, kind.depth)), runs: text })); continue; }
        if (kind.t === 'h') { await emit(out, runs, (text) => ({ t: 'h', level: kind.level, runs: text.map(({ b, size, ...rest }) => rest), ...align, ...(kind.font.size ? { size: relative(kind.font.size) } : {}), ...(kind.font.color && kind.font.color !== '000000' && !pale(kind.font.color) ? { color: kind.font.color } : {}) })); continue; }
        const scaled = kind.font.size && Math.abs(kind.font.size - baseSize) >= 1.5 ? relative(kind.font.size) : 0;
        await emit(out, runs, (text) => ({ t: kind.t, runs: scaled ? text.map((r) => r.size ? r : { ...r, size: scaled }) : text, ...align }));
      } else if (name === 'tbl') {
        const rows = [], loose = [], votes = [];
        let head = 0;
        for (const tr of all(node, 'tr')) {
          const row = [];
          for (const tc of all(tr, 'tc')) {
            const tcPr = child(tc, 'tcPr');
            const merge = child(tcPr, 'vMerge');
            const aligns = [];
            const cell = merge && attr(merge, 'val') !== 'restart' ? [] : await cellRuns(tc, loose, aligns);
            if (aligns.length) { const tally = votes[row.length] || (votes[row.length] = {}); tally[aligns[0]] = (tally[aligns[0]] || 0) + 1; }
            const span = Math.min(50, Number(attr(child(tcPr, 'gridSpan'), 'val') || 1));
            if (span > 1) cell.span = span;
            row.push(cell);
            for (let k = 1; k < span; k++) { const filler = []; filler.merged = true; row.push(filler); }
          }
          if (!row.length) continue;
          if (on(child(child(tr, 'trPr'), 'tblHeader')) && head === rows.length) head++;
          rows.push(row);
        }
        const grid = all(child(node, 'tblGrid'), 'gridCol').map((g) => Number(attr(g, 'w')) || 0);
        const widths = grid.length && grid.every((w) => w > 0) && textWidth ? grid.map((w) => w / Math.max(textWidth, grid.reduce((a, b) => a + b, 0))) : null;
        // A column is centred or right-aligned when most of its cells are.
        const columns = Math.max(0, ...rows.map((r) => r.length));
        const align = Array.from({ length: columns }, (_, c) => { const tally = votes[c] || {}, total = Object.values(tally).reduce((a, b) => a + b, 0); return ['center', 'right'].find((a) => tally[a] > total / 2) || null; });
        if (rows.some((row) => row.some((cell) => cell.length))) out.push({ t: 'table', rows, ...(head > 1 ? { head } : {}), ...(align.some(Boolean) ? { align } : {}), ...(widths && widths.length === columns ? { widths } : {}) });
        out.push(...loose);
      } else if (name === 'sdt') { const content = child(node, 'sdtContent'); if (content) await blocksOf(content, out); }
      else if (name === 'ins' || name === 'customXml' || name === 'smartTag') await blocksOf(node, out);
    }
    return out;
  }

  const sect = child(body, 'sectPr'), pgSz = child(sect, 'pgSz'), pgMar = child(sect, 'pgMar');
  const textWidth = pgSz ? Number(attr(pgSz, 'w')) - Number(attr(pgMar, 'left') || 1440) - Number(attr(pgMar, 'right') || 1440) : 9026;
  const blocks = await blocksOf(body, []);
  if (notes.length) {
    blocks.push({ t: 'hr' });
    for (const [i, note] of notes.entries()) {
      const inner = await blocksOf(note, []);
      const first = inner.find((b) => b.runs);
      if (first) first.runs.unshift({ text: (i + 1) + '. ' });
      blocks.push(...inner);
    }
  }
  for (const block of blocks) delete block.fromStyle;
  while (blocks.length && blocks[blocks.length - 1].t === 'break') blocks.pop();
  const heading = blocks.find((b) => b.t === 'h');
  return { title: heading ? heading.runs.map((r) => r.text).join('') : '', blocks };
}
