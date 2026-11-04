// Plain descriptions of what each wheel option or conversion gives you, what
// survives and what doesn't. Shown beside the wheel and under the converter's
// format chips, so nobody has to guess what they're about to download.
import { FORMATS, FAMILY, detectFormat } from './convert.js';

const DOCS = ['txt', 'md', 'html', 'docx', 'odt', 'epub', 'pptx', 'rtf'];
const DATA = ['csv', 'tsv', 'json', 'xlsx', 'ods'];
const IMAGES = ['jpg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg', 'tiff', 'ico'];
const LOSSLESS_AUDIO = ['wav', 'flac'];
const name = (id) => FORMATS[id]?.name || (id || '').toUpperCase();

// Returns { title, rows: [[label, text]], foot } for a conversion.
export function routeNote(from, to) {
  const title = (FORMATS[from]?.label || 'File') + ' → ' + (FORMATS[to]?.label || to);
  const rows = [];
  const family = FAMILY(from);
  if (family === 'audio') {
    const video = ['mp4', 'mov', 'mkv', 'webm'].includes(from);
    rows.push(['You get', to === 'mp3' ? 'An MP3 at 256 kbps that plays everywhere' : to === 'wav' ? 'Uncompressed 16-bit WAV. Big, but every editor opens it' : to === 'flac' ? 'Lossless FLAC, about half the size of WAV' : to === 'm4a' ? 'AAC in an M4A file at 256 kbps, good for Apple devices' : 'Opus audio at 256 kbps, small and clear']);
    rows.push(['Keeps', video ? 'The sound track, plus title and artist tags' : 'Title, artist, album and cover art']);
    if (video) rows.push(['Drops', 'The picture. Only the sound is saved']);
    else if (!LOSSLESS_AUDIO.includes(from) && LOSSLESS_AUDIO.includes(to)) rows.push(['Note', 'Lossless output won’t bring back quality the ' + FORMATS[from].label + ' already lost']);
    else if (LOSSLESS_AUDIO.includes(from) && !LOSSLESS_AUDIO.includes(to)) rows.push(['Note', 'Lossy, so it’s much smaller but not bit-identical']);
  } else if (family === 'archive') {
    rows.push(['You get', 'The same files inside a ' + name(to)]);
    rows.push(['Keeps', 'Every file and folder path']);
    rows.push(['Drops', 'File dates (set to 1980) and permissions']);
  } else if (IMAGES.includes(from)) {
    rows.push(['You get', to === 'pdf' ? 'A one-page PDF the size of the image' : to === 'ico' ? 'A Windows icon with six sizes, 16 to 256 px' : 'A ' + name(to) + ' at the same size in pixels']);
    rows.push(['Keeps', 'The picture as you see it']);
    rows.push(['Drops', (to === 'jpg' || to === 'bmp') && ['png', 'webp', 'gif', 'svg', 'avif'].includes(from) ? 'Transparency (filled with white), animation and camera details' : 'Animation and camera details like location']);
  } else if (from === 'pdf' && ['jpg', 'png', 'webp'].includes(to)) {
    rows.push(['You get', 'One ' + FORMATS[to].label + ' per page at double resolution, zipped if there’s more than one']);
    rows.push(['Keeps', 'Exactly how each page looks']);
    rows.push(['Drops', 'Selectable text and links']);
  } else if (from === 'pdf') {
    rows.push(['You get', 'An editable ' + name(to) + ' with the PDF’s text']);
    rows.push(['Keeps', 'Text, paragraphs, and headings (guessed from font size)']);
    rows.push(['Drops', 'Layout, images and columns. Tables become plain lines. Scanned pages have no text, so use Read text from scans first']);
  } else if (DATA.includes(from) || (['html', 'md'].includes(from) && DATA.includes(to))) {
    rows.push(['You get', to === 'csv' || to === 'tsv' ? 'One ' + FORMATS[to].label + ' per sheet' : to === 'json' ? 'A list of rows keyed by the header row. Numbers stay numbers' : to === 'pdf' || to === 'docx' ? 'Each sheet as a table' : 'A ' + name(to) + ' with every sheet']);
    rows.push(['Keeps', 'Cell values as shown']);
    rows.push(['Drops', 'Formulas (their results stay), formatting, charts and merged cells' + (to === 'pdf' ? '. Chinese, Japanese, Korean and emoji show as ?' : '')]);
  } else if (['srt', 'vtt'].includes(from)) {
    rows.push(['You get', to === 'txt' ? 'Just the spoken lines, one per line' : 'The same subtitles in ' + FORMATS[to].label + ' format']);
    rows.push(['Keeps', to === 'txt' ? 'The words' : 'Every line and its timing']);
    if (to !== 'txt') rows.push(['Drops', 'Styling and position tags']);
  } else if (DOCS.includes(from)) {
    rows.push(['You get', to === 'pdf' ? 'A clean PDF with real, selectable text' : to === 'epub' ? 'An e-book with a chapter for each main heading' : 'A ' + name(to)]);
    rows.push(['Keeps', from === 'pptx' ? 'Slide titles and text, one section per slide' : 'Headings, lists, tables, links, bold and italic']);
    rows.push(['Drops', (from === 'pptx' ? 'Slide design, pictures and animations' : 'Page layout, fonts, colours and images') + (to === 'pdf' ? '. Chinese, Japanese, Korean and emoji show as ?' : '')]);
  }
  return { title, rows, foot: 'Runs on this device. Nothing is uploaded.' };
}

