// The document engine. Every input becomes a small block list (headings,
// paragraphs, lists, code, quotes, tables), and every output is written from
// that list. This keeps text, headings, emphasis, links, lists and tables.
// It does not keep page layout, fonts, colours or images.
import { readZip, unpack, deflateEntry, writeZip } from './office-zip.js';
const BIG = { maxBytes: 60_000_000, maxEntries: 5000 };

const encoder = new TextEncoder(), decoder = new TextDecoder();
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const plain = (runs) => runs.map((r) => r.text).join('');

// ---------- Reading ----------

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'BODY', 'CENTER', 'DL', 'DD', 'DT', 'ADDRESS', 'DETAILS', 'SUMMARY']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'SVG', 'IFRAME', 'OBJECT', 'BUTTON', 'SELECT', 'TEXTAREA', 'INPUT']);

function inline(node, style = {}, runs = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const text = style.code ? child.nodeValue : child.nodeValue.replace(/\s+/g, ' ');
      if (text) runs.push({ text, ...style });
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toUpperCase();
      if (SKIP.has(tag) || tag === 'UL' || tag === 'OL' || tag === 'TABLE') continue;
      if (tag === 'BR') { runs.push({ text: '\n', ...style }); continue; }
      if (tag === 'IMG') { const alt = child.getAttribute('alt'); if (alt) runs.push({ text: '[' + alt + ']', ...style }); continue; }
      const next = { ...style };
      if (tag === 'B' || tag === 'STRONG') next.b = true;
      if (tag === 'I' || tag === 'EM' || tag === 'CITE') next.i = true;
      if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') next.code = true;
      if (tag === 'A' && /^(https?:|mailto:)/i.test(child.getAttribute('href') || '')) next.href = child.getAttribute('href');
      inline(child, next, runs);
    }
  }
  return runs;
}

function tidy(runs) {
  const out = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && last.b === run.b && last.i === run.i && last.code === run.code && last.href === run.href) last.text += run.text;
    else out.push({ ...run });
  }
  if (out.length) { out[0].text = out[0].text.replace(/^[ \n]+/, ''); out[out.length - 1].text = out[out.length - 1].text.replace(/[ \n]+$/, ''); }
  for (let i = 1; i < out.length; i++) if (out[i - 1].text.endsWith(' ') && out[i].text.startsWith(' ')) out[i].text = out[i].text.slice(1);
  return out.filter((r) => r.text);
}

function walk(node, out, context = {}) {
  let pending = [];
  const flush = () => { const runs = tidy(pending); pending = []; if (runs.length) out.push(context.quote ? { t: 'quote', runs } : { t: 'p', runs }); };
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { if (child.nodeValue.trim()) pending.push(...inline({ childNodes: [child] })); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toUpperCase();
    if (SKIP.has(tag)) continue;
    if (/^H[1-6]$/.test(tag)) { flush(); const runs = tidy(inline(child)); if (runs.length) out.push({ t: 'h', level: Number(tag[1]), runs }); }
    else if (tag === 'UL' || tag === 'OL') { flush(); list(child, out, tag === 'OL', context.depth || 0); }
    else if (tag === 'PRE') { flush(); out.push({ t: 'code', text: child.textContent.replace(/\n$/, '') }); }
    else if (tag === 'BLOCKQUOTE') { flush(); walk(child, out, { ...context, quote: true }); }
    else if (tag === 'HR') { flush(); out.push({ t: 'hr' }); }
    else if (tag === 'TABLE') { flush(); const rows = Array.from(child.querySelectorAll('tr')).map((tr) => Array.from(tr.children).filter((c) => /^T[HD]$/i.test(c.tagName)).map((cell) => tidy(inline(cell)))); if (rows.length) out.push({ t: 'table', rows }); }
    else if (BLOCK.has(tag) || tag === 'LI') {
      flush();
      const hasBlocks = Array.from(child.children).some((c) => BLOCK.has(c.tagName.toUpperCase()) || /^(H[1-6]|UL|OL|PRE|TABLE|BLOCKQUOTE|HR)$/i.test(c.tagName));
      if (hasBlocks) walk(child, out, context);
      else { const runs = tidy(inline(child)); if (runs.length) out.push(context.quote ? { t: 'quote', runs } : { t: 'p', runs }); }
    } else pending.push(...inline({ childNodes: [child] }));
  }
  flush();
  return out;
}

