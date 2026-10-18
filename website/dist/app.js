import { proposeEdits, applyEdits, inspectCharacters, inspectWriting, wordCount, MAX_CHARACTERS } from './engine.js';
import { tools, toolFromHash, statusLabel } from './tools.js';
import { readTextFile } from './uploads.js';
import { showOffice } from './office-ui.js';

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
  wrapper.className = 'tool-icon ' + tool.color;
  wrapper.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + tool.icon);
  svg.append(use); wrapper.append(svg);
  if (tool.label) { const label = document.createElement('small'); label.textContent = tool.label; wrapper.append(label); }
  return wrapper;
}

for (const tool of tools) {
  const card = document.createElement('a');
  card.href = '#' + tool.id;
  card.className = 'tool-card';
  card.dataset.tool = tool.id;
  const title = document.createElement('h2'); title.className = 'tool-flow';
  const before = document.createElement('span'); before.className = 'flow-before'; before.textContent = tool.before;
  const arrow = document.createElement('span'); arrow.className = 'flow-arrow'; arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true');
  const after = document.createElement('span'); after.className = 'flow-after'; after.textContent = tool.after;
  title.append(before, arrow, after);
  card.append(icon(tool), title);
  const label = statusLabel(tool);
  card.setAttribute('aria-label', tool.title + ': ' + tool.before + ' to ' + tool.after + (label ? '. ' + label : ''));
  if (label) {
    const status = document.createElement('span');
    status.className = 'status' + (tool.isNew ? ' new' : '');
    status.textContent = label; card.append(status);
  }
  $('tool-grid').append(card);
  const link = document.createElement('a');
  link.href = '#' + tool.id;
  link.append(document.createTextNode(tool.title));
  if (label) { const status = document.createElement('span'); status.className = 'status'; status.textContent = label; link.append(status); }
  $('tool-menu-list').append(link);
}

function counts() {
  $('input-count').textContent = wordCount($('draft').value).toLocaleString() + ' words';
  $('run').disabled = !$('draft').value.length;
  $('document-name').textContent = filename;
  $('undo-replace').hidden = !previous;
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
  $('home-view').hidden = !!active;
  $('tool-view').hidden = !ready || office;
  $('office-view').hidden = !office;
  showOffice(office ? active : null);
  $('upcoming-view').hidden = !active || ready;
  $('tools-menu').open = false;
  document.title = active ? active.title + ' — Whitewash' : 'Whitewash — All tools';
  if (ready && !office) {
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
      ? 'This tool is still in research.'
      : 'Not available yet. You can use the text tools today.';
    $('upcoming-status').textContent = active.state === 'research' ? 'In research' : 'Coming soon';
  }
  window.scrollTo(0, 0);
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
  $('changes-title').textContent = 'Review changes (' + edits.length + ')';
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
      const intro = document.createElement('p'); intro.textContent = 'Editorial notes only. These phrases do not establish AI authorship.';
      $('character-report').append(intro);
      for (const item of items) {
        const row = document.createElement('div'); row.className = 'office-change';
        const phrase = document.createElement('p'); phrase.textContent = item.text;
        const note = document.createElement('small'); note.textContent = item.note + ' Position ' + item.position + '.';
        row.append(phrase, note); $('character-report').append(row);
      }
      if (!items.length) { const p = document.createElement('p'); p.textContent = 'No matching phrases found.'; $('character-report').append(p); }
      $('edit-count').textContent = items.length + ' notes'; $('changes-panel').hidden = true;
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
      if (!items.length) { const p = document.createElement('p'); p.textContent = 'No special characters found.'; $('character-report').append(p); }
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
    event.preventDefault(); notify('Paste a smaller section. The limit is 100,000 characters.');
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
  catch { notify('Clipboard unavailable. Use Download instead.'); }
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
    if (revision !== version || active?.id !== target) { notify('The draft changed. Select the file again.'); return; }
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
  else notify('Drop one text file at a time.');
});

function dialog(title, paragraphs) {
  $('dialog-title').textContent = title;
  $('dialog-content').replaceChildren();
  for (const text of paragraphs) { const p = document.createElement('p'); p.textContent = text; $('dialog-content').append(p); }
  $('info-dialog').showModal();
}
$('privacy').addEventListener('click', () => dialog('Privacy', [
  'The working text and Office tools run in this tab. No draft or file is sent to a model, detector or processing server. Only your appearance preference is stored locally.',
  'Home and tool navigation keep the in-tab draft. Reloading or closing the tab clears it. Hosting access logs, downloaded files and your clipboard are separate.',
]));
$('help').addEventListener('click', () => dialog('Help', [
  'Choose a tool, add text, then use its main button. File processing accepts one UTF-8 TXT or Markdown file, up to 400 KB and 100,000 characters. Originals are preserved.',
  'Light edit uses English phrase rules. Review changes is optional; reject any edit before copying or downloading. Options protect exact phrases and control cleanup.',
  'Markdown protection is conservative, not a full renderer. Joiners and direction controls are retained. Character counts do not determine human authorship or statistical watermarks.',
  'Office tools accept one DOCX, PPTX or XLSX up to 10 MB; expanded package limit 30 MB, 1,000 parts, 5 MB per XML part, 100,000 editable characters and 500 edits. Encrypted, signed and macro-enabled files are rejected. ZIP64 is unsupported. English phrase edits use rules, not a model.',
  'Office copies preserve untouched package payloads. Edited XML is reserialized and checked for structural changes. A shorter phrase can alter line wrapping. Spreadsheet first-row labels, formulas, numbers and short cells remain unchanged. Review the copy in your Office app.',
  'Metadata cleaning clears standard core/custom properties, selected application properties and ZIP dates/comments. It does not scrub comments, revisions, embedded media, visible content or statistical watermarks. It is not complete anonymization.',
  'Tools marked Soon or Research are not available. PDF editing, AI rewriting, AI classification and provider watermark checks remain unconnected.',
]));
$('close-dialog').addEventListener('click', () => $('info-dialog').close());
$('info-dialog').addEventListener('click', (event) => {
  if (event.target !== $('info-dialog')) return;
  const box = $('info-dialog').getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('info-dialog').close();
});

counts();
route();

