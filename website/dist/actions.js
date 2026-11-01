// Which dial options make sense for a set of files. Works with or without file
// names, because a browser only reveals MIME types while a drag is in progress.
import { detectFormat, targets, FORMATS } from './convert.js';
import { tools, sections } from './tools.js';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
export const PICKER_ACCEPT = '.txt,.md,.markdown,.html,.htm,.docx,.pptx,.xlsx,.odt,.ods,.epub,.pdf,.csv,.tsv,.json,.srt,.vtt,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.weba,.mp4,.m4v,.mov,.mkv,.webm,.zip,.7z,.rar,.tar,.tgz,.gz,.bz2,.xz';
const IMAGES = ['jpg', 'png', 'webp', 'gif', 'bmp', 'avif'];
const WIPEABLE = ['jpg', 'png', 'webp', 'gif', 'pdf', 'docx', 'pptx', 'xlsx'];
const AUDIO = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'weba'];
const VIDEO = ['mp4', 'mov', 'mkv', 'webm'];
const ARCHIVES = ['zip', '7z', 'rar', 'tar', 'tgz', 'tbz2', 'txz', 'gz', 'bz2', 'xz'];
// Humanize edits these in place and hands back the same format.
export const IN_PLACE = ['txt', 'md', 'docx', 'pptx', 'xlsx'];
// These have no editable text layer, so Humanize gives back a Word file.
export const VIA_WORD = ['pdf', 'html', 'odt', 'epub'];
// Text can be pulled out of these for AI tells, hidden characters and Edit.
const READABLE = ['txt', 'md', 'docx', 'pptx', 'pdf', 'html', 'odt', 'epub'];

export function fileKind(file) {
  const format = detectFormat(file);
  if (IMAGES.includes(format)) return 'image';
  if (format === 'txt' || format === 'md') return 'text';
  if (format === 'docx') return 'word';
  if (format === 'pptx') return 'slides';
  if (format === 'xlsx') return 'sheet';
  if (format === 'pdf') return 'pdf';
  if (AUDIO.includes(format)) return 'audio';
  if (VIDEO.includes(format)) return 'video';
  if (ARCHIVES.includes(format)) return 'archive';
  return format ? 'other' : 'unknown';
}

const to = (format, hint) => ({ id: 'to-' + format, label: FORMATS[format].label, hint: hint || 'Convert to ' + FORMATS[format].name, to: format });
const more = { id: 'more', label: 'More', hint: 'See every format', tool: 'convert' };
const wipe = { id: 'wipe', label: 'Wipe info', hint: 'Remove hidden metadata', wipe: true };
const zip = (n) => ({ id: 'zip', label: 'ZIP', hint: n > 1 ? 'Pack them into one ZIP' : 'Pack it into a ZIP', zip: true });
const tool = (id, label, hint, toolId) => ({ id, label, hint, tool: toolId });

// The writing jobs, for any document: one click to humanize, one to edit by hand.
export function writingActions(format) {
  const list = [];
  if (IN_PLACE.includes(format) || VIA_WORD.includes(format)) list.push({ id: 'humanize', label: 'Humanize', hint: 'Wipe the AI slop, ' + (IN_PLACE.includes(format) ? 'same file back' : 'as a Word file'), humanize: 'polish' });
  if (READABLE.includes(format)) list.push({ id: 'edit', label: 'Edit', hint: 'Open the text and edit it yourself', text: 'light-edit' });
  return list;
}
const cleanAction = (format) => ({ id: 'fix', label: 'Hidden chars', hint: 'Strip hidden characters and chatbot junk' + (IN_PLACE.includes(format) ? '' : ', as a Word file'), humanize: 'clean' });

const PDF_ALL = () => [
  { ...writingActions('pdf')[0] }, to('docx', 'Turn it into an editable Word file'),
  tool('compress', 'Compress', 'Make the file smaller for email', 'pdf-compress'),
  tool('sign', 'Sign', 'Draw your signature on it', 'pdf-sign'),
  tool('organize', 'Pages', 'Reorder, rotate or delete pages', 'pdf-organize'),
  tool('split', 'Split', 'Pull out pages or save each one', 'pdf-split'),
  tool('protect', 'Lock', 'Add a password', 'pdf-protect'),
  tool('unlock', 'Unlock', 'Remove a password', 'pdf-unlock'),
  tool('to-images', 'To JPG', 'Save each page as an image', 'pdf-to-images'),
  tool('ocr', 'OCR', 'Read text from a scanned PDF', 'ocr'),
  tool('watermark', 'Stamp', 'Add a watermark', 'pdf-watermark'),
  tool('numbers', 'Numbers', 'Add page numbers', 'pdf-numbers'),
  wipe,
  tool('repair', 'Repair', 'Fix a PDF that won’t open', 'pdf-repair'),
];