function list(node, out, ordered, depth) {
  let n = Number(node.getAttribute?.('start') || 1);
  for (const item of Array.from(node.children).filter((c) => c.tagName.toUpperCase() === 'LI')) {
    const runs = tidy(inline(item));
    out.push({ t: 'li', ordered, depth, n: n++, runs });
    for (const nested of Array.from(item.children).filter((c) => /^(UL|OL)$/i.test(c.tagName))) list(nested, out, nested.tagName.toUpperCase() === 'OL', depth + 1);
  }
}

// Style sheets and style attributes are dropped before parsing: the converter
// never uses them, and the page's security policy would only log warnings.
export const inertHtml = (html) => new DOMParser().parseFromString(String(html).replace(/<style\b[\s\S]*?<\/style\s*>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''), 'text/html');

export function blocksFromHtml(html) {
  const doc = inertHtml(html);
  const blocks = walk(doc.body, []);
  return { title: doc.title?.trim() || firstHeading(blocks), blocks };
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
    blocks.push({ t: 'table', rows: sheet.rows.map((row) => row.map((v) => v ? [{ text: String(v) }] : [])) });
  }
  return { title: '', blocks };
}

const xmlDoc = (bytes) => {
  const text = decoder.decode(bytes);
  if (/<!ENTITY/i.test(text)) throw new Error('This file has an unsupported structure.');
  return new DOMParser().parseFromString(text, 'application/xml');
};
const byLocal = (node, name) => Array.from(node.getElementsByTagName('*')).filter((n) => n.localName === name);

