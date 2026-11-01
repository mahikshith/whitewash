// Which wheel options make sense for a set of files. Works with or without file
// names, because a browser only reveals MIME types while a drag is in progress.
import { detectFormat, targets, FORMATS } from './convert.js';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
export const PICKER_ACCEPT = '.txt,.md,.markdown,.html,.htm,.docx,.pptx,.xlsx,.odt,.ods,.epub,.pdf,.csv,.tsv,.json,.srt,.vtt,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.weba,.mp4,.m4v,.mov,.mkv,.webm,.zip,.7z,.rar,.tar,.tgz,.gz,.bz2,.xz';
const IMAGES = ['jpg', 'png', 'webp', 'gif', 'bmp', 'avif'];
const WIPEABLE = ['jpg', 'png', 'webp', 'gif', 'pdf', 'docx', 'pptx', 'xlsx'];
const AUDIO = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'weba'];
const VIDEO = ['mp4', 'mov', 'mkv', 'webm'];
const ARCHIVES = ['zip', '7z', 'rar', 'tar', 'tgz', 'tbz2', 'txz', 'gz', 'bz2', 'xz'];

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

function single(format) {
  if (format === 'txt' || format === 'md') return [
    { id: 'polish', label: 'Polish', hint: 'Cut the filler', tool: 'light-edit' },
    { id: 'check', label: 'AI tells', hint: 'Flag stock phrases', tool: 'writing-check' },
    { id: 'clean', label: 'Clean', hint: 'Fix odd spaces and chatbot junk', tool: 'clean-text' },
    to('pdf'), to('docx'), more,
  ];
  if (format === 'docx') return [{ id: 'polish', label: 'Polish', hint: 'Polish the text in this document', tool: 'word' }, wipe, to('pdf'), to('md'), to('epub'), more];
  if (format === 'pptx') return [{ id: 'polish', label: 'Polish', hint: 'Polish the text on these slides', tool: 'presentations' }, wipe, to('pdf', 'Slide text as a PDF'), to('docx', 'Slide text as a Word file'), more];
  if (format === 'xlsx') return [{ id: 'polish', label: 'Polish', hint: 'Polish long text cells', tool: 'spreadsheets' }, wipe, to('csv'), to('json'), to('pdf', 'Table as a PDF'), more];
  if (AUDIO.includes(format)) return [...['mp3', 'wav', 'flac', 'm4a', 'ogg'].filter((f) => f !== format).slice(0, 4).map((f) => to(f)), more];
  if (VIDEO.includes(format)) return [to('mp3', 'Save the sound as MP3'), to('m4a', 'Save the sound as M4A'), to('wav', 'Save the sound as WAV'), more];
  if (ARCHIVES.includes(format)) return [{ id: 'open', label: 'Open', hint: 'See and save what’s inside', tool: 'archives' }, ...['zip', 'tgz', 'tar'].filter((f) => f !== format).map((f) => to(f)), more];
  if (format === 'pdf') return [to('docx'), { id: 'pdf-polish', label: 'Polish', hint: 'Polish the text in this PDF', tool: 'pdf-polish' }, { id: 'compress', label: 'Shrink', hint: 'Make the file smaller for email', tool: 'pdf-compress' }, { id: 'sign', label: 'Sign', hint: 'Draw your signature on it', tool: 'pdf-sign' }, wipe, { id: 'organize', label: 'Pages', hint: 'Reorder, rotate or delete pages', tool: 'pdf-organize' }, more];
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
    actions.push({ id: 'to-pdf', label: 'PDF', hint: files.length > 1 ? 'Put them all in one PDF' : 'Make a PDF', tool: 'images-to-pdf' }, wipe, { id: 'squeeze', label: 'Shrink', hint: 'Much smaller files, same look', tool: 'image-compress' });
    if (files.length > 1) actions.push(zip(files.length));
    else actions.push({ id: 'ocr', label: 'Text', hint: 'Read the words in this image', tool: 'ocr' });
    actions.push(more);
    return { actions, kind: 'image' };
  }
  if (files.length > 1) {
    if (same === 'pdf') return { actions: [{ id: 'merge', label: 'Merge', hint: 'Join them into one PDF', tool: 'pdf-merge' }, wipe, to('docx'), more], kind: 'pdf' };
    if (same) return { actions: [...targets(same).slice(0, 4).map((f) => to(f)), ...(WIPEABLE.includes(same) ? [wipe] : []), zip(files.length), more], kind: 'batch' };
    if (formats.every((f) => WIPEABLE.includes(f))) return { actions: [wipe, zip(files.length)], kind: 'mixed' };
    return { actions: [zip(files.length)], kind: 'mixed' };
  }
  const known = single(formats[0]);
  if (known) return { actions: known, kind: formats[0] };
  const options = targets(formats[0]);
  if (!options.length) return { actions: [], reason: 'Whitewash can’t do anything with this file type yet.' };
  return { actions: [...options.slice(0, 5).map((f) => to(f)), ...(WIPEABLE.includes(formats[0]) ? [wipe] : []), more], kind: formats[0] };
}
