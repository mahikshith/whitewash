import { proposeEdits, applyEdits, inspectCharacters, inspectWriting, wordCount, MAX_CHARACTERS } from './engine.js';
import { tools, groups, toolFromHash, statusLabel } from './tools.js';
import { readTextFile } from './uploads.js';
import { showOffice, loadOfficeFile } from './office-ui.js';
import { showImages, loadImages, quickConvert } from './image-ui.js';
import { initWheel, openPicker } from './wheel.js';
import { PICKER_ACCEPT } from './actions.js';

const $ = (id) => document.getElementById(id);
let active = null;
let editorMode = null;
let edits = [];
let selected = new Set();
let original = '';
let resultText = '';
let filename = '';
let fileLoaded = false;
let previous = null;
let revision = 0;
let timer;

function notify(message) {
  $('notice').textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => { $('notice').textContent = ''; }, 6000);
}

function icon(tool) {
  const wrapper = document.createElement('span');
  wrapper.className = 'tool-icon';
  wrapper.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + tool.icon);
  svg.append(use); wrapper.append(svg);
  if (tool.label) { const label = document.createElement('small'); label.textContent = tool.label; wrapper.append(label); }
  return wrapper;
}

function statusChip(tool) {
  const label = statusLabel(tool);
  if (!label) return null;
  const status = document.createElement('span');
  status.className = 'status' + (tool.isNew ? ' new' : '');
  status.textContent = label;
  return status;
}

for (const group of groups) {
  const ready = tools.filter((tool) => tool.group === group.id && tool.state === 'ready');
  const section = document.createElement('section');
  section.className = 'tool-group'; section.id = group.id;
  const heading = document.createElement('div'); heading.className = 'group-heading';
  const title = document.createElement('h2'); title.textContent = group.title;
  const blurb = document.createElement('p'); blurb.textContent = group.blurb;
  heading.append(title, blurb);
  const grid = document.createElement('div'); grid.className = 'tool-grid';
  for (const tool of ready) {
    const card = document.createElement('a');
    card.href = '#' + tool.id; card.className = 'tool-card'; card.dataset.tool = tool.id;
    const name = document.createElement('h3'); name.textContent = tool.title;
    const text = document.createElement('p'); text.textContent = tool.description;
    card.append(icon(tool), name, text);
    const status = statusChip(tool);
    if (status) card.append(status);
    grid.append(card);
  }
  section.append(heading, grid);
  $('tool-groups').append(section);
  const menuGroup = document.createElement('div'); menuGroup.className = 'menu-group';
  const menuTitle = document.createElement('p'); menuTitle.textContent = group.title;
  menuGroup.append(menuTitle);
  for (const tool of tools.filter((item) => item.group === group.id)) {
    const link = document.createElement('a');
    link.href = '#' + tool.id;
    link.append(document.createTextNode(tool.title));
    const status = statusChip(tool);
    if (status) link.append(status);
    menuGroup.append(link);
  }
  $('tool-menu-list').append(menuGroup);
}
for (const tool of tools.filter((item) => item.state !== 'ready')) {
  const item = document.createElement('li');
  const link = document.createElement('a'); link.href = '#' + tool.id; link.textContent = tool.title;
  item.append(link, document.createTextNode(' ' + tool.description));
  $('coming-list').append(item);
}

function counts() {
  $('input-count').textContent = wordCount($('draft').value).toLocaleString() + ' words';
  $('run').disabled = !$('draft').value.length;
  $('document-name').textContent = filename;
  $('undo-replace').hidden = !previous;
  const hero = $('hero-draft').value.trim().length > 0;
  $('hero-run').disabled = !hero; $('hero-check').disabled = !hero;
}

function invalidate() {
  revision++;
  edits = [];
  selected.clear();
  $('output').hidden = true;
  counts();
}

function fileGate() {
  const waiting = active?.id === 'text-file' && !fileLoaded;
  $('file-entry').hidden = !waiting;
  $('editor').hidden = waiting;
}