export async function htmlFromEpub(bytes) {
  const entries = await readZip(bytes, BIG);
  const read = async (name) => { const e = entries.get(name); if (!e) throw new Error('This EPUB is missing ' + name + '.'); return unpack(e); };
  const container = xmlDoc(await read('META-INF/container.xml'));
  const opfPath = byLocal(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB has no table of contents.');
  const opf = xmlDoc(await read(opfPath));
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const items = new Map(byLocal(opf, 'item').map((i) => [i.getAttribute('id'), i.getAttribute('href')]));
  const title = byLocal(opf, 'title')[0]?.textContent || '';
  let html = '';
  for (const ref of byLocal(opf, 'itemref')) {
    const href = items.get(ref.getAttribute('idref'));
    if (!href) continue;
    const path = decodeURIComponent(new URL(href, 'file:///' + dir).pathname.slice(1));
    if (!entries.has(path)) continue;
    const chapter = decoder.decode(await unpack(entries.get(path)));
    html += (chapter.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || chapter);
  }
  return '<title>' + esc(title) + '</title>' + html;
}

export async function htmlFromPptx(bytes) {
  const entries = await readZip(bytes, BIG);
  const presentation = entries.get('ppt/presentation.xml');
  if (!presentation) throw new Error('This isn’t a readable .pptx file.');
  const rels = xmlDoc(await unpack(entries.get('ppt/_rels/presentation.xml.rels')));
  const targets = new Map(byLocal(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const order = byLocal(xmlDoc(await unpack(presentation)), 'sldId').map((s) => targets.get(Array.from(s.attributes).find((a) => a.localName === 'id' && a.prefix === 'r')?.value));
  let html = '', number = 1;
  for (const target of order) {
    const path = 'ppt/' + String(target || '').replace(/^\//, '').replace(/^\.\.\//, '');
    if (!entries.has(path)) continue;
    const slide = xmlDoc(await unpack(entries.get(path)));
    const paragraphs = byLocal(slide, 'p').filter((p) => p.namespaceURI?.includes('drawingml')).map((p) => byLocal(p, 't').map((t) => t.textContent).join('')).filter((t) => t.trim());
    html += '<h2>Slide ' + number++ + '</h2>' + paragraphs.map((p, i) => i === 0 ? '<p><strong>' + esc(p) + '</strong></p>' : '<p>' + esc(p) + '</p>').join('');
  }
  return html;
}

export async function htmlFromOdt(bytes) {
  const entries = await readZip(bytes, BIG);
  if (!entries.has('content.xml')) throw new Error('This isn’t a readable .odt file.');
  const doc = xmlDoc(await unpack(entries.get('content.xml')));
  const body = byLocal(doc, 'text')[0];
  if (!body) return '';
  const text = (node) => Array.from(node.childNodes).map((c) => c.nodeType === 3 ? esc(c.nodeValue) : c.localName === 's' ? ' '.repeat(Number(c.getAttribute('text:c') || 1)) : c.localName === 'tab' ? '\t' : c.localName === 'line-break' ? '<br>' : c.nodeType === 1 ? text(c) : '').join('');
  const convert = (node) => Array.from(node.childNodes).filter((c) => c.nodeType === 1).map((c) => {
    if (c.localName === 'h') { const level = Math.min(6, Number(c.getAttribute('text:outline-level') || 1)); return '<h' + level + '>' + text(c) + '</h' + level + '>'; }
    if (c.localName === 'p') return '<p>' + text(c) + '</p>';
    if (c.localName === 'list') return '<ul>' + byLocal(c, 'list-item').filter((li) => li.parentNode === c).map((li) => '<li>' + Array.from(li.childNodes).filter((n) => n.nodeType === 1).map((n) => n.localName === 'list' ? convert({ childNodes: [n] }) : text(n)).join('') + '</li>').join('') + '</ul>';
    if (c.localName === 'table') return '<table>' + byLocal(c, 'table-row').map((r) => '<tr>' + byLocal(r, 'table-cell').map((cell) => '<td>' + text(cell) + '</td>').join('') + '</tr>').join('') + '</table>';
    if (c.localName === 'section') return convert(c);
    return '';
  }).join('');
  return convert(body);
}

// PDF text with simple layout heuristics: lines grouped by position, paragraphs
// split on larger gaps, bigger text treated as headings.
export function blocksFromPdfText(pages) {
  const blocks = [];
  const sizes = pages.flatMap((p) => p.items.map((i) => Math.round(i.size))).filter(Boolean).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 10;
  for (const page of pages) {
    const lines = [];
    for (const item of page.items) {
      if (!item.str) continue;
      const line = lines.find((l) => Math.abs(l.y - item.y) < Math.max(2, item.size * 0.35));
      if (line) line.items.push(item); else lines.push({ y: item.y, items: [item] });
    }
    lines.sort((a, b) => b.y - a.y);
    let paragraph = null, lastY = null, lastSize = body;
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      let text = '';
      for (const [i, item] of line.items.entries()) {
        const prev = line.items[i - 1];
        if (prev && item.x - (prev.x + prev.width) > item.size * 0.2 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' ';
        text += item.str;
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const size = Math.max(...line.items.map((i) => i.size));
      const heading = size > body * 1.25 && text.length < 140;
      const gap = lastY === null ? 0 : lastY - line.y;
      if (heading) {
        blocks.push({ t: 'h', level: size > body * 1.8 ? 1 : size > body * 1.45 ? 2 : 3, runs: [{ text }] });
        paragraph = null;
      } else if (!paragraph || gap > Math.max(size, lastSize) * 1.75) {
        paragraph = { t: 'p', runs: [{ text }] }; blocks.push(paragraph);
      } else {
        const prev = paragraph.runs[0].text;
        paragraph.runs[0].text = prev.endsWith('-') && /^[a-z]/.test(text) ? prev.slice(0, -1) + text : prev + ' ' + text;
      }
      lastY = line.y; lastSize = size;
    }
    paragraph = null;
  }
  // Merge headings that wrapped onto two lines.
  const merged = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last?.t === 'h' && block.t === 'h' && last.level === block.level && plain(last.runs).length + plain(block.runs).length < 140) last.runs[0].text += ' ' + plain(block.runs);
    else merged.push(block);
  }
  return { title: firstHeading(merged), blocks: merged };
}

// ---------- Writing ----------

export function toText({ blocks }) {
  let out = '';
  blocks.forEach((b, i) => {
    let text;
    if (b.t === 'li') text = '  '.repeat(b.depth) + (b.ordered ? b.n + '. ' : '• ') + plain(b.runs);
    else if (b.t === 'code') text = b.text;
    else if (b.t === 'quote') text = '  ' + plain(b.runs);
    else if (b.t === 'hr') text = '----';
    else if (b.t === 'table') text = b.rows.map((row) => row.map(plain).join('\t')).join('\n');
    else text = plain(b.runs);
    if (i) out += b.t === 'li' && blocks[i - 1].t === 'li' ? '\n' : '\n\n';
    out += text;
  });
  return out.replace(/\n{3,}/g, '\n\n') + '\n';
}

function mdRuns(runs) {
  return runs.map((r) => {
    if (r.code) return '`' + r.text.replace(/`/g, 'ˋ') + '`';
    let text = r.text.replace(/([\\*_`[\]])/g, '\\$1').replace(/\n/g, '  \n');
    const pad = text.match(/^\s*/)[0], end = text.match(/\s*$/)[0];
    let core = text.trim();
    if (!core) return text;
    if (r.b) core = '**' + core + '**';
    if (r.i) core = '*' + core + '*';
    if (r.href) core = '[' + core + '](' + r.href.replace(/\)/g, '%29') + ')';
    return pad + core + end;
  }).join('');
}

export function toMarkdown({ blocks }) {
  const out = [];
  for (const [i, b] of blocks.entries()) {
    const prev = blocks[i - 1];
    const tight = b.t === 'li' && prev?.t === 'li';
    let text;
    if (b.t === 'h') text = '#'.repeat(b.level) + ' ' + mdRuns(b.runs);
    else if (b.t === 'li') text = '   '.repeat(b.depth) + (b.ordered ? b.n + '. ' : '- ') + mdRuns(b.runs);
    else if (b.t === 'code') text = '```\n' + b.text + '\n```';
    else if (b.t === 'quote') text = '> ' + mdRuns(b.runs);
    else if (b.t === 'hr') text = '---';
    else if (b.t === 'table') {
      const width = Math.max(1, ...b.rows.map((r) => r.length));
      const row = (r) => '| ' + Array.from({ length: width }, (_, k) => mdRuns(r[k] || []).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |';
      text = [row(b.rows[0] || []), '|' + ' --- |'.repeat(width), ...b.rows.slice(1).map(row)].join('\n');
    } else text = mdRuns(b.runs);
    out.push((tight ? '\n' : out.length ? '\n\n' : '') + text);
  }
  return out.join('') + '\n';
}

function htmlRuns(runs) {
  return runs.map((r) => {
    let text = esc(r.text).replace(/\n/g, '<br>');
    if (r.code) text = '<code>' + text + '</code>';
    if (r.b) text = '<strong>' + text + '</strong>';
    if (r.i) text = '<em>' + text + '</em>';
    if (r.href) text = '<a href="' + esc(r.href) + '">' + text + '</a>';
    return text;
  }).join('');
}

export function toHtmlBody({ blocks }) {
  let html = '', stack = [];
  const close = (depth) => { while (stack.length > depth) html += '</li></' + stack.pop() + '>'; };
  for (const b of blocks) {
    if (b.t !== 'li') close(0);
    if (b.t === 'h') html += '<h' + b.level + '>' + htmlRuns(b.runs) + '</h' + b.level + '>\n';
    else if (b.t === 'li') {
      const tag = b.ordered ? 'ol' : 'ul';
      if (stack.length > b.depth + 1) close(b.depth + 1);
      if (stack.length === b.depth + 1) html += '</li>';
      while (stack.length < b.depth + 1) { html += '<' + tag + '>'; stack.push(tag); }
      html += '<li>' + htmlRuns(b.runs);
    } else if (b.t === 'code') html += '<pre><code>' + esc(b.text) + '</code></pre>\n';
    else if (b.t === 'quote') html += '<blockquote><p>' + htmlRuns(b.runs) + '</p></blockquote>\n';
    else if (b.t === 'hr') html += '<hr>\n';
    else if (b.t === 'table') html += '<table>' + b.rows.map((row, r) => '<tr>' + row.map((cell) => r === 0 ? '<th>' + htmlRuns(cell) + '</th>' : '<td>' + htmlRuns(cell) + '</td>').join('') + '</tr>').join('') + '</table>\n';
    else html += '<p>' + htmlRuns(b.runs) + '</p>\n';
  }
  close(0);
  return html;
}

export function toHtml(doc) {
  return '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(doc.title || 'Document') + '</title>'
    + '<style>body{font:16px/1.65 system-ui,sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#1b1b1f}pre{background:#f3f3f3;padding:1em;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.35em .6em;text-align:left}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:1em;color:#555}</style>'
    + '</head><body>\n' + toHtmlBody(doc) + '</body></html>\n';
}

async function zip(files) {
  const entries = new Map();
  for (const [name, content] of files) await deflateEntry(entries, name, typeof content === 'string' ? encoder.encode(content) : content);
  return writeZip(entries);
}

export async function toDocx(doc) {
  const links = [];
  const run = (r, extra = '') => {
    const props = (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '') + (r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '') + (r.href ? '<w:rStyle w:val="Hyperlink"/>' : '') + extra;
    const parts = r.text.split('\n').map((t) => '<w:t xml:space="preserve">' + esc(t) + '</w:t>').join('<w:br/>');
    const xml = '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '') + parts + '</w:r>';
    if (!r.href) return xml;
    links.push(r.href);
    return '<w:hyperlink r:id="rIdLink' + links.length + '">' + xml + '</w:hyperlink>';
  };
  const para = (style, runs, extra = '') => '<w:p><w:pPr>' + (style ? '<w:pStyle w:val="' + style + '"/>' : '') + extra + '</w:pPr>' + runs.map((r) => run(r)).join('') + '</w:p>';
  const body = doc.blocks.map((b) => {
    if (b.t === 'h') return para('Heading' + Math.min(b.level, 6), b.runs);
    if (b.t === 'li') return para('ListParagraph', [{ text: (b.ordered ? b.n + '.\t' : '•\t') }, ...b.runs], '<w:ind w:left="' + (360 + b.depth * 360) + '" w:hanging="360"/>');
    if (b.t === 'code') return b.text.split('\n').map((line) => para('Code', [{ text: line }])).join('');
    if (b.t === 'quote') return para('Quote', b.runs);
    if (b.t === 'hr') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="AAAAAA"/></w:pBdr></w:pPr></w:p>';
    if (b.t === 'table') {
      const width = Math.max(1, ...b.rows.map((r) => r.length));
      return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>' + '<w:gridCol/>'.repeat(width) + '</w:tblGrid>'
        + b.rows.map((row, r) => '<w:tr>' + Array.from({ length: width }, (_, c) => '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>' + (row[c] || []).map((x) => run(r === 0 ? { ...x, b: true } : x)).join('') + '</w:p></w:tc>').join('') + '</w:tr>').join('') + '</w:tbl>';
    }
    return para('', b.runs);
  }).join('');
  const heading = (n, size) => '<w:style w:type="paragraph" w:styleId="Heading' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="' + (n - 1) + '"/></w:pPr><w:rPr><w:b/><w:sz w:val="' + size + '"/></w:rPr></w:style>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + [[1, 36], [2, 30], [3, 26], [4, 24], [5, 22], [6, 22]].map(([n, s]) => heading(n, s)).join('')
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>'
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
    + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BBBBBB"/><w:left w:val="single" w:sz="4" w:color="BBBBBB"/><w:bottom w:val="single" w:sz="4" w:color="BBBBBB"/><w:right w:val="single" w:sz="4" w:color="BBBBBB"/><w:insideH w:val="single" w:sz="4" w:color="BBBBBB"/><w:insideV w:val="single" w:sz="4" w:color="BBBBBB"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '</w:styles>';
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + (body || '<w:p/>') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>'],
    ['word/styles.xml', styles],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + links.map((href, i) => '<Relationship Id="rIdLink' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + esc(href) + '" TargetMode="External"/>').join('') + '</Relationships>'],
  ]);
}

export async function toOdt(doc) {
  const span = (r) => { const text = esc(r.text).replace(/\n/g, '<text:line-break/>'); const style = r.b && r.i ? 'BI' : r.b ? 'B' : r.i ? 'I' : r.code ? 'C' : ''; const inner = style ? '<text:span text:style-name="' + style + '">' + text + '</text:span>' : text; return r.href ? '<text:a xlink:type="simple" xlink:href="' + esc(r.href) + '">' + inner + '</text:a>' : inner; };
  const runs = (list) => list.map(span).join('');
  const body = doc.blocks.map((b) => {
    if (b.t === 'h') return '<text:h text:outline-level="' + b.level + '">' + runs(b.runs) + '</text:h>';
    if (b.t === 'li') return '<text:p text:style-name="List' + Math.min(b.depth, 3) + '">' + (b.ordered ? b.n + '. ' : '• ') + runs(b.runs) + '</text:p>';
    if (b.t === 'code') return b.text.split('\n').map((l) => '<text:p text:style-name="Code">' + esc(l).replace(/ {2}/g, ' <text:s/>') + '</text:p>').join('');
    if (b.t === 'quote') return '<text:p text:style-name="Quote">' + runs(b.runs) + '</text:p>';
    if (b.t === 'hr') return '<text:p>────────</text:p>';
    if (b.t === 'table') { const width = Math.max(1, ...b.rows.map((r) => r.length)); return '<table:table><table:table-column table:number-columns-repeated="' + width + '"/>' + b.rows.map((row) => '<table:table-row>' + Array.from({ length: width }, (_, c) => '<table:table-cell office:value-type="string"><text:p>' + runs(row[c] || []) + '</text:p></table:table-cell>').join('') + '</table:table-row>').join('') + '</table:table>'; }
    return '<text:p>' + runs(b.runs) + '</text:p>';
  }).join('');
  const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"';
  const styles = '<office:automatic-styles><style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style><style:style style:name="I" style:family="text"><style:text-properties fo:font-style="italic"/></style:style><style:style style:name="BI" style:family="text"><style:text-properties fo:font-weight="bold" fo:font-style="italic"/></style:style><style:style style:name="C" style:family="text"><style:text-properties style:font-name="Courier New" fo:font-family="monospace"/></style:style>'
    + '<style:style style:name="Code" style:family="paragraph"><style:text-properties fo:font-family="monospace"/></style:style><style:style style:name="Quote" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.5in"/><style:text-properties fo:font-style="italic"/></style:style>'
    + [0, 1, 2, 3].map((d) => '<style:style style:name="List' + d + '" style:family="paragraph"><style:paragraph-properties fo:margin-left="' + (0.25 + d * 0.25) + 'in"/></style:style>').join('') + '</office:automatic-styles>';
  return zip([
    ['mimetype', 'application/vnd.oasis.opendocument.text'],
    ['META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'],
    ['content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content ' + ns + ' office:version="1.2">' + styles + '<office:body><office:text>' + body + '</office:text></office:body></office:document-content>'],
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
  const runs = (list) => list.map((r) => '{' + (r.b ? '\\b ' : '') + (r.i ? '\\i ' : '') + (r.code ? '\\f1 ' : '') + (r.href ? '\\ul ' : '') + enc(r.text) + '}').join('');
  const size = { 1: 40, 2: 32, 3: 28, 4: 24, 5: 22, 6: 22 };
  const body = doc.blocks.map((b) => {
    if (b.t === 'h') return '{\\pard\\sb240\\sa80\\b\\fs' + size[b.level] + ' ' + runs(b.runs) + '\\par}';
    if (b.t === 'li') return '{\\pard\\li' + (360 + b.depth * 360) + '\\fi-360\\sa60 ' + enc(b.ordered ? b.n + '.\t' : '•\t') + runs(b.runs) + '\\par}';
    if (b.t === 'code') return '{\\pard\\f1\\fs20 ' + enc(b.text) + '\\par}';
    if (b.t === 'quote') return '{\\pard\\li720\\i ' + runs(b.runs) + '\\par}';
    if (b.t === 'hr') return '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}';
    if (b.t === 'table') return b.rows.map((row) => '{\\pard ' + row.map((c) => runs(c)).join('\\tab ') + '\\par}').join('');
    return '{\\pard\\sa160 ' + runs(b.runs) + '\\par}';
  }).join('\n');
  return '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1\\fmodern Consolas;}}\\fs22\n' + body + '\n}';
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
  const page = (heading, body) => '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>' + esc(heading) + '</title></head><body>' + body + '</body></html>';
  const xhtml = (blocks) => toHtmlBody({ blocks }).replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>');
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['OEBPS/content.opf', '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">' + esc(id) + '</dc:identifier><dc:title>' + esc(title) + '</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2000-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
      + chapters.map((_, i) => '<item id="c' + i + '" href="c' + i + '.xhtml" media-type="application/xhtml+xml"/>').join('') + '</manifest><spine>' + chapters.map((_, i) => '<itemref idref="c' + i + '"/>').join('') + '</spine></package>'],
    ['OEBPS/nav.xhtml', page('Contents', '<nav epub:type="toc"><h1>Contents</h1><ol>' + chapters.map((c, i) => '<li><a href="c' + i + '.xhtml">' + esc(c.title) + '</a></li>').join('') + '</ol></nav>')],
    ...chapters.map((c, i) => ['OEBPS/c' + i + '.xhtml', page(c.title, xhtml(c.blocks))]),
  ]);
}

// PDF output with real, selectable text. Needs pdf-lib, fontkit and the Noto
// fonts, loaded on first use. Covers Latin, Greek and Cyrillic scripts.
export async function toPdf(doc, libs) {
  const { PDFDocument, rgb } = await libs.pdfLib();
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(await libs.fontkit());
  const [regular, bold, mono] = await Promise.all(['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf', 'NotoSansMono-Regular.ttf'].map(async (name) => pdf.embedFont(await libs.fontBytes(name), { subset: true })));
  if (doc.title) pdf.setTitle(doc.title);
  const W = 595.28, H = 841.89, M = 56, maxWidth = W - M * 2;
  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  newPage();
  const ensure = (height) => { if (y - height < M) newPage(); };
  // Noto Sans has no Chinese, Japanese, Korean or emoji glyphs. fontkit draws a
  // blank box for a missing glyph, so swap those characters for "?" instead
  // of letting them vanish from the page.
  const charsets = new Map();
  const supported = (font, text) => {
    if (!charsets.has(font)) charsets.set(font, new Set(font.getCharacterSet()));
    const set = charsets.get(font);
    return Array.from(text).map((ch) => set.has(ch.codePointAt(0)) || /\s/.test(ch) ? ch : /[\u200b-\u200d\ufe0e\ufe0f]/.test(ch) ? '' : '?').join('');
  };
  const fontFor = (r) => r.code ? mono : r.b ? bold : regular;

  function paragraph(runs, { size = 11, indent = 0, lead = 1.45, color = rgb(0.1, 0.1, 0.12), boldAll = false, prefix = '' } = {}) {
    const words = [];
    if (prefix) words.push({ text: prefix, font: regular, prefix: true });
    for (const r of runs) for (const [i, part] of r.text.split('\n').entries()) {
      if (i > 0) words.push({ br: true });
      for (const piece of part.split(/(\s+)/)) if (piece) words.push({ text: piece, font: boldAll ? bold : fontFor(r), space: /^\s+$/.test(piece), link: r.href });
    }
    const lineHeight = size * lead;
    let line = [], width = 0;
    const startX = M + indent;
    const flush = () => {
      ensure(lineHeight);
      let x = startX + (line[0]?.prefix ? 0 : prefix ? regular.widthOfTextAtSize(prefix, size) : 0);
      while (line.length && line[line.length - 1].space) line.pop();
      for (const word of line) {
        const text = supported(word.font, word.text);
        page.drawText(text, { x, y: y - size, size, font: word.font, color: word.link ? rgb(0.02, 0.35, 0.75) : color });
        x += word.font.widthOfTextAtSize(text, size);
      }
      y -= lineHeight; line = []; width = 0;
    };
    const available = maxWidth - indent - (prefix ? regular.widthOfTextAtSize(prefix, size) : 0);
    for (const word of words) {
      if (word.br) { flush(); continue; }
      if (word.space && !line.length) continue;
      const text = supported(word.font, word.text);
      let w = word.font.widthOfTextAtSize(text, size);
      if (width + w > available && line.length && !word.space) flush();
      if (word.space && !line.length) continue;
      // Break words longer than a whole line.
      if (w > available) { for (const ch of Array.from(text)) { const cw = word.font.widthOfTextAtSize(ch, size); if (width + cw > available) flush(); line.push({ ...word, text: ch }); width += cw; } continue; }
      line.push(word); width += w;
    }
    if (line.length) flush();
  }

  for (const b of doc.blocks) {
    if (b.t === 'h') { const size = [0, 22, 18, 15, 13, 12, 11][b.level]; y -= size * 0.6; ensure(size * 3); paragraph(b.runs, { size, lead: 1.25, boldAll: true }); y -= 4; }
    else if (b.t === 'li') { paragraph(b.runs, { indent: 14 + b.depth * 16, prefix: b.ordered ? b.n + '. ' : '•  ' }); y -= 2; }
    else if (b.t === 'code') { y -= 2; for (const line of b.text.split('\n')) paragraph([{ text: line || ' ', code: true }], { size: 9.5, lead: 1.35, indent: 8 }); y -= 8; }
    else if (b.t === 'quote') { paragraph(b.runs, { indent: 18, color: rgb(0.35, 0.35, 0.38) }); y -= 6; }
    else if (b.t === 'hr') { ensure(16); page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.6, color: rgb(0.75, 0.75, 0.75) }); y -= 16; }
    else if (b.t === 'table') {
      const width = Math.max(1, ...b.rows.map((r) => r.length));
      const colWidth = maxWidth / width, size = width > 6 ? 7.5 : 9;
      for (const [r, row] of b.rows.entries()) {
        const cells = Array.from({ length: width }, (_, c) => supported(r === 0 ? bold : regular, plain(row[c] || [])).replace(/\s+/g, ' '));
        const font = r === 0 ? bold : regular;
        const wrapped = cells.map((text) => { const lines = []; let cur = ''; for (const word of text.split(' ')) { const next = cur ? cur + ' ' + word : word; if (font.widthOfTextAtSize(next, size) > colWidth - 8 && cur) { lines.push(cur); cur = word; } else cur = next; } lines.push(cur); return lines.slice(0, 12); });
        const height = Math.max(...wrapped.map((l) => l.length)) * size * 1.3 + 6;
        ensure(height);
        wrapped.forEach((lines, c) => {
          const x = M + c * colWidth;
          page.drawRectangle({ x, y: y - height, width: colWidth, height, borderColor: rgb(0.78, 0.78, 0.78), borderWidth: 0.5, color: r === 0 ? rgb(0.95, 0.95, 0.95) : undefined });
          lines.forEach((text, k) => { let t = text; while (t && font.widthOfTextAtSize(t, size) > colWidth - 8) t = t.slice(0, -1); page.drawText(t, { x: x + 4, y: y - 4 - size - k * size * 1.3, size, font, color: rgb(0.1, 0.1, 0.12) }); });
        });
        y -= height;
      }
      y -= 10;
    } else { paragraph(b.runs); y -= 6; }
  }
  return pdf.save();
}
