// The tabs across the top, one per kind of file. Each tab opens a page with
// its own two-layer dial: the inner ring holds the jobs (Humanize, Convert,
// Pages…), the outer ring opens on hover with the exact options for that job.
// The same tree feeds the hover drop-down and the tool cards on the page.
import { tools } from './tools.js';
import { FORMATS, targets } from './convert.js';
import { routeNote } from './notes.js';

const toolById = (id) => tools.find((t) => t.id === id);
const short = (f) => ({ md: 'MD', pptx: 'Slides', xlsx: 'Excel', docx: 'Word' }[f] || FORMATS[f].label);

// A link to a tool page.
const T = (id, label) => {
  const tool = toolById(id);
  if (!tool) throw new Error('Unknown tool ' + id);
  return { href: '#' + id, label: label || tool.short || tool.title, title: tool.title, description: tool.description, icon: tool.icon, toolId: id };
};
// A link to one conversion. `label` defaults to the target format.
const R = (from, to, label) => ({
  href: '#convert?from=' + from + '&to=' + to,
  label: label || short(to),
  title: FORMATS[from].label + ' to ' + FORMATS[to].label,
  description: routeNote(from, to).rows[0]?.[1] || 'Converted on your device',
  icon: 'swap', from, to,
});
// Same, labelled with the source format (for "… to Word" style groups).
const In = (from, to) => R(from, to, short(from));
// A job with several options: the inner ring segment whose options fan out.
const G = (label, icon, hint, children) => ({ label, icon, hint, children });
const out = (from, list, labelFrom = false) => list.filter((to) => targets(from).includes(to)).map((to) => labelFrom ? In(from, to) : R(from, to));

