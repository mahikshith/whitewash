// Writes a PDF from the block list (docs/conversion-model.md): real,
// selectable text laid out with headings, lists, tables that wrap and carry
// over pages, code blocks, quotes, pictures and working links.
// Needs pdf-lib, fontkit and the Noto fonts, loaded on first use.
import { fontTracker } from './font-trim.js';

const quoteOf = (b) => b.quote || (b.t === 'quote' ? 1 : 0);
const hexColor = (rgb, hex) => rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
const graphemes = (text) => typeof Intl !== 'undefined' && Intl.Segmenter ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment) : Array.from(text);
const INVISIBLE = /[​-‍⁠︀-️]/g;

export async function toPdf(doc, libs) {
  const { PDFDocument, PDFString, rgb, degrees } = await libs.pdfLib();
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(await libs.fontkit());
  // Fonts go in whole. pdf-lib's subsetting drops letters from these fonts in
  // most PDF viewers, so a smaller file isn't worth it. Bold and mono are only
  // added when the document uses them.
  const runsOf = (b) => b.t === 'table' ? b.rows.flat().flat() : b.runs || [];
  const needBold = doc.blocks.some((b) => b.t === 'h' || b.t === 'table' || runsOf(b).some((r) => r.b));
  const needMono = doc.blocks.some((b) => b.t === 'code' || runsOf(b).some((r) => r.code));
  const tracker = fontTracker();
  const load = async (name) => pdf.embedFont(await libs.fontBytes(name), { subset: false });
  const regular = await load('NotoSans-Regular.ttf');
  const bold = needBold ? await load('NotoSans-Bold.ttf') : regular, mono = needMono ? await load('NotoSansMono-Regular.ttf') : regular;
  if (doc.title) pdf.setTitle(doc.title);

  // A very wide table gets landscape pages so its columns stay readable.
  const wide = doc.blocks.some((b) => b.t === 'table' && Math.max(...b.rows.map((r) => r.length)) > 7);
  const [W, H] = wide ? [841.89, 595.28] : [595.28, 841.89];
  const M = 56, CONTENT = W - M * 2, TOP = H - M;
  const INK = rgb(0.1, 0.1, 0.12), MUTED = rgb(0.36, 0.36, 0.4), LINK = rgb(0.02, 0.35, 0.75), RULE = rgb(0.78, 0.78, 0.78), SHADE = rgb(0.96, 0.96, 0.955), HEAD = rgb(0.95, 0.95, 0.95);
  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = TOP; };
  newPage();
  const ensure = (height) => { if (y - height < M && y < TOP) newPage(); };

  // ----- Characters the fonts don't have -----
  // Noto Sans covers Latin, Greek and Cyrillic. Anything else (emoji, Chinese,
  // Japanese, Korean, Arabic…) is drawn by the browser into a small picture
  // and placed in the line, so it shows up instead of turning into "?".
  const charsets = new Map();
  // fontkit's shaping for some scripts (Indic, Thai…) needs code this page
  // can't run, so a character that can't be laid out counts as missing.
  const shapes = new Map();
  const shapable = (font, ch) => {
    if (ch.codePointAt(0) < 0x250) return true;
    const key = (font === bold ? 'b' : font === mono ? 'm' : 'r') + ch;
    if (!shapes.has(key)) { try { font.widthOfTextAtSize(ch, 10); shapes.set(key, true); } catch { shapes.set(key, false); } }
    return shapes.get(key);
  };
  const has = (font, ch) => { if (!charsets.has(font)) charsets.set(font, new Set(font.getCharacterSet())); return charsets.get(font).has(ch.codePointAt(0)) && shapable(font, ch); };
  const covered = (font, cluster) => Array.from(cluster.replace(INVISIBLE, '')).every((ch) => /\s/.test(ch) || has(font, ch));
  const glyphs = new Map();
  async function prepare(runsList) {
    if (!libs.textImage) return;
    for (const { runs, boldAll } of runsList) for (const r of runs || []) {
      const font = fontFor(r, boldAll);
      for (const cluster of graphemes(r.text)) {
        if (covered(font, cluster)) continue;
        const key = cluster + '|' + (font === bold ? 'b' : '') + '|' + (r.href ? 'link' : r.color || '');
        if (glyphs.has(key)) continue;
        try {
          const made = await libs.textImage(cluster, { bold: font === bold, color: r.href ? '0559BF' : r.color || '1A1A1F' });
          glyphs.set(key, made ? { ...made, image: await pdf.embedPng(made.bytes) } : null);
        } catch { glyphs.set(key, null); }
      }
    }
  }
  const fontFor = (r, boldAll) => r.code ? mono : r.b || boldAll ? bold : regular;

  // ----- Line layout -----
  // Breaks runs into pieces, measures them and wraps them to a width.
  function layout(runs, width, { size = 11, boldAll = false, color = INK, keepSpaces = false } = {}) {
    width += 0.01;
    const pieces = [];
    for (const r of runs || []) {
      const font = fontFor(r, boldAll), scale = r.sup || r.sub ? 0.68 : 1, s = (r.size || size) * scale;
      const style = { font, size: s, run: r, color: r.href ? LINK : r.color ? hexColor(rgb, r.color) : color, rise: r.sup ? size * 0.36 : r.sub ? -size * 0.14 : 0 };
      for (const [n, part] of r.text.replace(/\t/g, '    ').split('\n').entries()) {
        if (n > 0) pieces.push({ br: true });
        for (const word of part.split(/(\s+)/)) {
          if (!word) continue;
          if (/^\s+$/.test(word)) { pieces.push({ ...style, text: word.replace(/[^  ]/g, ' '), space: true, w: font.widthOfTextAtSize(' ', s) * word.length }); continue; }
          let text = '';
          const push = () => { if (text) { pieces.push({ ...style, text, w: font.widthOfTextAtSize(text, s) }); text = ''; } };
          for (const cluster of graphemes(word)) {
            if (covered(font, cluster)) { text += cluster.replace(INVISIBLE, ''); continue; }
            const glyph = glyphs.get(cluster + '|' + (font === bold ? 'b' : '') + '|' + (r.href ? 'link' : r.color || ''));
            if (glyph) { push(); pieces.push({ ...style, glyph, text: cluster, w: glyph.width * s / glyph.em }); }
            else text += cluster.replace(INVISIBLE, '') ? '?' : '';
          }
          push();
        }
      }
    }
    const lines = [];
    let line = [], used = 0;
    const flush = (wrapped = false) => { while (line.length && line[line.length - 1].space) used -= line.pop().w; lines.push({ items: line, w: used, wrapped }); line = []; used = 0; };
    for (const piece of pieces) {
      if (piece.br) { flush(); continue; }
      if (piece.space) { if (line.length || keepSpaces) { line.push(piece); used += piece.w; } continue; }
      if (used + piece.w > width && line.length) flush(true);
      if (piece.w > width && !piece.glyph) {
        // A single word longer than the line is broken between letters.
        let chunk = '';
        for (const ch of graphemes(piece.text)) {
          const w = piece.font.widthOfTextAtSize(chunk + ch, piece.size);
          if (used + w > width && (chunk || line.length)) { if (chunk) { line.push({ ...piece, text: chunk, w: piece.font.widthOfTextAtSize(chunk, piece.size) }); used += line[line.length - 1].w; } flush(); chunk = ch; }
          else chunk += ch;
        }
        if (chunk) { const w = piece.font.widthOfTextAtSize(chunk, piece.size); line.push({ ...piece, text: chunk, w }); used += w; }
        continue;
      }
      line.push(piece); used += piece.w;
    }
    if (line.length || !lines.length) flush();
    return lines;
  }

  function link(x, bottom, width, height, href) {
    const annotation = pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, bottom, x + width, bottom + height], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(href) } });
    page.node.addAnnot(pdf.context.register(annotation));
  }

  // Draws one laid-out line with its baseline at `base`.
  function drawLine(line, x, base, size) {
    for (const item of line.items) {
      const r = item.run;
      if (r.mark) page.drawRectangle({ x, y: base - size * 0.24, width: item.w, height: size * 1.16, color: rgb(1, 0.93, 0.55) });
      if (r.code && !line.block) page.drawRectangle({ x: x - 0.8, y: base - size * 0.26, width: item.w + 1.6, height: size * 1.2, color: SHADE });
      if (item.glyph) { const k = item.size / item.glyph.em; page.drawImage(item.glyph.image, { x: x - 2 * k, y: base + item.rise - (item.glyph.height - item.glyph.baseline) * k, width: item.glyph.canvasWidth * k, height: item.glyph.height * k }); }
      else if (!item.space) { tracker.use(item.font, item.text); page.drawText(item.text, { x, y: base + item.rise, size: item.size, font: item.font, color: item.color, ...(r.i ? { ySkew: degrees(12) } : {}) }); }
      if (r.u || r.href) page.drawLine({ start: { x, y: base - size * 0.13 }, end: { x: x + item.w, y: base - size * 0.13 }, thickness: Math.max(0.5, size * 0.055), color: item.color });
      if (r.s) page.drawLine({ start: { x, y: base + size * 0.3 }, end: { x: x + item.w, y: base + size * 0.3 }, thickness: Math.max(0.5, size * 0.055), color: item.color });
      if (r.href) link(x, base - size * 0.25, item.w, size * 1.2, r.href);
      x += item.w;
    }
  }

  // Quote bars down the left edge of everything inside a block quote.
  let bars = 0;
  const drawBars = (top, bottom, depth = bars) => { for (let k = 0; k < depth; k++) page.drawRectangle({ x: M + k * 14 + 2, y: bottom, width: 2.2, height: top - bottom, color: RULE }); };
  const gap = (height, nextDepth = 0) => { if (y === TOP) return; const depth = Math.min(bars, nextDepth); if (depth && y - height >= M) drawBars(y, y - height, depth); y -= height; };

  // Lays out and draws a paragraph. `before(lineIndex, top, lineHeight)` lets
  // the caller paint a background or a list marker for a line.
  function paragraph(runs, { size = 11, lead = 1.45, x = M, width = CONTENT, align, boldAll, color, before, block } = {}) {
    const lines = layout(runs, width, { size, boldAll, color, keepSpaces: block });
    lines.forEach((line, i) => {
      const lineHeight = Math.max(size, ...line.items.map((item) => item.run.sup || item.run.sub ? 0 : item.size)) * lead;
      ensure(lineHeight);
      line.block = block;
      before?.(i, y, lineHeight);
      if (bars) drawBars(y, y - lineHeight);
      const shift = align === 'center' ? (width - line.w) / 2 : align === 'right' ? width - line.w : 0;
      // Justified text: wrapped lines share the spare room between their spaces.
      const spaces = align === 'justify' && line.wrapped ? line.items.filter((item) => item.space) : [];
      if (spaces.length && width - line.w < width * 0.25) { const extra = (width - line.w) / spaces.length; for (const item of spaces) item.w += extra; }
      drawLine(line, x + Math.max(0, shift), y - lineHeight + (lineHeight - size) / 2 + size * 0.22, size);
      y -= lineHeight;
    });
    return lines.length;
  }

  const embedded = new Map();
  async function embed(block) {
    if (!embedded.has(block.bytes)) embedded.set(block.bytes, (block.mime === 'image/jpeg' ? pdf.embedJpg(block.bytes) : pdf.embedPng(block.bytes)).catch(() => null));
    return embedded.get(block.bytes);
  }

  function table(b, x, width) {
    const columns = Math.max(1, ...b.rows.map((r) => r.length)), head = Math.min(b.head ?? 1, b.rows.length);
    const size = columns > 9 ? 7 : columns > 6 ? 8 : 9.5, padX = columns > 9 ? 3 : 5, padY = 3.5, lineHeight = size * 1.35;
    const cellRuns = (r, c) => { const cell = b.rows[r][c] || []; return r < head ? cell.map((run) => ({ ...run, b: true })) : cell; };
    // Each column gets what its longest line wants, squeezed towards its
    // longest word when the table is wider than the page.
    const want = Array(columns).fill(18), least = Array(columns).fill(14);
    b.rows.forEach((row, r) => row.forEach((cell, c) => {
      if (cell.merged || cell.span > 1) return;
      const lines = layout(cellRuns(r, c), 1e6, { size });
      want[c] = Math.max(want[c], ...lines.map((l) => l.w));
      least[c] = Math.max(least[c], Math.min(120, Math.max(0, ...lines.flatMap((l) => l.items.filter((i) => !i.space).map((i) => i.w)))));
    }));
    const room = width - padX * 2 * columns;
    let widths;
    const wanted = want.reduce((s, w) => s + w, 0), minimum = least.reduce((s, w) => s + w, 0);
    if (b.widths?.length === columns) widths = b.widths.map((f) => Math.max(10, f * width - padX * 2));
    else if (wanted <= room) widths = want;
    else if (minimum <= room) widths = least.map((m, c) => m + (room - minimum) * (want[c] - m) / Math.max(1, wanted - minimum));
    else widths = least.map((m) => m * room / minimum);
    const colX = [x];
    widths.forEach((w, c) => colX.push(colX[c] + w + padX * 2));

    const layoutRow = (r) => {
      const cells = [];
      for (let c = 0; c < columns; c++) {
        const cell = b.rows[r][c] || [];
        if (cell.merged) continue;
        const span = Math.min(cell.span || 1, columns - c);
        const w = colX[c + span] - colX[c] - padX * 2;
        cells.push({ c, span, w, lines: layout(cellRuns(r, c), w, { size }) });
      }
      return { r, cells, count: Math.max(1, ...cells.map((cell) => cell.lines.length)) };
    };
    // Draws `count` lines of a row starting at line `from`.
    const drawRow = (row, from, count) => {
      const height = count * lineHeight + padY * 2;
      for (const cell of row.cells) {
        const left = colX[cell.c], w = colX[cell.c + cell.span] - left;
        page.drawRectangle({ x: left, y: y - height, width: w, height, borderColor: RULE, borderWidth: 0.5, color: row.r < head ? HEAD : undefined });
        const align = b.align?.[cell.c];
        cell.lines.slice(from, from + count).forEach((line, k) => {
          const shift = align === 'center' ? (cell.w - line.w) / 2 : align === 'right' ? cell.w - line.w : 0;
          drawLine(line, left + padX + Math.max(0, shift), y - padY - (k + 1) * lineHeight + (lineHeight - size) / 2 + size * 0.22, size);
        });
      }
      if (bars) drawBars(y, y - height);
      y -= height;
    };
    const headRows = b.rows.slice(0, head).map((_, r) => layoutRow(r));
    const headHeight = headRows.reduce((s, row) => s + row.count * lineHeight + padY * 2, 0);
    const repeatHead = () => { if (headHeight < (TOP - M) / 3) for (const row of headRows) drawRow(row, 0, row.count); };
    b.rows.forEach((_, r) => {
      const row = r < head ? headRows[r] : layoutRow(r);
      let from = 0;
      while (from < row.count) {
        const left = row.count - from;
        let fit = Math.floor((y - M - padY * 2) / lineHeight);
        if (fit < Math.min(left, 2) || (fit < left && left * lineHeight + padY * 2 <= TOP - M - headHeight)) {
          // Not enough room: carry the row over, with the header on top again.
          if (y < TOP) { newPage(); if (r >= head) repeatHead(); }
          fit = Math.floor((y - M - padY * 2) / lineHeight);
        }
        const count = Math.max(1, Math.min(left, fit));
        drawRow(row, from, count);
        from += count;
      }
    });
  }

  await prepare(doc.blocks.flatMap((b) => b.t === 'table' ? b.rows.flatMap((row, r) => row.map((cell) => ({ runs: cell, boldAll: r < (b.head ?? 1) }))) : b.t === 'code' ? [{ runs: [{ text: b.text, code: true }] }] : [{ runs: b.runs, boldAll: b.t === 'h' }]));

  for (const [i, b] of doc.blocks.entries()) {
    const next = doc.blocks[i + 1];
    const depth = quoteOf(b), nextDepth = next ? quoteOf(next) : 0;
    bars = depth;
    const x = M + depth * 14 + (b.t !== 'li' ? (b.indent || 0) * 18 : 0), width = W - M - x;
    const color = depth ? MUTED : INK;
    if (b.t === 'h') {
      const size = b.size || [0, 22, 17, 14, 12, 11, 10.5][Math.min(Math.max(b.level, 1), 6)];
      gap(size * 0.7, depth);
      // Keep a heading with the first lines of what follows it.
      ensure(layout(b.runs, width, { size, boldAll: true }).length * size * 1.25 + 34);
      paragraph(b.runs, { size, lead: 1.25, boldAll: true, x, width, align: b.align, color: b.color ? hexColor(rgb, b.color) : b.level > 4 ? MUTED : INK });
      gap(size * 0.35, nextDepth);
    } else if (b.t === 'li') {
      const level = b.depth || 0, left = x + level * 18, markerWidth = 18;
      const marker = b.task !== undefined ? null : b.ordered ? (b.n ?? 1) + '.' : '•';
      const size = 11;
      paragraph(b.runs.length ? b.runs : [{ text: ' ' }], { x: left + markerWidth, width: W - M - left - markerWidth, color, before: (line, top, lineHeight) => {
        if (line) return;
        const base = top - lineHeight + (lineHeight - size) / 2 + size * 0.22;
        if (b.ordered) { const w = regular.widthOfTextAtSize(marker, size); tracker.use(regular, marker); page.drawText(marker, { x: left + Math.max(0, markerWidth - 5 - w), y: base, size, font: regular, color }); }
        else if (marker) {
          // Bullets are drawn, not typed: a dot, then a ring, then a small square.
          const cx = left + 6, cy = base + size * 0.3;
          if (level % 3 === 0) page.drawCircle({ x: cx, y: cy, size: 1.7, color });
          else if (level % 3 === 1) page.drawCircle({ x: cx, y: cy, size: 1.6, borderColor: color, borderWidth: 0.7 });
          else page.drawRectangle({ x: cx - 1.5, y: cy - 1.5, width: 3, height: 3, color });
        }
        else {
          page.drawRectangle({ x: left + 2, y: base - 0.5, width: 8, height: 8, borderColor: MUTED, borderWidth: 0.8 });
          if (b.task) { page.drawLine({ start: { x: left + 3.6, y: base + 3.4 }, end: { x: left + 5.4, y: base + 1.4 }, thickness: 1.1, color: INK }); page.drawLine({ start: { x: left + 5.4, y: base + 1.4 }, end: { x: left + 8.6, y: base + 6 }, thickness: 1.1, color: INK }); }
        }
      } });
      gap(next?.indent || (next?.t === 'li' && !(next.depth === 0 && level === 0 && !!next.ordered !== !!b.ordered)) ? 2 : 6, nextDepth);
    } else if (b.t === 'code') {
      const size = 9.2, pad = 6;
      const max = Math.max(8, Math.floor((width - pad * 2) / mono.widthOfTextAtSize('M', size)));
      // Long code lines wrap at the box edge instead of running off the page.
      const rows = b.text.replace(/\t/g, '    ').split('\n').flatMap((line) => { const out = []; const chars = graphemes(line); for (let at = 0; at < Math.max(1, chars.length); at += max) out.push(chars.slice(at, at + max).join('')); return out; });
      const lineHeight = size * 1.4;
      const band = (height) => { page.drawRectangle({ x, y: y - height, width, height, color: SHADE }); if (bars) drawBars(y, y - height); y -= height; };
      // A short block stays in one piece; a long one may run over pages.
      ensure(rows.length <= 30 ? rows.length * lineHeight + pad * 2 : lineHeight * 2 + pad);
      band(pad);
      for (const row of rows) {
        ensure(lineHeight);
        page.drawRectangle({ x, y: y - lineHeight, width, height: lineHeight, color: SHADE });
        paragraph([{ text: row || ' ', code: true }], { size, lead: 1.4, x: x + pad, width: 1e6, block: true });
      }
      if (y - pad >= M) band(pad);
      gap(8, nextDepth);
    } else if (b.t === 'hr') {
      ensure(16);
      page.drawLine({ start: { x, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.6, color: RULE });
      if (bars) drawBars(y, y - 16);
      y -= 16;
    } else if (b.t === 'break') { if (y < TOP) newPage(); }
    else if (b.t === 'img') {
      const image = await embed(b);
      if (!image) { if (b.alt) { paragraph([{ text: '[Picture: ' + b.alt + ']', i: true }], { x, width, color: MUTED }); gap(6, nextDepth); } continue; }
      const scale = Math.min(1, width / (b.width * 0.75), (TOP - M) / (b.height * 0.75));
      const w = b.width * 0.75 * scale, h = b.height * 0.75 * scale;
      ensure(h);
      page.drawImage(image, { x: b.align === 'center' ? x + (width - w) / 2 : x, y: y - h, width: w, height: h });
      if (bars) drawBars(y, y - h);
      y -= h;
      gap(10, nextDepth);
    } else if (b.t === 'table') { ensure(40); table(b, x, width); gap(12, nextDepth); }
    else { paragraph(b.runs, { x, width, align: b.align, color }); gap(7, nextDepth); }
  }
  tracker.trim();
  return pdf.save();
}