function route() {
  if (location.hash === '#content') { $('content').focus(); return; }
  active = toolFromHash(location.hash);
  const ready = active?.state === 'ready';
  const office = ready && active.mode === 'office';
  const image = ready && active.mode === 'image';
  $('home-view').hidden = !!active;
  $('tool-view').hidden = !ready || office || image;
  $('office-view').hidden = !office;
  $('image-view').hidden = !image;
  showOffice(office ? active : null);
  showImages(image ? active : null);
  $('upcoming-view').hidden = !active || ready;
  $('tools-menu').open = false;
  document.title = active ? active.title + ' · Whitewash' : 'Whitewash: make AI drafts sound like you';
  if (ready && !office && !image) {
    $('page-title').textContent = active.title;
    $('page-description').textContent = active.description;
    $('run').textContent = active.action;
    $('options').hidden = active.mode === 'inspect';
    $('cleanup-settings').hidden = active.mode === 'writing';
    if (editorMode !== active.mode) { editorMode = active.mode; invalidate(); }
    fileGate();
  } else if (active && !ready) {
    $('upcoming-title').textContent = active.title;
    $('upcoming-description').textContent = active.state === 'research'
      ? active.description + ' We’re still working out whether this can be done honestly, so it isn’t built yet.'
      : active.description + ' Not built yet. The writing tools work today.';
    $('upcoming-status').textContent = active.state === 'research' ? 'Still researching' : 'Coming soon';
  }
  const section = !active && location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
  if (section?.classList.contains('tool-group')) section.scrollIntoView();
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (link && link.hash === location.hash) { event.preventDefault(); route(); }
  if (!$('tools-menu').contains(event.target)) $('tools-menu').open = false;
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $('tools-menu').open = false; });

function snapshot() {
  previous = { text: $('draft').value, format: $('format').value, filename, fileLoaded };
}

function replace(text, name, format, loaded) {
  snapshot();
  $('draft').value = text;
  $('format').value = format;
  filename = name;
  fileLoaded = loaded;
  invalidate();
  fileGate();
}

function renderResult() {
  resultText = applyEdits(original, edits, selected);
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const edit of edits) {
    fragment.append(document.createTextNode(original.slice(cursor, edit.start)));
    if (selected.has(edit.id)) {
      const mark = document.createElement('mark');
      mark.textContent = edit.after; mark.title = edit.reason;
      fragment.append(mark);
    } else fragment.append(document.createTextNode(edit.before));
    cursor = edit.end;
  }
  fragment.append(document.createTextNode(original.slice(cursor)));
  $('result').replaceChildren(fragment);
  $('edit-count').textContent = selected.size + (selected.size === 1 ? ' edit' : ' edits');
  $('copy').disabled = !resultText;
  $('download').disabled = !resultText;
  $('changes-title').textContent = 'See changes (' + edits.length + ')';
  $('keep-all').disabled = selected.size === edits.length;
  $('reject-all').disabled = !selected.size;
}

function changes() {
  $('changes').replaceChildren();
  for (const edit of edits) {
    const row = document.createElement('label'); row.className = 'change'; row.title = edit.reason;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(edit.id);
    checkbox.setAttribute('aria-label', 'Keep edit ' + (edit.id + 1) + ': ' + edit.reason);
    checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(edit.id); else selected.delete(edit.id); renderResult(); });
    const text = document.createElement('span');
    const before = document.createElement('del');
    before.textContent = edit.before.replace(/[\u00a0\u202f]/g, '[nonbreaking space]').replace(/\u00ad/g, '[soft hyphen]').replace(/\u200b/g, '[zero-width space]').replace(/\ufeff/g, '[BOM]');
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
    const after = document.createElement('ins'); after.textContent = edit.after === ' ' ? '[space]' : edit.after || '[remove]';
    text.append(before, arrow, after); row.append(checkbox, text); $('changes').append(row);
  }
  renderResult();
}