function single(format) {
  if (format === 'txt' || format === 'md') return [...writingActions(format), to('pdf'), to('docx'), more];
  if (format === 'docx') return [...writingActions(format), wipe, to('pdf'), to('md'), to('epub'), more];
  if (format === 'pptx') return [...writingActions(format), wipe, to('pdf', 'Slide text as a PDF'), to('docx', 'Slide text as a Word file'), more];
  if (format === 'xlsx') return [...writingActions(format), wipe, to('csv'), to('json'), to('pdf', 'Table as a PDF'), more];
  if (format === 'pdf') { const all = PDF_ALL(); return [all[0], all[1], all[2], all[3], all[4], all[6], wipe, { id: 'edit', label: 'Edit', hint: 'Open the text and edit it yourself', text: 'light-edit' }, { id: 'more-pdf', label: 'More', hint: 'Every PDF tool', hub: 'pdf' }]; }
  if (AUDIO.includes(format)) return [...['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus'].filter((f) => f !== format).map((f) => to(f)), more];
  if (VIDEO.includes(format)) return [to('mp3', 'Save the sound as MP3'), to('m4a', 'Save the sound as M4A'), to('wav', 'Save the sound as WAV'), to('flac', 'Save the sound as FLAC'), more];
  if (ARCHIVES.includes(format)) return [tool('open', 'Open', 'See and save what’s inside', 'archives'), ...['zip', 'tgz', 'tar'].filter((f) => f !== format).map((f) => to(f)), more];
  if (['html', 'odt', 'epub'].includes(format)) return [...writingActions(format), ...targets(format).filter((f) => ['pdf', 'docx', 'md', 'txt'].includes(f)).map((f) => to(f)), more];
  return null;
}

// Returns the options for these files, or an empty list with a reason.
export function wheelActions(files) {
  if (!files.length) return { actions: [], reason: 'No file found.' };
  const formats = files.map(detectFormat);
  if (formats.includes(null)) return { actions: [], reason: files.length > 1 ? 'Some of these files aren’t supported.' : 'Whitewash can’t open this file type yet.' };
  const same = new Set(formats).size === 1 ? formats[0] : null;
  if (files.length > 50) return { actions: [], reason: 'Drop up to 50 files at a time.' };
  if (formats.every((f) => IMAGES.includes(f))) {
    const actions = ['jpg', 'png', 'webp'].filter((f) => f !== same).map((f) => ({ ...to(f), convert: FORMATS[f].mime }));
    actions.push(tool('squeeze', 'Compress', 'Much smaller files, same look', 'image-compress'), { id: 'to-pdf', label: 'PDF', hint: files.length > 1 ? 'Put them all in one PDF' : 'Make a PDF', tool: 'images-to-pdf' }, wipe, tool('resize', 'Resize', 'Pick a new size', 'image-resize'));
    if (files.length > 1) actions.push(zip(files.length));
    else actions.push({ id: 'ocr', label: 'Text', hint: 'Read the words in this image', tool: 'ocr' });
    actions.push(more);
    return { actions, kind: 'image' };
  }
  if (files.length > 1) {
    if (same === 'pdf') return { actions: [tool('merge', 'Merge', 'Join them into one PDF', 'pdf-merge'), wipe, to('docx'), zip(files.length), more], kind: 'pdf' };
    if (same) return { actions: [...targets(same).slice(0, 5).map((f) => to(f)), ...(WIPEABLE.includes(same) ? [wipe] : []), zip(files.length), more], kind: 'batch' };
    if (formats.every((f) => WIPEABLE.includes(f))) return { actions: [wipe, zip(files.length), to('tgz', 'Pack them into a TAR.GZ')], kind: 'mixed' };
    return { actions: [zip(files.length), to('tgz', 'Pack them into a TAR.GZ')], kind: 'mixed' };
  }
  const known = single(formats[0]);
  if (known) return { actions: known, kind: formats[0] };
  const options = targets(formats[0]);
  if (!options.length) return { actions: [], reason: 'Whitewash can’t do anything with this file type yet.' };
  return { actions: [...options.slice(0, 8).map((f) => to(f)), ...(WIPEABLE.includes(formats[0]) ? [wipe] : []), more], kind: formats[0] };
}

