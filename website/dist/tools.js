export const tools = [
  { id: 'word', title: 'AI text in Word', description: 'Polish AI-written wording in DOCX files.', state: 'ready', icon: 'file', color: 'blue', label: 'W', mode: 'office', action: 'Select Word file', accept: '.docx', isNew: true },
  { id: 'presentations', title: 'AI text in slides', description: 'Refine AI-written text in PPTX slides.', state: 'ready', icon: 'file', color: 'orange', label: 'P', mode: 'office', action: 'Select presentation', accept: '.pptx', isNew: true },
  { id: 'spreadsheets', title: 'AI text in spreadsheets', description: 'Refine AI prose. Keep XLSX formulas.', state: 'ready', icon: 'file', color: 'green', label: 'X', mode: 'office', action: 'Select spreadsheet', accept: '.xlsx', isNew: true },
  { id: 'metadata', title: 'AI file metadata', description: 'Clear Office author and app properties.', state: 'ready', icon: 'shield', color: 'blue', mode: 'office', action: 'Select Office file', accept: '.docx,.pptx,.xlsx', isNew: true },
  { id: 'writing-check', title: 'AI writing check', description: 'Find filler and leftover AI-assistant phrases.', state: 'ready', icon: 'search', color: 'green', mode: 'writing', action: 'Check AI wording', isNew: true },
  { id: 'text-file', title: 'AI text in files', description: 'Polish AI drafts in TXT or Markdown.', state: 'ready', icon: 'file', color: 'blue', label: 'TXT', mode: 'polish', action: 'Polish AI text', isNew: true },
  { id: 'clean-text', title: 'AI text cleanup', description: 'Clean copy-paste spacing in AI text.', state: 'ready', icon: 'clean', color: 'green', mode: 'clean', action: 'Clean AI text' },
  { id: 'light-edit', title: 'AI text polish', description: 'Simplify wordy phrases in AI drafts.', state: 'ready', icon: 'edit', color: 'blue', mode: 'polish', action: 'Polish AI text' },
  { id: 'characters', title: 'AI character check', description: 'Find invisible characters in AI text.', state: 'ready', icon: 'search', color: 'amber', mode: 'inspect', action: 'Check characters' },
  { id: 'ai-humanizer', title: 'AI humanizer', description: 'Rewrite AI text in your tone and voice.', state: 'soon', icon: 'sparkle', color: 'green' },
  { id: 'pdf', title: 'AI text in PDFs', description: 'Refine AI-written wording in PDF files.', state: 'soon', icon: 'file', color: 'red', label: 'PDF' },
  { id: 'ai-detector', title: 'AI detector', description: 'Review AI-writing signals.', state: 'soon', icon: 'search', color: 'amber' },
  { id: 'watermarks', title: 'AI watermark tools', description: 'Research statistical watermarks in AI text.', state: 'research', icon: 'shield', color: 'gray' },
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
