// Which wheel options make sense for a set of files. Works with or without file
// names, because a browser only reveals MIME types while a drag is in progress.
const OFFICE = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
};
const EXTENSIONS = {
  txt: 'text', md: 'text', markdown: 'text',
  docx: 'word', pptx: 'slides', xlsx: 'sheet',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', bmp: 'image', avif: 'image',
};
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
export const PICKER_ACCEPT = '.txt,.md,.markdown,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif';

export function fileKind({ name = '', type = '' }) {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (EXTENSIONS[extension]) return EXTENSIONS[extension];
  if (OFFICE[type]) return OFFICE[type];
  if (IMAGE_TYPES.includes(type)) return 'image';
  if (type === 'text/plain' || type === 'text/markdown') return 'text';
  return 'unknown';
}

const IMAGE_ACTIONS = [
  { id: 'to-jpg', label: 'JPG', hint: 'Convert to JPG', convert: 'image/jpeg' },
  { id: 'to-png', label: 'PNG', hint: 'Convert to PNG', convert: 'image/png' },
  { id: 'to-webp', label: 'WebP', hint: 'Convert to WebP', convert: 'image/webp' },
  { id: 'strip', label: 'Strip info', hint: 'Remove location and camera data', convert: 'keep' },
  { id: 'resize', label: 'Resize', hint: 'Pick a new size', tool: 'image-resize' },
];
const OFFICE_ACTIONS = (tool, noun) => [
  { id: 'polish', label: 'Polish', hint: 'Polish the text in this ' + noun, tool },
  { id: 'info', label: 'Strip info', hint: 'Remove author and app fields', tool: 'metadata' },
];
const SINGLE = {
  text: [
    { id: 'polish', label: 'Polish', hint: 'Cut the filler', tool: 'light-edit' },
    { id: 'check', label: 'AI tells', hint: 'Flag stock phrases', tool: 'writing-check' },
    { id: 'clean', label: 'Clean', hint: 'Fix odd spaces and hyphens', tool: 'clean-text' },
    { id: 'hidden', label: 'Hidden', hint: 'Show invisible characters', tool: 'characters' },
  ],
  word: OFFICE_ACTIONS('word', 'document'),
  slides: OFFICE_ACTIONS('presentations', 'deck'),
  sheet: OFFICE_ACTIONS('spreadsheets', 'spreadsheet'),
};

// Returns the options for these files, or an empty list with a reason.
export function wheelActions(files) {
  const kinds = files.map(fileKind);
  if (!kinds.length) return { actions: [], reason: 'No file found.' };
  if (kinds.every((kind) => kind === 'image')) {
    if (kinds.length > 50) return { actions: [], reason: 'Drop up to 50 images at a time.' };
    // Converting a PNG to PNG does nothing useful, so leave that option out.
    const types = new Set(files.map((file) => file.type || ''));
    const same = types.size === 1 ? [...types][0] : '';
    return { actions: IMAGE_ACTIONS.filter((action) => action.convert !== same), kind: 'image' };
  }
  if (kinds.length > 1) return { actions: [], reason: kinds.includes('unknown') ? 'Some of these files aren’t supported.' : 'Drop one document at a time. Batches work for images.' };
  if (SINGLE[kinds[0]]) return { actions: SINGLE[kinds[0]], kind: kinds[0] };
  return { actions: [], reason: 'Whitewash can’t open this file type yet.' };
}
