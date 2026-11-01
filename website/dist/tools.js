export const groups = [
  { id: 'writing', title: 'Writing', blurb: 'Paste a draft, get a cleaner one back.' },
  { id: 'convert', title: 'Convert', blurb: 'Documents, PDFs, spreadsheets, subtitles and images. About 150 conversions, all on your device.' },
  { id: 'pdf', title: 'PDF', blurb: 'Merge, split, reorder and stamp PDFs without uploading them.' },
  { id: 'documents', title: 'Office files and privacy', blurb: 'Fix the words inside Office files, or wipe the hidden info from any file.' },
  { id: 'images', title: 'Images', blurb: 'Convert and shrink photos.' },
];

export const tools = [
  { id: 'light-edit', group: 'writing', title: 'Polish a draft', description: 'Cuts wordy phrases like “in order to” and chatbot junk like 【4†source】. You see every change.', state: 'ready', icon: 'edit', mode: 'polish', action: 'Polish it' },
  { id: 'writing-check', group: 'writing', title: 'Spot AI tells', description: 'Flags stock phrases such as “delve into”, “it is important to note” and “I hope this helps”.', state: 'ready', icon: 'search', mode: 'writing', action: 'Check it' },
  { id: 'clean-text', group: 'writing', title: 'Clean pasted text', description: 'Fixes odd spaces, hidden hyphens, citation markers and chatbot tracking links.', state: 'ready', icon: 'clean', mode: 'clean', action: 'Clean it' },
  { id: 'characters', group: 'writing', title: 'Find hidden characters', description: 'Lists the invisible characters in your text and how many of each.', state: 'ready', icon: 'eye', mode: 'inspect', action: 'Show them' },
  { id: 'text-file', group: 'writing', title: 'Polish a text file', description: 'Drop a .txt or .md file and get an edited copy back.', state: 'ready', icon: 'file', label: 'TXT', mode: 'polish', action: 'Polish it' },
  { id: 'convert', group: 'convert', title: 'Convert any file', description: 'Drop a file and pick what you want it to be. Word, PDF, Markdown, Excel, EPUB, images and more.', state: 'ready', icon: 'swap', mode: 'convert', action: 'Choose a file', isNew: true },
  { id: 'word-to-pdf', group: 'convert', title: 'Word to PDF', description: 'Headings, lists, tables and links, with real selectable text.', state: 'ready', icon: 'file', label: 'W', mode: 'convert', from: 'docx', to: 'pdf', action: 'Choose a Word file', isNew: true },
  { id: 'pdf-to-word', group: 'convert', title: 'PDF to Word', description: 'Pulls the text and headings into an editable .docx.', state: 'ready', icon: 'file', label: 'PDF', mode: 'convert', from: 'pdf', to: 'docx', action: 'Choose a PDF', isNew: true },
  { id: 'markdown-to-pdf', group: 'convert', title: 'Markdown to PDF', description: 'Turn notes or a README into a clean PDF or Word file.', state: 'ready', icon: 'file', label: 'MD', mode: 'convert', from: 'md', to: 'pdf', action: 'Choose a Markdown file', isNew: true },
  { id: 'excel-to-csv', group: 'convert', title: 'Spreadsheets and data', description: 'Excel, CSV, TSV, JSON and ODS into each other, or into a table in a PDF.', state: 'ready', icon: 'table', mode: 'convert', from: 'xlsx', to: 'csv', action: 'Choose a file', isNew: true },
  { id: 'ebook', group: 'convert', title: 'E-books and subtitles', description: 'Make an EPUB from any document, or switch subtitles between SRT and VTT.', state: 'ready', icon: 'book', mode: 'convert', from: 'docx', to: 'epub', action: 'Choose a file', isNew: true },
  { id: 'pdf-merge', group: 'pdf', title: 'Merge PDFs', description: 'Join several PDFs into one, in the order you choose.', state: 'ready', icon: 'merge', mode: 'pdf', action: 'Choose PDFs', isNew: true },
  { id: 'pdf-split', group: 'pdf', title: 'Split a PDF', description: 'Pull out the pages you want, or save every page as its own file.', state: 'ready', icon: 'split', mode: 'pdf', action: 'Choose a PDF', isNew: true },
  { id: 'pdf-organize', group: 'pdf', title: 'Reorder and rotate pages', description: 'Move, turn or delete pages, with a preview of each one.', state: 'ready', icon: 'grid', mode: 'pdf', action: 'Choose a PDF', isNew: true },
  { id: 'images-to-pdf', group: 'pdf', title: 'Images to PDF', description: 'Put photos or scans into one PDF, one per page.', state: 'ready', icon: 'image', mode: 'pdf', action: 'Choose images', isNew: true },
  { id: 'pdf-to-images', group: 'pdf', title: 'PDF to images', description: 'Save each page as a JPG or PNG.', state: 'ready', icon: 'image', label: 'PDF', mode: 'pdf', action: 'Choose a PDF', isNew: true },
  { id: 'pdf-polish', group: 'pdf', title: 'Polish PDF text', description: 'Pull the text out of a PDF and run it through the polish tool.', state: 'ready', icon: 'edit', label: 'PDF', mode: 'pdf', action: 'Choose a PDF', isNew: true },
  { id: 'pdf-watermark', group: 'pdf', title: 'Add a watermark', description: 'Stamp text like DRAFT or CONFIDENTIAL across every page.', state: 'ready', icon: 'stamp', mode: 'pdf', action: 'Choose a PDF', isNew: true },
  { id: 'pdf-numbers', group: 'pdf', title: 'Add page numbers', description: 'Number every page, top or bottom.', state: 'ready', icon: 'hash', mode: 'pdf', action: 'Choose a PDF', isNew: true },
  { id: 'metadata', group: 'documents', title: 'Metadata wiper', description: 'Strips location, camera, author, software and AI labels from photos, PDFs and Office files, then checks the copy is clean.', state: 'ready', icon: 'shield', mode: 'wipe', action: 'Choose files', isNew: true },
  { id: 'word', group: 'documents', title: 'Polish Word documents', description: 'Polishes the text in a .docx and keeps the formatting.', state: 'ready', icon: 'file', label: 'W', mode: 'office', action: 'Choose a Word file', accept: '.docx' },
  { id: 'presentations', group: 'documents', title: 'Polish slide decks', description: 'Polishes the text on your .pptx slides. Notes and layouts are left alone.', state: 'ready', icon: 'file', label: 'P', mode: 'office', action: 'Choose a slide deck', accept: '.pptx' },
  { id: 'spreadsheets', group: 'documents', title: 'Polish spreadsheets', description: 'Polishes long text cells in an .xlsx. Formulas and numbers stay as they are.', state: 'ready', icon: 'file', label: 'X', mode: 'office', action: 'Choose a spreadsheet', accept: '.xlsx' },
  { id: 'image-convert', group: 'images', title: 'Convert images', description: 'JPG, PNG and WebP into each other, a whole batch at once. More formats in Convert.', state: 'ready', icon: 'image', mode: 'image', action: 'Choose images' },
  { id: 'image-resize', group: 'images', title: 'Resize images', description: 'Make photos smaller in pixels and in file size.', state: 'ready', icon: 'resize', mode: 'image', action: 'Choose images' },
  { id: 'ai-humanizer', group: 'writing', title: 'Rewrite in your voice', description: 'A full AI rewrite that sounds like you, with your own API key or built-in credits.', state: 'soon', icon: 'sparkle' },
  { id: 'ocr', group: 'pdf', title: 'Read text from scans', description: 'Turn scanned pages and photos of text into real text.', state: 'soon', icon: 'eye' },
  { id: 'ai-detector', group: 'writing', title: 'AI detector', description: 'Show which parts of a text read as machine-written, and why.', state: 'soon', icon: 'search' },
  { id: 'watermarks', group: 'writing', title: 'Watermark checks', description: 'Check text for the statistical watermarks some AI providers add.', state: 'research', icon: 'shield' },
];

const ALIASES = { 'image-clean': 'metadata', pdf: 'pdf-merge' };

export function toolFromHash(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  if (path === 'studio') {
    const params = new URLSearchParams(query);
    return tools.find((tool) => tool.id === (params.get('inspect') === '1' ? 'characters' : params.get('mode') === 'clean' ? 'clean-text' : 'light-edit'));
  }
  return tools.find((tool) => tool.id === (ALIASES[path] || path)) || null;
}

export const statusLabel = (tool) => tool.state === 'research' ? 'Research' : tool.state === 'soon' ? 'Soon' : tool.isNew ? 'New' : '';
