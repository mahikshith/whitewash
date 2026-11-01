export const groups = [
  { id: 'writing', title: 'Writing', blurb: 'Paste a draft, get a cleaner one back.' },
  { id: 'documents', title: 'Documents', blurb: 'Fix the words inside Office files. The layout stays put.' },
  { id: 'images', title: 'Images', blurb: 'Convert, shrink and clean up photos.' },
];

export const tools = [
  { id: 'light-edit', group: 'writing', title: 'Polish a draft', description: 'Cuts wordy phrases like “in order to” and “at this point in time”. You see every change.', state: 'ready', icon: 'edit', mode: 'polish', action: 'Polish it' },
  { id: 'writing-check', group: 'writing', title: 'Spot AI tells', description: 'Flags stock phrases such as “it is important to note” and “I hope this helps”.', state: 'ready', icon: 'search', mode: 'writing', action: 'Check it' },
  { id: 'clean-text', group: 'writing', title: 'Clean pasted text', description: 'Fixes the odd spaces and hidden hyphens that come along when you copy from a chatbot or a PDF.', state: 'ready', icon: 'clean', mode: 'clean', action: 'Clean it' },
  { id: 'characters', group: 'writing', title: 'Find hidden characters', description: 'Lists the invisible characters in your text and how many of each.', state: 'ready', icon: 'eye', mode: 'inspect', action: 'Show them' },
  { id: 'text-file', group: 'writing', title: 'Polish a text file', description: 'Drop a .txt or .md file and get an edited copy back.', state: 'ready', icon: 'file', label: 'TXT', mode: 'polish', action: 'Polish it' },
  { id: 'word', group: 'documents', title: 'Word documents', description: 'Polishes the text in a .docx and keeps the formatting.', state: 'ready', icon: 'file', label: 'W', mode: 'office', action: 'Choose a Word file', accept: '.docx' },
  { id: 'presentations', group: 'documents', title: 'Slide decks', description: 'Polishes the text on your .pptx slides. Notes and layouts are left alone.', state: 'ready', icon: 'file', label: 'P', mode: 'office', action: 'Choose a slide deck', accept: '.pptx' },
  { id: 'spreadsheets', group: 'documents', title: 'Spreadsheets', description: 'Polishes long text cells in an .xlsx. Formulas and numbers stay as they are.', state: 'ready', icon: 'file', label: 'X', mode: 'office', action: 'Choose a spreadsheet', accept: '.xlsx' },
  { id: 'metadata', group: 'documents', title: 'Remove file info', description: 'Strips the author, company and app fields hidden in Office files.', state: 'ready', icon: 'shield', mode: 'office', action: 'Choose an Office file', accept: '.docx,.pptx,.xlsx' },
  { id: 'image-convert', group: 'images', title: 'Convert images', description: 'Turn JPG, PNG and WebP into each other. Works on a whole batch at once.', state: 'ready', icon: 'image', mode: 'image', action: 'Choose images', isNew: true },
  { id: 'image-resize', group: 'images', title: 'Resize images', description: 'Make photos smaller in pixels and in file size.', state: 'ready', icon: 'resize', mode: 'image', action: 'Choose images', isNew: true },
  { id: 'image-clean', group: 'images', title: 'Remove photo info', description: 'Strips location, camera and date data from photos before you share them.', state: 'ready', icon: 'pin', mode: 'image', action: 'Choose photos', isNew: true },
  { id: 'pdf', group: 'documents', title: 'PDF tools', description: 'Merge, split and reorder PDFs, and pull the text out to polish.', state: 'soon', icon: 'file', label: 'PDF' },
  { id: 'ai-humanizer', group: 'writing', title: 'Rewrite in your voice', description: 'A full rewrite that sounds like you, not a template.', state: 'soon', icon: 'sparkle' },
  { id: 'ai-detector', group: 'writing', title: 'AI detector', description: 'Show which parts of a text read as machine-written, and why.', state: 'soon', icon: 'search' },
  { id: 'watermarks', group: 'writing', title: 'Watermark checks', description: 'Check text for the statistical watermarks some AI providers add.', state: 'research', icon: 'shield' },
];

export function toolFromHash(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  if (path === 'studio') {
    const params = new URLSearchParams(query);
    return tools.find((tool) => tool.id === (params.get('inspect') === '1' ? 'characters' : params.get('mode') === 'clean' ? 'clean-text' : 'light-edit'));
  }
  return tools.find((tool) => tool.id === path) || null;
}

export const statusLabel = (tool) => tool.state === 'research' ? 'Research' : tool.state === 'soon' ? 'Soon' : tool.isNew ? 'New' : '';
