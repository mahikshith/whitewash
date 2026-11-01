// Search across every tool and every conversion route. "pdf to word",
// "mp3", "merge" and "wipe location" all find something useful.
import { tools, groups } from './tools.js';
import { FORMATS, targets } from './convert.js';

// Words people type for a format, beyond its id and label.
const WORDS = {
  docx: ['word', 'doc', 'docx'], pptx: ['powerpoint', 'ppt', 'slides', 'pptx'], xlsx: ['excel', 'xls', 'xlsx', 'spreadsheet'],
  jpg: ['jpg', 'jpeg'], md: ['markdown', 'md'], txt: ['text', 'txt'], html: ['html', 'web page', 'webpage', 'htm'],
  tgz: ['tar.gz', 'tgz'], tbz2: ['tar.bz2', 'tbz2'], txz: ['tar.xz', 'txz'], epub: ['epub', 'ebook', 'e-book'],
  srt: ['srt', 'subtitles'], vtt: ['vtt', 'webvtt'], m4a: ['m4a', 'aac', 'apple audio'], mp4: ['mp4', 'video'],
  ogg: ['ogg'], opus: ['opus'], tiff: ['tiff', 'tif'], ico: ['ico', 'icon', 'favicon'], '7z': ['7z', '7zip', '7-zip'],
};
const words = (id) => WORDS[id] || [id, FORMATS[id].label.toLowerCase()];

export function formatFromWords(text) {
  const t = text.trim().toLowerCase().replace(/^\./, '');
  if (!t) return null;
  return Object.keys(FORMATS).find((id) => words(id).includes(t)) || null;
}

const STOP = new Set(['to', 'into', '2', 'a', 'an', 'the', 'my', 'file', 'files', 'convert', 'from', 'of', '->', '→']);
const normal = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Returns up to `limit` results: { kind: 'tool', tool } or { kind: 'route', from, to }.
export function searchAll(query, limit = 12) {
  let q = normal(query).trim();
  if (!q) return [];
  q = q.replace(/\s+(to|into|2)$/, '').replace(/^(convert|change|turn|make|save)\s+/, '');
  const results = [];
  // "x to y", "x 2 y", "x → y", "x into y"
  const pair = q.match(/^(.+?)\s*(?:\bto\b|\binto\b|→|->|\b2\b)\s*(.+)$/);
  if (pair) {
    const from = formatFromWords(pair[1]), to = formatFromWords(pair[2]);
    if (from && to && targets(from).includes(to)) results.push({ kind: 'route', from, to });
    else if (from && !to) for (const t of targets(from)) if (words(t).some((w) => w.startsWith(pair[2].trim()))) results.push({ kind: 'route', from, to: t });
  } else {
    const single = formatFromWords(q);
    if (single) for (const t of targets(single).slice(0, 6)) results.push({ kind: 'route', from: single, to: t });
  }
  const terms = q.split(/\s+/).filter((t) => t && !STOP.has(t));
  const scored = tools.filter((tool) => tool.state === 'ready').map((tool) => {
    const title = normal(tool.title + ' ' + (tool.tags || '')), body = normal(tool.description + ' ' + (groups.find((g) => g.id === tool.group)?.title || ''));
    let score = 0;
    for (const term of terms) {
      if (title.split(/\W+/).some((w) => w.startsWith(term))) score += 3;
      else if (body.includes(term)) score += 1;
      else return { tool, score: 0 };
    }
    return { tool, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  // A tool whose name or tags match ("zip", "compress pdf") leads; plain
  // format suggestions ("mp3 → wav") follow.
  const strong = scored.filter((r) => r.score >= 3 * terms.length);
  if (!pair) results.unshift(...strong.map(({ tool }) => ({ kind: 'tool', tool })));
  for (const { tool } of scored) results.push({ kind: 'tool', tool });
  // A route that has its own tool page shows as that tool, not twice.
  const covered = (r) => r.kind === 'route' && tools.some((t) => t.state === 'ready' && [].concat(t.from).includes(r.from) && t.to === r.to);
  const out = [];
  for (const r of results) {
    if (covered(r)) { const tool = tools.find((t) => [].concat(t.from).includes(r.from) && t.to === r.to); if (!out.some((o) => o.tool === tool)) out.push({ kind: 'tool', tool }); }
    else if (!(r.kind === 'tool' && out.some((o) => o.tool === r.tool))) out.push(r);
  }
  return out.slice(0, limit);
}