// Options on a section's dial before a file is dropped: that section's tools.
// The homepage gets the sections themselves.
export function idleOptions(sectionId) {
  if (!sectionId) return [...sections.map((s) => ({ id: 'nav-' + s.id, label: s.short, hint: s.lede, nav: s.href || '#' + s.id, icon: s.icon })), { id: 'nav-edit', label: 'Paste text', hint: 'Paste a draft and humanize it', nav: '#light-edit', icon: 'edit' }];
  const section = sections.find((s) => s.id === sectionId);
  // Small sections show the formats they take; clicking one opens the file picker.
  if (section.drop) return [...section.tools.map((id) => tools.find((t) => t.id === id)).map((t) => ({ id: 'nav-' + t.id, label: t.short || t.title, hint: t.title, nav: '#' + t.id, icon: t.icon, toolId: t.id })), ...section.drop.map((f) => ({ id: 'drop-' + f, label: FORMATS[f].label, hint: 'Choose a ' + FORMATS[f].name, pick: true }))];
  return section.tools.map((id) => tools.find((t) => t.id === id)).map((t) => ({ id: 'nav-' + t.id, label: t.short || t.title, hint: t.title, nav: '#' + t.id, icon: t.icon, toolId: t.id }));
}

// Options for dropped files on a section's dial.
export function sectionActions(sectionId, files) {
  if (!sectionId) return wheelActions(files);
  const formats = files.map(detectFormat);
  if (!files.length) return { actions: [], reason: 'No file found.' };
  if (formats.includes(null)) return { actions: [], reason: 'Whitewash can’t open ' + (files[formats.indexOf(null)].name || 'this file') + '.' };
  const one = files.length === 1 ? formats[0] : null;
  const all = (list) => formats.every((f) => list.includes(f));
  const none = (reason) => ({ actions: [], reason });
  if (sectionId === 'humanize') {
    if (!one) return none('Humanize works on one document at a time.');
    const list = writingActions(one);
    return list.length ? { actions: list } : none('Humanize works on Word, PowerPoint, Excel, PDF, Markdown and text files.');
  }
  if (sectionId === 'pdf') {
    if (one === 'pdf') return { actions: PDF_ALL() };
    if (all(['pdf'])) return { actions: [tool('merge', 'Merge', 'Join them into one PDF', 'pdf-merge'), wipe, zip(files.length)] };
    if (all(IMAGES)) return { actions: [{ id: 'to-pdf', label: 'Make PDF', hint: files.length > 1 ? 'Put them all in one PDF' : 'Make a PDF', tool: 'images-to-pdf' }, tool('ocr', 'OCR → PDF', 'Read the text and make a searchable PDF', 'ocr')] };
    if (one && targets(one).includes('pdf')) return { actions: [to('pdf', 'Turn it into a PDF')] };
    return none('Drop a PDF, or images or documents to turn into one.');
  }
  if (sectionId === 'compress') {
    const list = [];
    if (one === 'pdf') list.push(tool('compress', 'Compress PDF', 'Shrink the photos inside', 'pdf-compress'));
    if (all(IMAGES)) list.push(tool('squeeze', 'Compress', 'Much smaller images, same look', 'image-compress'), tool('resize', 'Resize', 'Fewer pixels, smaller file', 'image-resize'));
    list.push(zip(files.length), to('tgz', 'Pack into a TAR.GZ'));
    return { actions: list };
  }
  if (sectionId === 'audio') {
    if (!one || !(AUDIO.includes(one) || VIDEO.includes(one))) return none('Drop one audio file, or a video to pull the sound out of.');
    return { actions: targets(one).map((f) => to(f, VIDEO.includes(one) ? 'Save the sound as ' + FORMATS[f].label : undefined)) };
  }
  if (sectionId === 'archive') {
    if (one && ARCHIVES.includes(one)) return { actions: [tool('open', 'Open', 'See and save what’s inside', 'archives'), ...targets(one).map((f) => to(f))] };
    return { actions: [zip(files.length), to('tgz', 'Pack into a TAR.GZ'), { ...to('tar', 'Pack into a TAR') }] };
  }
  if (sectionId === 'privacy') {
    const list = [];
    if (all(WIPEABLE)) list.push(wipe);
    if (one && (IN_PLACE.includes(one) || VIA_WORD.includes(one))) list.push(cleanAction(one));
    return list.length ? { actions: list } : none('Wiping works on photos, PDFs and Office files.');
  }
  return wheelActions(files);
}