function processDraft() {
  if (active?.state !== 'ready' || !$('draft').value.length) return;
  try {
    if ($('draft').value.length > MAX_CHARACTERS) throw new Error('Keep the draft under 100,000 characters.');
    const inspecting = ['inspect', 'writing'].includes(active.mode);
    $('result').hidden = inspecting;
    $('character-report').hidden = !inspecting;
    $('copy').hidden = inspecting;
    $('download').hidden = inspecting;
    $('output-title').textContent = inspecting ? active.title : 'Result';
    if (active.mode === 'writing') {
      const items = inspectWriting($('draft').value, $('format').value, $('locks').value.split(/\r?\n/).filter(Boolean));
      $('character-report').replaceChildren();
      const intro = document.createElement('p'); intro.textContent = 'Stock phrases worth a second look. Finding them proves nothing about who wrote the text.';
      $('character-report').append(intro);
      for (const item of items) {
        const row = document.createElement('div'); row.className = 'office-change';
        const phrase = document.createElement('p'); phrase.textContent = item.text;
        const note = document.createElement('small'); note.textContent = item.note + ' Character ' + item.position.toLocaleString() + '.';
        row.append(phrase, note); $('character-report').append(row);
      }
      if (!items.length) { const p = document.createElement('p'); p.textContent = 'Nothing flagged. No stock phrases found.'; $('character-report').append(p); }
      $('edit-count').textContent = items.length === 1 ? '1 flag' : items.length + ' flags'; $('changes-panel').hidden = true;
    } else if (inspecting) {
      const items = inspectCharacters($('draft').value);
      $('character-report').replaceChildren();
      for (const item of items) {
        const row = document.createElement('div'); row.className = 'character-row'; row.title = item.note;
        const code = document.createElement('code'); code.textContent = item.code;
        const name = document.createElement('strong'); name.textContent = item.name;
        const count = document.createElement('span'); count.textContent = '× ' + item.count;
        row.append(code, name, count); $('character-report').append(row);
      }
      if (!items.length) { const p = document.createElement('p'); p.textContent = 'No hidden characters.'; $('character-report').append(p); }
      $('edit-count').textContent = '';
      $('changes-panel').hidden = true;
    } else {
      original = $('draft').value;
      edits = proposeEdits(original, { mode: active.mode, format: $('format').value, spaces: $('spaces').checked, softHyphens: $('soft-hyphens').checked, zeroWidth: $('zero-width').checked, punctuation: $('punctuation').checked, locks: $('locks').value.split(/\r?\n/).filter(Boolean) });
      selected = new Set(edits.map((edit) => edit.id));
      $('changes-panel').hidden = !edits.length;
      $('changes-panel').open = false;
      changes();
    }
    $('output').hidden = false;
    $('output').scrollIntoView({ block: 'nearest' });
  } catch (error) { invalidate(); notify(error.message); }
}

$('run').addEventListener('click', processDraft);
$('draft').addEventListener('input', invalidate);
$('draft').addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text/plain');
  if (text && $('draft').value.length - ($('draft').selectionEnd - $('draft').selectionStart) + text.length > MAX_CHARACTERS) {
    event.preventDefault(); notify('That’s over 100,000 characters. Paste a smaller piece.');
  }
});
for (const id of ['format', 'spaces', 'soft-hyphens', 'zero-width', 'punctuation']) $(id).addEventListener('change', invalidate);
$('locks').addEventListener('input', invalidate);
$('sample').addEventListener('click', () => {
  replace(active.mode === 'writing' ? 'It is important to note that this is a seamless process.\n\nWe completed the review on Friday. I hope this helps.' : 'At this point in time, we want to utilize customer feedback.\n\nThe estimate is INR\u00a048,500 for 12 teams. Keep the original figures in order to review the budget.', '', 'txt', false);
  processDraft();
});
$('clear').addEventListener('click', () => { replace('', '', 'txt', fileLoaded); $('draft').focus(); });
$('undo-replace').addEventListener('click', () => {
  if (!previous) return;
  const restored = previous; previous = null;
  $('draft').value = restored.text; $('format').value = restored.format; filename = restored.filename; fileLoaded = restored.fileLoaded;
  invalidate(); fileGate();
  if (active.id === 'text-file' && !fileLoaded && restored.text) location.hash = 'light-edit';
});