export const sections = [
  {
    id: 'humanize', title: 'Humanize', icon: 'sparkle',
    lede: 'Wipe the AI slop out of any draft or document.',
    blurb: 'Drop a Word, PowerPoint, Excel, PDF or text file. One click cuts the filler, stock AI phrases and hidden characters, and gives you the same kind of file back.',
    items: [
      T('light-edit', 'Paste text'), T('word', 'Word'), T('presentations', 'Slides'), T('spreadsheets', 'Excel'), T('pdf-polish', 'PDF'),
      G('Check', 'search', 'Look at a draft before changing it', [T('writing-check', 'AI tells'), T('characters', 'Hidden'), T('clean-text', 'Clean')]),
    ],
  },
  {
    id: 'pdf', title: 'PDF', icon: 'file',
    lede: 'Every PDF job in one dial.',
    blurb: 'Drop a PDF and pick what you need: humanize, compress, convert, sign, lock or rearrange its pages.',
    items: [
      T('pdf-polish', 'Humanize'),
      G('From PDF', 'swap', 'Turn a PDF into something else', [T('pdf-to-word', 'Word'), T('pdf-to-images', 'JPG'), ...out('pdf', ['png', 'md', 'txt', 'html', 'epub'])]),
      G('To PDF', 'file', 'Make a PDF from another file', [T('word-to-pdf', 'Word'), T('images-to-pdf', 'Images'), In('pptx', 'pdf'), In('xlsx', 'pdf'), T('markdown-to-pdf', 'MD'), In('html', 'pdf')]),
      T('pdf-compress', 'Compress'),
      G('Pages', 'grid', 'Merge, split, reorder, number or stamp', [T('pdf-merge'), T('pdf-split'), T('pdf-organize', 'Reorder'), T('pdf-numbers'), T('pdf-watermark')]),
      G('Secure', 'lock', 'Sign it, lock it or unlock it', [T('pdf-sign'), T('pdf-protect'), T('pdf-unlock')]),
      G('Fix', 'wrench', 'Read scans and repair broken files', [T('ocr'), T('pdf-repair')]),
      T('metadata', 'Wipe info'),
    ],
  },
  {
    id: 'word', title: 'Word', icon: 'file',
    lede: 'Word files, cleaned up or turned into anything.',
    blurb: 'Humanize a .docx and get the same file back with every style kept, or convert it to PDF, Markdown, EPUB and more.',
    items: [
      T('word', 'Humanize'),
      G('From Word', 'swap', 'Turn a Word file into something else', [T('word-to-pdf', 'PDF'), ...out('docx', ['md', 'html', 'txt', 'odt', 'rtf']), T('ebook', 'EPUB')]),
      G('To Word', 'file', 'Make a Word file from another file', [T('pdf-to-word', 'PDF'), ...out('md', ['docx'], true), ...out('html', ['docx'], true), ...out('txt', ['docx'], true), ...out('odt', ['docx'], true), ...out('pptx', ['docx'], true)]),
      T('metadata', 'Wipe info'),
    ],
  },
  {
    id: 'excel', title: 'Excel', icon: 'table',
    lede: 'Spreadsheets and data, any way round.',
    blurb: 'Clean the text in an .xlsx without touching formulas, or switch between Excel, CSV, TSV, JSON and ODS.',
    items: [
      T('spreadsheets', 'Humanize'),
      G('From Excel', 'swap', 'Turn a spreadsheet into something else', out('xlsx', ['csv', 'tsv', 'json', 'ods', 'pdf', 'html', 'md', 'docx'])),
      G('To Excel', 'table', 'Make an Excel file from data', ['csv', 'tsv', 'json', 'ods', 'md', 'html'].flatMap((f) => out(f, ['xlsx'], true))),
      T('metadata', 'Wipe info'),
    ],
  },
  {
    id: 'powerpoint', title: 'PowerPoint', icon: 'file',
    lede: 'Slide decks without the AI slop.',
    blurb: 'Humanize the text on every slide and keep the layouts, or pull the slide text into a PDF or Word file.',
    items: [
      T('presentations', 'Humanize'),
      G('Convert', 'swap', 'Turn the slide text into something else', out('pptx', ['pdf', 'docx', 'md', 'txt', 'html', 'odt', 'epub'])),
      T('metadata', 'Wipe info'),
    ],
  },
  {
    id: 'images', title: 'Images', icon: 'image',
    lede: 'Convert, shrink and clean photos.',
    blurb: 'JPG, PNG, WebP and more. Compress, resize, make a PDF, read the text, or strip location and camera data.',
    items: [
      G('Convert', 'swap', 'Change the image format', [R('jpg', 'png', 'JPG→PNG'), R('png', 'jpg', 'PNG→JPG'), R('webp', 'jpg', 'WebP→JPG'), R('jpg', 'webp', 'JPG→WebP'), R('svg', 'png', 'SVG→PNG'), R('gif', 'png', 'GIF→PNG'), R('png', 'ico', 'PNG→ICO'), T('image-convert', 'Batch')]),
      T('image-compress', 'Compress'), T('image-resize', 'Resize'), T('images-to-pdf', 'To PDF'), T('ocr', 'Read text'), T('metadata', 'Wipe info'),
    ],
  },
  {
    id: 'audio', title: 'Audio', icon: 'audio',
    lede: 'Convert sound, or pull it out of a video.',
    blurb: 'MP3, WAV, FLAC, OGG, Opus and M4A. Title, artist and cover art come along. Videos give up their sound track.',
    items: [
      ...['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus'].map((f) => G(FORMATS[f].label, 'audio', 'Convert a ' + FORMATS[f].name, out(f, ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus']))),
      G('Video', 'audio', 'Save the sound from a video', ['mp4', 'mov', 'mkv', 'webm'].flatMap((f) => out(f, ['mp3'], true))),
    ],
  },
  {
    id: 'archive', title: 'Archives', icon: 'archive',
    lede: 'Open, switch or make archives.',
    blurb: 'ZIP, 7Z, RAR, TAR and more. Drop an archive to open it or switch its format, or drop any files to pack them.',
    items: [
      ...['zip', '7z', 'rar', 'tar', 'tgz'].map((f) => G(FORMATS[f].label, 'archive', 'Open or convert a ' + FORMATS[f].name, [T('archives', 'Open'), ...out(f, ['zip', 'tar', 'tgz'])])),
      T('archives', 'Make ZIP'),
    ],
  },
];

// Every link in a section, without repeats.
export function leaves(section) {
  const seen = new Set(), list = [];
  for (const item of section.items) for (const leaf of item.children || [item]) if (!seen.has(leaf.href)) { seen.add(leaf.href); list.push(leaf); }
  return list;
}

export const sectionFromHash = (hash) => sections.find((s) => '#' + s.id === hash.split('?')[0]) || null;

// The tab to light up for a tool page or conversion link.
export function sectionOf(hash) {
  const direct = sectionFromHash(hash);
  if (direct) return direct;
  return sections.find((s) => leaves(s).some((l) => l.href === hash)) || sections.find((s) => leaves(s).some((l) => l.href === hash.split('?')[0])) || null;
}

// Dial options for a section before a file arrives. The homepage gets the
// sections in the inner ring and each section's jobs in the outer ring.
const leafOption = (leaf, key) => ({ id: key, label: leaf.label, hint: leaf.title, nav: leaf.href, icon: leaf.icon, toolId: leaf.toolId, from: leaf.from, to: leaf.to, description: leaf.description });
export function sectionDial(sectionId) {
  if (!sectionId) return sections.map((s) => ({
    id: 'sec-' + s.id, label: s.title, hint: s.lede, icon: s.icon, nav: '#' + s.id, section: s.id,
    children: s.items.map((item, i) => item.children ? { id: s.id + '-' + i, label: item.label, hint: item.hint, nav: '#' + s.id, icon: item.icon } : leafOption(item, s.id + '-' + i)),
  }));
  const section = sections.find((s) => s.id === sectionId);
  return section.items.map((item, i) => item.children
    ? { id: 'grp-' + i, label: item.label, hint: item.hint, icon: item.icon, children: item.children.map((leaf, j) => leafOption(leaf, 'grp-' + i + '-' + j)) }
    : leafOption(item, 'item-' + i));
}
