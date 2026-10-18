export const tools = [
  { id: 'word', title: 'Refine Word text', description: 'Simplify wording inside DOCX documents.', state: 'ready', icon: 'file', color: 'blue', label: 'W', mode: 'office', action: 'Select Word file', accept: '.docx', isNew: true },
  { id: 'presentations', title: 'Refine slide text', description: 'Polish wording in your PPTX slides.', state: 'ready', icon: 'file', color: 'orange', label: 'P', mode: 'office', action: 'Select presentation', accept: '.pptx', isNew: true },
  { id: 'spreadsheets', title: 'Refine spreadsheet text', description: 'Polish prose cells. Keep XLSX formulas.', state: 'ready', icon: 'file', color: 'green', label: 'X', mode: 'office', action: 'Select spreadsheet', accept: '.xlsx', isNew: true },
  { id: 'metadata', title: 'Metadata cleaner', description: 'Clear Office author and file properties.', state: 'ready', icon: 'shield', color: 'blue', mode: 'office', action: 'Select Office file', accept: '.docx,.pptx,.xlsx', isNew: true },
  { id: 'writing-check', title: 'Writing check', description: 'Find filler and assistant-style phrases.', state: 'ready', icon: 'search', color: 'green', mode: 'writing', action: 'Check writing', isNew: true },
  { id: 'text-file', title: 'Refine a text file', description: 'Polish wording in TXT or Markdown.', state: 'ready', icon: 'file', color: 'blue', label: 'TXT', mode: 'polish', action: 'Polish text', isNew: true },
  { id: 'clean-text', title: 'Clean text', description: 'Remove unwanted spaces and characters.', state: 'ready', icon: 'clean', color: 'green', mode: 'clean', action: 'Clean text' },
  { id: 'light-edit', title: 'Light edit', description: 'Make wordy phrases simpler.', state: 'ready', icon: 'edit', color: 'blue', mode: 'polish', action: 'Polish text' },
  { id: 'characters', title: 'Character check', description: 'Find invisible characters in your text.', state: 'ready', icon: 'search', color: 'amber', mode: 'inspect', action: 'Check characters' },
  { id: 'ai-humanizer', title: 'AI humanizer', description: 'Rewrite with your tone and voice.', state: 'soon', icon: 'sparkle', color: 'green' },
  { id: 'pdf', title: 'Refine PDF text', description: 'Improve wording inside PDF documents.', state: 'soon', icon: 'file', color: 'red', label: 'PDF' },
  { id: 'ai-detector', title: 'AI detector', description: 'Review AI-writing signals.', state: 'soon', icon: 'search', color: 'amber' },
  { id: 'watermarks', title: 'Watermark tools', description: 'Evaluate statistical text watermarks.', state: 'research', icon: 'shield', color: 'gray' },
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