$('keep-all').addEventListener('click', () => { selected = new Set(edits.map((edit) => edit.id)); changes(); });
$('reject-all').addEventListener('click', () => { selected.clear(); changes(); });
$('copy').addEventListener('click', async () => {
  if ($('output').hidden || ['inspect', 'writing'].includes(active?.mode)) return;
  try { await navigator.clipboard.writeText(resultText); notify('Copied.'); }
  catch { notify('Couldn’t copy. Use Download instead.'); }
});
$('download').addEventListener('click', () => {
  if ($('output').hidden || ['inspect', 'writing'].includes(active?.mode)) return;
  const extension = $('format').value;
  const url = URL.createObjectURL(new Blob([resultText], { type: extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = (filename || 'draft').replace(/\.(txt|md|markdown)$/i, '') + '-edited.' + extension;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function loadFile(file) {
  if (!file || active?.state !== 'ready') return;
  const version = revision;
  const target = active.id;
  try {
    const input = await readTextFile(file);
    if (revision !== version || active?.id !== target) { notify('The text changed while the file was loading. Try again.'); return; }
    replace(input.text, input.name, input.format, true);
    processDraft();
  } catch (error) { notify(error.message); }
  finally { $('file-input').value = ''; }
}
for (const id of ['upload', 'select-file']) $(id).addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => loadFile($('file-input').files[0]));
$('tool-view').addEventListener('dragover', (event) => {
  if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); $('tool-view').classList.add('drop-active'); }
});
$('tool-view').addEventListener('dragleave', (event) => { if (!$('tool-view').contains(event.relatedTarget)) $('tool-view').classList.remove('drop-active'); });
$('tool-view').addEventListener('drop', (event) => {
  event.preventDefault(); $('tool-view').classList.remove('drop-active');
  if (event.dataTransfer.files.length === 1) loadFile(event.dataTransfer.files[0]);
  else notify('One text file at a time, please.');
});

function dialog(title, paragraphs) {
  $('dialog-title').textContent = title;
  $('dialog-content').replaceChildren();
  for (const text of paragraphs) { const p = document.createElement('p'); p.textContent = text; $('dialog-content').append(p); }
  $('info-dialog').showModal();
}
$('privacy').addEventListener('click', () => dialog('Privacy', [
  'Everything happens in this browser tab. Your text and files are never uploaded, there’s no account, and there are no analytics.',
  'The only thing saved is whether you picked light or dark mode. Reloading the page clears your draft. The site host still sees ordinary page requests, like any website.',
]));
$('help').addEventListener('click', () => dialog('Help', [
  'Paste text or drop a file, pick what you want done, then copy or download the result. Your original is never changed.',
  'Polishing uses a list of English phrase rules, not an AI model. Open “See changes” to undo any edit you don’t like.',
  'Text files: .txt or .md, up to 400 KB. Office files: .docx, .pptx or .xlsx, up to 10 MB. Password-protected, signed and macro files won’t open.',
  'Office files keep their formatting. Only body text, slide text and long spreadsheet cells get edited. Formulas, numbers, header rows, notes and footnotes are left alone. Shorter wording can move line breaks, so give the copy a quick look.',
  'Remove file info clears author, company, app and date fields. Comments, tracked changes and images inside the file stay.',
  'Images: JPG, PNG, WebP, GIF, BMP or AVIF, up to 40 MB each and 50 at a time. Saved copies drop location and camera data. GIFs lose their animation.',
  'Nothing here can prove who wrote a text or remove AI watermarks. Be wary of any tool that says it can.',
]));
$('close-dialog').addEventListener('click', () => $('info-dialog').close());
$('info-dialog').addEventListener('click', (event) => {
  if (event.target !== $('info-dialog')) return;
  const box = $('info-dialog').getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('info-dialog').close();
});

// Home: the hero box hands its draft to the full tool page.
async function openTool(id) {
  if (location.hash !== '#' + id) {
    const changed = new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }));
    location.hash = id;
    await changed;
  }
}
async function heroRun(id) {
  const text = $('hero-draft').value;
  if (!text.trim()) return;
  await openTool(id);
  replace(text, '', 'txt', false);
  processDraft();
}
$('hero-draft').addEventListener('input', counts);
$('hero-run').addEventListener('click', () => heroRun('light-edit'));
$('hero-check').addEventListener('click', () => heroRun('writing-check'));
$('hero-draft').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) heroRun('light-edit'); });
$('hero-sample').addEventListener('click', () => {
  $('hero-draft').value = 'It is important to note that, at this point in time, our team has the ability to utilize customer feedback on a daily basis in order to ship a seamless experience.\n\nI hope this helps!';
  counts(); $('hero-draft').focus();
});

// Files from the wheel go straight to the right tool.
async function runAction(action, files) {
  if (action.convert) { quickConvert(files, action); return; }
  await openTool(action.tool);
  const tool = toolFromHash('#' + action.tool);
  if (tool.mode === 'office') loadOfficeFile(files[0]);
  else if (tool.mode === 'image') loadImages(files);
  else loadFile(files[0]);
}
initWheel({ isActive: () => !$('home-view').hidden, onRun: runAction, onReject: notify });
$('pick-input').accept = PICKER_ACCEPT;
$('pick-any').addEventListener('click', () => $('pick-input').click());
$('pick-input').addEventListener('change', () => {
  const files = [...$('pick-input').files];
  $('pick-input').value = '';
  if (!files.length) return;
  const box = $('pick-any').getBoundingClientRect();
  openPicker(files, box.left + box.width / 2, box.top + box.height / 2);
});
// A file dropped outside a drop area should never replace the page.
document.addEventListener('dragover', (event) => { if (!event.defaultPrevented && [...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
document.addEventListener('drop', (event) => { if (!event.defaultPrevented) event.preventDefault(); });

counts();
route();

