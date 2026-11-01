// Which dial options make sense for a set of files. Works with or without file
// names, because a browser only reveals MIME types while a drag is in progress.
import { detectFormat, targets, FORMATS } from './convert.js';

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

const edit = { id: 'edit', label: 'Edit', hint: 'Open the text and edit it yourself', text: 'light-edit' };
const group = (id, label, hint, icon, children) => ({ id, label, hint, icon, children });

// A PDF has too many jobs for one ring, so the dial gets two: the jobs on the
// inside, the exact options on the outside.
const PDF_LAYERED = () => [
  { ...writingActions('pdf')[0] }, to('docx', 'Turn it into an editable Word file'),
  tool('compress', 'Compress', 'Make the file smaller for email', 'pdf-compress'),
  edit,
  group('convert', 'Convert', 'Turn it into another format', 'swap', [tool('to-images', 'JPG', 'Save each page as an image', 'pdf-to-images'), to('png', 'Each page as a PNG'), to('md'), to('txt'), to('html'), to('epub')]),
  group('pages', 'Pages', 'Reorder, split, number or stamp', 'grid', [tool('organize', 'Reorder', 'Move, turn or delete pages', 'pdf-organize'), tool('split', 'Split', 'Pull out pages or save each one', 'pdf-split'), tool('numbers', 'Numbers', 'Add page numbers', 'pdf-numbers'), tool('watermark', 'Stamp', 'Add a watermark', 'pdf-watermark')]),
  group('secure', 'Secure', 'Sign it, lock it or unlock it', 'lock', [tool('sign', 'Sign', 'Draw your signature on it', 'pdf-sign'), tool('protect', 'Lock', 'Add a password', 'pdf-protect'), tool('unlock', 'Unlock', 'Remove a password', 'pdf-unlock')]),
  group('fix', 'Fix', 'Read a scan or repair a broken file', 'wrench', [tool('ocr', 'OCR', 'Read text from a scanned PDF', 'ocr'), tool('repair', 'Repair', 'Fix a PDF that won’t open', 'pdf-repair')]),
  wipe,
];

// Icons for the inner ring.
const ICONS = { humanize: 'sparkle', edit: 'edit', wipe: 'shield', compress: 'compress', squeeze: 'compress', resize: 'resize', zip: 'archive', open: 'archive', merge: 'merge', 'to-pdf': 'file', 'to-docx': 'file', ocr: 'eye', more: 'plus', convert: 'swap' };
const withIcons = (list) => list.map((a) => ({ ...a, icon: a.icon || ICONS[a.id] || (a.to || a.convert ? 'swap' : undefined) }));

// More than eight options: fold the conversions into one "Convert" segment
// whose formats open in the outer ring.
function layer(list) {
  if (list.length <= 8) return list;
  const conversions = list.filter((a) => a.to && a.id !== 'to-docx');
  if (conversions.length < 2) return list;
  const rest = list.filter((a) => !conversions.includes(a));
  const at = list.indexOf(conversions[0]);
  rest.splice(Math.min(at, rest.length), 0, group('convert', 'Convert', 'Turn it into another format', 'swap', conversions));
  return rest;
}

function single(format) {
  if (format === 'txt' || format === 'md') return [...writingActions(format), to('pdf'), to('docx'), more];
  if (format === 'docx') return [...writingActions(format), wipe, to('pdf'), to('md'), to('epub'), more];
  if (format === 'pptx') return [...writingActions(format), wipe, to('pdf', 'Slide text as a PDF'), to('docx', 'Slide text as a Word file'), more];
  if (format === 'xlsx') return [...writingActions(format), wipe, to('csv'), to('json'), to('pdf', 'Table as a PDF'), more];
  if (format === 'pdf') return PDF_LAYERED();
  if (AUDIO.includes(format)) return [...['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus'].filter((f) => f !== format).map((f) => to(f)), more];
  if (VIDEO.includes(format)) return [to('mp3', 'Save the sound as MP3'), to('m4a', 'Save the sound as M4A'), to('wav', 'Save the sound as WAV'), to('flac', 'Save the sound as FLAC'), more];
  if (ARCHIVES.includes(format)) return [tool('open', 'Open', 'See and save what’s inside', 'archives'), ...['zip', 'tgz', 'tar'].filter((f) => f !== format).map((f) => to(f)), more];
  if (['html', 'odt', 'epub'].includes(format)) return [...writingActions(format), ...targets(format).filter((f) => ['pdf', 'docx', 'md', 'txt'].includes(f)).map((f) => to(f)), more];
  return null;
}

// Returns the options for these files, or an empty list with a reason.
export function wheelActions(files) {
  const result = rawActions(files);
  return result.actions.length ? { ...result, actions: withIcons(layer(result.actions)) } : result;
}

function rawActions(files) {
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