const TOOL = {
  polish: { title: 'Polish', rows: [['You get', 'A tidier draft with filler cut, like “in order to” → “to”'], ['Keeps', 'Your meaning, numbers, quotes, links and code'], ['Note', 'You see every change and can undo any of them']] },
  check: { title: 'Spot AI tells', rows: [['You get', 'A list of stock phrases such as “delve into” and where they are'], ['Note', 'Nothing is changed. It is not an AI detector score']] },
  clean: { title: 'Clean', rows: [['You get', 'The same text without odd spaces, hidden hyphens, citation markers and tracking links'], ['Keeps', 'Emoji, accents and every other script']] },
  'pdf-polish': { title: 'Polish PDF text', rows: [['You get', 'The PDF’s text in the polish tool'], ['Note', 'The PDF itself isn’t changed']] },
  wipe: { title: 'Wipe hidden info', rows: [['Removes', 'Location, camera, author, software, edit history and AI labels'], ['Keeps', 'The content, untouched. Photos aren’t re-compressed'], ['Note', 'The copy is opened again and checked before you get it']] },
  merge: { title: 'Merge PDFs', rows: [['You get', 'One PDF, in the order you choose'], ['Keeps', 'Every page exactly as it was'], ['Drops', 'Bookmarks and form fields']] },
  organize: { title: 'Pages', rows: [['You get', 'A preview of every page to move, rotate or delete']] },
  resize: { title: 'Resize', rows: [['You get', 'Smaller images, in pixels and in file size'], ['Drops', 'Camera details like location']] },
  open: { title: 'Open archive', rows: [['You get', 'A list of what’s inside, to save one file or all of them']] },
  zip: { title: 'Pack into a ZIP', rows: [['You get', 'One ZIP with every file'], ['Drops', 'File dates (set to 1980)']] },
  more: { title: 'More formats', rows: [['You get', 'Every format this file can become']] },
  compress: { title: 'Shrink PDF', rows: [['You get', 'The same PDF, smaller, with photos re-saved at a lower resolution'], ['Keeps', 'Text, fonts and drawings, sharp and selectable'], ['Note', 'If it can’t get smaller you get the original back']] },
  sign: { title: 'Sign', rows: [['You get', 'Your drawn signature placed on the page you pick'], ['Note', 'A visible signature, not a certificate-based digital signature']] },
  squeeze: { title: 'Shrink images', rows: [['You get', 'Smaller files at up to 2560 px, tuned with MozJPEG and OxiPNG'], ['Drops', 'Camera details like location']] },
  ocr: { title: 'Read the text', rows: [['You get', 'The words in the image as text you can copy, polish or save'], ['Also', 'A searchable PDF of the image'], ['Note', 'English only for now. Clear, straight photos work best']] },
  edit: { title: 'Edit', rows: [['You get', 'The text in the editor, already humanized, with every change marked'], ['Then', 'Undo any change, edit by hand, copy or download']] },
  protect: { title: 'Lock with a password', rows: [['You get', 'The same PDF, needing a password to open (AES-256)']] },
  unlock: { title: 'Remove the password', rows: [['You get', 'A copy that opens without a password'], ['Needs', 'The password, typed once']] },
  split: { title: 'Split', rows: [['You get', 'The pages you pick, or every page as its own PDF']] },
  'to-images': { title: 'PDF → JPG', rows: [['You get', 'Every page as an image, in a ZIP']] },
  watermark: { title: 'Stamp', rows: [['You get', 'Text like DRAFT across every page']] },
  numbers: { title: 'Page numbers', rows: [['You get', 'A number on every page, where you choose']] },
  repair: { title: 'Repair', rows: [['You get', 'A rebuilt copy of a PDF that won’t open or shows errors']] },
  'more-pdf': { title: 'Every PDF tool', rows: [['You get', 'The PDF page with this file loaded and all 15 tools on the dial']] },
  'to-pdf-images': { title: 'Images → PDF', rows: [['You get', 'One PDF, one image per page'], ['Drops', 'Camera details like location']] },
};

