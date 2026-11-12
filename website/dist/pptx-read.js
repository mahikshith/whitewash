// Reads a slide deck into the block list (docs/conversion-model.md) for the
// text formats: each slide becomes a heading, its bullets become real list
// items with their levels, tables stay tables, pictures and speaker notes
// come along. PowerPoint to PDF does not use this: see pptx-render.js.
import { readZip, unpack } from './office-zip.js';
import { tidy, imageBlock } from './conv-doc.js';

const decoder = new TextDecoder();
const kids = (node) => Array.from(node?.childNodes || []).filter((c) => c.nodeType === 1);
const child = (node, name) => kids(node).find((c) => c.localName === name);
const all = (node, name) => kids(node).filter((c) => c.localName === name);
const deep = (node, name, out = []) => { for (const c of kids(node)) { if (c.localName === name) out.push(c); deep(c, name, out); } return out; };
// A relationship id (r:id), which can share its local name with a plain id.
const rattr = (node, name) => { if (!node?.attributes) return undefined; for (const a of Array.from(node.attributes)) if (a.localName === name && (a.namespaceURI || '').endsWith('/relationships')) return a.value; return undefined; };
const attr = (node, name) => { if (!node?.attributes) return undefined; for (const a of Array.from(node.attributes)) if (a.localName === name) return a.value; return undefined; };
const dirOf = (path) => path.slice(0, path.lastIndexOf('/') + 1);
const join = (base, target) => { if (target.startsWith('/')) return target.slice(1); const parts = (dirOf(base) + target).split('/'), out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); } return out.join('/'); };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };

export async function blocksFromPptx(bytes) {
  let entries;
  try { entries = await readZip(bytes, { maxBytes: 60_000_000, maxEntries: 5000, maxExpanded: 200_000_000, maxPart: 60_000_000 }); } catch (error) { if (/too large/.test(error.message)) throw error; throw new Error('This isn’t a readable .pptx file.'); }
  const xml = async (path) => {
    if (!entries.has(path)) return null;
    const text = decoder.decode(await unpack(entries.get(path)));
    if (/<!ENTITY/i.test(text)) throw new Error('This file has an unsupported structure.');
    return new DOMParser().parseFromString(text, 'application/xml');
  };
  const relsOf = async (path) => { const doc = await xml(dirOf(path) + '_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels'); return new Map(deep(doc || { childNodes: [] }, 'Relationship').map((r) => [attr(r, 'Id'), { target: attr(r, 'Target'), type: attr(r, 'Type') || '', external: attr(r, 'TargetMode') === 'External' }])); };
  const presentation = await xml('ppt/presentation.xml');
  if (!presentation) throw new Error('This isn’t a readable .pptx file.');
  const presRels = await relsOf('ppt/presentation.xml');
  const order = deep(presentation, 'sldId').map((s) => presRels.get(rattr(s, 'id'))?.target).filter(Boolean).map((t) => join('ppt/presentation.xml', t));

  const runsOf = (p, rels) => {
    const out = [];
    for (const node of kids(p)) {
      if (node.localName === 'br') { out.push({ text: '\n' }); continue; }
      if (node.localName !== 'r' && node.localName !== 'fld') continue;
      const rPr = child(node, 'rPr'), text = child(node, 't')?.textContent || '';
      if (!text) continue;
      const run = { text };
      if (attr(rPr, 'b') === '1') run.b = true;
      if (attr(rPr, 'i') === '1') run.i = true;
      if (attr(rPr, 'u') && attr(rPr, 'u') !== 'none') run.u = true;
      if (attr(rPr, 'strike') && attr(rPr, 'strike') !== 'noStrike') run.s = true;
      const link = rels.get(rattr(child(rPr, 'hlinkClick'), 'id'));
      if (link?.external && /^(https?:|mailto:)/i.test(link.target)) { run.href = link.target; delete run.u; }
      out.push(run);
    }
    return tidy(out);
  };

  const blocks = [];
  let number = 0, title = '';
  for (const path of order) {
    const slide = await xml(path);
    if (!slide || attr(slide.documentElement, 'show') === '0') continue;
    number++;
    const rels = await relsOf(path);
    const tree = deep(slide, 'spTree')[0];
    // Shapes in reading order: top to bottom, then left to right. Groups are opened up.
    const shapes = [];
    const collect = (holder) => { for (const node of kids(holder)) { if (node.localName === 'grpSp') collect(node); else if (['sp', 'pic', 'graphicFrame'].includes(node.localName)) shapes.push(node); else if (node.localName === 'AlternateContent') collect(child(node, 'Choice') || child(node, 'Fallback') || node); } };
    collect(tree);
    const place = (node) => { const off = deep(node, 'off')[0]; return off ? [Number(attr(off, 'y')) || 0, Number(attr(off, 'x')) || 0] : [Infinity, 0]; };
    const kind = (node) => attr(deep(child(node, 'nvSpPr') || node, 'ph')[0], 'type');
    const isTitle = (node) => ['title', 'ctrTitle'].includes(kind(node));
    shapes.sort((a, b) => (isTitle(b) - isTitle(a)) || (Math.abs(place(a)[0] - place(b)[0]) > 180000 ? place(a)[0] - place(b)[0] : place(a)[1] - place(b)[1]));
    let headed = false;
    const body = [];
    for (const shape of shapes) {
      if (shape.localName === 'pic') {
        const rel = rels.get(attr(deep(shape, 'blip')[0], 'embed'));
        const target = rel && !rel.external ? join(path, rel.target) : null;
        if (target && entries.has(target)) {
          const ext = deep(shape, 'ext')[0];
          const image = await imageBlock(await unpack(entries.get(target)), MIME[target.split('.').pop().toLowerCase()] || '', { width: ext ? Number(attr(ext, 'cx')) / 9525 : undefined, height: ext ? Number(attr(ext, 'cy')) / 9525 : undefined, alt: attr(deep(shape, 'cNvPr')[0], 'descr') || '' });
          if (image) body.push(image);
        }
        continue;
      }
      if (shape.localName === 'graphicFrame') {
        const tbl = deep(shape, 'tbl')[0];
        if (!tbl) continue;
        const rows = all(tbl, 'tr').map((tr) => all(tr, 'tc').map((tc) => {
          if (attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1') { const filler = []; if (attr(tc, 'hMerge') === '1') filler.merged = true; return filler; }
          const cell = tidy(all(child(tc, 'txBody'), 'p').flatMap((p, i) => [...(i ? [{ text: '\n' }] : []), ...runsOf(p, rels)]));
          const span = Number(attr(tc, 'gridSpan') || 1); if (span > 1) cell.span = span;
          return cell;
        })).filter((row) => row.length);
        if (rows.length) body.push({ t: 'table', rows });
        continue;
      }
      const type = kind(shape);
      if (['sldNum', 'dt', 'ftr', 'hdr'].includes(type)) continue;
      const paragraphs = all(child(shape, 'txBody'), 'p');
      const placeholder = !!deep(child(shape, 'nvSpPr') || shape, 'ph')[0];
      const listy = placeholder && !['title', 'ctrTitle', 'subTitle'].includes(type) && paragraphs.filter((p) => runsOf(p, rels).length).length > 1;
      const counters = [];
      for (const p of paragraphs) {
        const runs = runsOf(p, rels);
        if (!runs.length) continue;
        const pPr = child(p, 'pPr'), level = Number(attr(pPr, 'lvl') || 0);
        if (isTitle(shape) && !headed) { body.unshift({ t: 'h', level: number === 1 && type === 'ctrTitle' ? 1 : 2, runs }); headed = true; if (!title) title = runs.map((r) => r.text).join(''); continue; }
        const numbered = !!child(pPr, 'buAutoNum'), bullet = numbered || !!child(pPr, 'buChar') || (listy && !child(pPr, 'buNone'));
        if (bullet) { counters[level] = (counters[level] || 0) + 1; counters.length = level + 1; body.push({ t: 'li', ordered: numbered, depth: Math.min(level, 8), n: counters[level], runs }); }
        else body.push({ t: 'p', runs, ...(attr(pPr, 'algn') === 'ctr' && !placeholder ? { align: 'center' } : {}) });
      }
    }
    if (!headed) body.unshift({ t: 'h', level: 2, runs: [{ text: 'Slide ' + number }] });
    // Speaker notes sit in their own part, linked from the slide.
    const notesRel = [...rels.values()].find((r) => r.type.endsWith('/notesSlide'));
    const notes = notesRel ? await xml(join(path, notesRel.target)) : null;
    if (notes) for (const shape of deep(notes, 'sp')) if (kind(shape) === 'body') for (const p of all(child(shape, 'txBody'), 'p')) { const runs = runsOf(p, new Map()); if (runs.length) body.push({ t: 'quote', runs }); }
    blocks.push(...body);
  }
  if (!number) throw new Error('This deck has no slides to read.');
  return { title, blocks };
}
