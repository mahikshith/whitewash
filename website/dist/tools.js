export const tools = [
  { id: 'text-file', title: 'Edit text file', description: 'Upload and polish TXT or Markdown.', state: 'ready', icon: 'file', color: 'blue', label: 'TXT', mode: 'polish', action: 'Polish text', isNew: true },
  { id: 'clean-text', title: 'Clean text', description: 'Remove unwanted spaces and characters.', state: 'ready', icon: 'clean', color: 'green', mode: 'clean', action: 'Clean text' },
  { id: 'light-edit', title: 'Light edit', description: 'Make wordy phrases simpler.', state: 'ready', icon: 'edit', color: 'blue', mode: 'polish', action: 'Polish text' },
  { id: 'characters', title: 'Character check', description: 'Find invisible characters in your text.', state: 'ready', icon: 'search', color: 'amber', mode: 'inspect', action: 'Check characters' },
  { id: 'ai-humanizer', title: 'AI humanizer', description: 'Rewrite with your tone and voice.', state: 'soon', icon: 'sparkle', color: 'green' },
  { id: 'word', title: 'Word editor', description: 'Edit text in Word documents.', state: 'soon', icon: 'file', color: 'blue', label: 'W' },
  { id: 'pdf', title: 'PDF editor', description: 'Work with text in PDF documents.', state: 'soon', icon: 'file', color: 'red', label: 'PDF' },
  { id: 'presentations', title: 'Presentation editor', description: 'Refine the text in your slides.', state: 'soon', icon: 'file', color: 'orange', label: 'P' },
  { id: 'spreadsheets', title: 'Spreadsheet editor', description: 'Edit prose cells in spreadsheets.', state: 'soon', icon: 'file', color: 'green', label: 'X' },
  { id: 'metadata', title: 'Metadata cleaner', description: 'Inspect and remove file properties.', state: 'soon', icon: 'shield', color: 'blue' },
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