// For a wheel action and the files it would run on.
export function actionNote(action, files) {
  const from = files?.[0] ? detectFormat(files[0]) : null;
  if (action.to && from) {
    const note = routeNote(from, action.to);
    if (files.length > 1) note.rows.unshift(['Files', files.length + ' files, saved together in a ZIP']);
    return note;
  }
  if (action.humanize) {
    const inPlace = ['txt', 'md', 'docx', 'pptx', 'xlsx'].includes(from);
    const kind = { docx: 'Word file', pptx: 'slide deck', xlsx: 'spreadsheet', txt: 'text file', md: 'Markdown file' }[from] || 'file';
    const rows = action.humanize === 'clean'
      ? [['Removes', 'Hidden characters, odd spaces, soft hyphens and chatbot citation junk'], ['You get', inPlace ? 'The same ' + kind + ', with nothing else touched' : 'A Word file with the text']]
      : [['Removes', 'Filler (“in order to”), stock AI phrases (“delve into”, “it is important to note”), chatbot sign-offs, hidden characters'], ['You get', inPlace ? 'The same ' + kind + ' back: styles, tables, images and layout untouched' : 'A Word file with the humanized text. A PDF’s layout can’t be edited in place'], ['Keeps', 'Quotes, numbers, names, links and code exactly as they were']];
    return { title: action.humanize === 'clean' ? 'Strip hidden characters' : 'Humanize', rows, foot: 'One click. Runs on this device. Nothing is uploaded.' };
  }
  if (action.convert) return routeNote(from || 'png', Object.keys(FORMATS).find((k) => FORMATS[k].mime === action.convert) || 'png');
  if (action.tool === 'images-to-pdf') return { ...TOOL['to-pdf-images'], foot: 'Runs on this device. Nothing is uploaded.' };
  const key = action.wipe ? 'wipe' : action.zip ? 'zip' : action.id;
  const base = TOOL[key] || { title: action.label, rows: [['You get', action.hint]] };
  return { ...base, foot: 'Runs on this device. Nothing is uploaded.' };
}

// Renders a note into an element as a small definition list.
export function renderNote(element, note) {
  element.replaceChildren();
  if (!note) { element.hidden = true; return; }
  const title = document.createElement('strong'); title.textContent = note.title;
  const list = document.createElement('dl');
  for (const [label, text] of note.rows) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = text;
    list.append(dt, dd);
  }
  const foot = document.createElement('small'); foot.textContent = note.foot;
  element.append(title, list, foot);
  element.classList.toggle('proof', !!note.proof);
  element.hidden = false;
}
