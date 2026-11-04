import { proposeEdits, applyEdits, inspectCharacters, inspectWriting, wordCount, MAX_CHARACTERS } from './engine.js';
import { toolFromHash } from './tools.js';
import { sectionFromHash, sectionOf } from './sections.js';
import { readTextFile } from './uploads.js';
import { showOffice, loadOfficeFile } from './office-ui.js';
import { showImages, loadImages, quickConvert } from './image-ui.js';
import { initHub, showHub, loadHub } from './hubs.js';
import { humanizeFile, textOf } from './quick.js';
import { showConvert, loadConvert, quickConvertFile } from './convert-ui.js';
import { showPdf, loadPdf, setPolishHandler } from './pdf-ui.js';
import { showWipe, loadWipe, quickWipe } from './wipe-ui.js';
import { showArchive, loadArchive } from './archive-ui.js';
import * as island from './island.js';
import { initMenu, initTabs } from './menu.js';
import { showOcr, loadOcr, setOcrPolishHandler } from './ocr-ui.js';
import { FORMATS } from './convert.js';
import { routeNote } from './notes.js';
import { formatBytes } from './images.js';

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

initMenu();
initTabs();

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

// #convert?from=pdf&to=docx gives the converter a heading and a preset target
// for that pair, so search results land on a page that says what it does.
function convertView(tool) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const from = params.get('from'), to = params.get('to');
  if (tool.id !== 'convert' || !FORMATS[from] || !FORMATS[to]) return tool;
  const note = routeNote(from, to);
  return { ...tool, from, to, title: FORMATS[from].label + ' to ' + FORMATS[to].label, description: (note.rows[0]?.[1] || 'Convert on this device') + '. Drop a ' + FORMATS[from].label + ' file and it converts straight away.', action: 'Choose a ' + FORMATS[from].label + ' file' };
}

function route() {
  if (location.hash === '#content') { $('content').focus(); return; }
  const section = sectionFromHash(location.hash);
  active = section ? null : toolFromHash(location.hash);
  const ready = active?.state === 'ready';
  const office = ready && active.mode === 'office';
  const image = ready && active.mode === 'image';
  const mode = ready ? active.mode : null;
  const separate = ['office', 'image', 'convert', 'pdf', 'wipe', 'archive', 'ocr'].includes(mode);
  $('hub-view').hidden = !!active;
  showHub(active ? false : section ? section.id : null);
  const owner = sectionOf(location.hash);
  for (const link of document.querySelectorAll('.tab-link')) link.classList.toggle('current', link.dataset.section === owner?.id);
  // Back links return to the format page the tool lives on, not the homepage.
  for (const back of document.querySelectorAll('.back-link')) {
    back.href = owner ? '#' + owner.id : '#home';
    back.lastChild.textContent = owner ? ' Back to ' + owner.title : ' Home';
  }
  $('tool-view').hidden = !ready || separate;
  $('office-view').hidden = !office;
  $('image-view').hidden = !image;
  $('convert-view').hidden = mode !== 'convert';
  $('pdf-view').hidden = mode !== 'pdf';
  $('wipe-view').hidden = mode !== 'wipe';
  $('archive-view').hidden = mode !== 'archive';
  $('ocr-view').hidden = mode !== 'ocr';
  showOffice(office ? active : null);
  showImages(image ? active : null);
  showConvert(mode === 'convert' ? convertView(active) : null);
  showPdf(mode === 'pdf' ? active : null);
  showWipe(mode === 'wipe' ? active : null);
  showArchive(mode === 'archive' ? active : null);
  showOcr(mode === 'ocr' ? active : null);
  $('upcoming-view').hidden = !active || ready;
  $('tools-menu').open = false;
  document.title = active ? active.title + ' · Whitewash' : section ? section.title + ' · Whitewash' : 'Whitewash: humanize, convert and clean any file';
  if (ready && !separate) {
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
const privacy = () => dialog('Privacy', [
  'Everything happens in this browser tab. Your text and files are never uploaded, there’s no account, and there are no analytics.',
  'Check it yourself: open your browser’s developer tools (F12), go to the Network tab, then humanize or convert a file. You’ll only see this site’s own scripts loading, never your file going out. The page’s security policy also blocks it from talking to any other server.',
  'Or load the page, turn on airplane mode, and humanize some pasted text: it still works. PDF, audio, archive and scan tools load extra code the first time you use them, so open them once while you’re online.',
  'The only thing saved is whether you picked light or dark mode. Reloading the page clears your draft. The site host still sees ordinary page requests, like any website.',
]);
$('privacy').addEventListener('click', privacy);
$('trust-check')?.addEventListener('click', privacy);
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

async function openTool(id) {
  if (location.hash !== '#' + id) {
    const changed = new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }));
    location.hash = id;
    await changed;
  }
}

// One click from a dial: the finished file downloads and the status pill says what changed.
async function quickHumanize(file, kind) {
  island.progress(kind === 'clean' ? 'Cleaning' : 'Humanizing', file.name, null);
  try {
    const result = await humanizeFile(file, kind, (step) => island.progress(step, file.name, null));
    island.saveBlob(result.blob, result.name);
    const readable = result.edits.length && !/\.(xlsx|xls|ods|csv)$/i.test(file.name);
    island.done('Saved ' + result.name, result.summary + (result.note ? '. ' + result.note : ''), readable ? { label: 'See changes', run: async () => openText(file, 'light-edit') } : undefined);
  } catch (error) { island.fail('That didn’t work', error.message); }
}

async function openText(file, toolId) {
  island.progress('Opening the text', file.name, null);
  try {
    let text = await textOf(file);
    island.hide();
    await openTool(toolId);
    if (text.length > MAX_CHARACTERS) { notify('Only the first 100,000 characters were loaded.'); text = text.slice(0, MAX_CHARACTERS); }
    replace(text, file.name, /\.md$/i.test(file.name) ? 'md' : 'txt', true);
    processDraft();
  } catch (error) { island.fail('Couldn’t open the text', error.message); }
}

// Files from the wheel go straight to the right tool.
async function runAction(action, files) {
  if (action.humanize) { for (const file of files) await quickHumanize(file, action.humanize); return; }
  if (action.text) { await openText(files[0], action.text); return; }
  if (action.hub) { await openTool(action.hub); loadHub(files); return; }
  if (action.convert) { quickConvert(files, action); return; }
  if (action.to) { for (const file of files) await quickConvertFile(file, action.to); return; }
  if (action.wipe) { quickWipe(files); return; }
  if (action.zip) { quickZip(files); return; }
  await openTool(action.tool);
  const tool = toolFromHash('#' + action.tool);
  if (tool.mode === 'office') loadOfficeFile(files[0]);
  else if (tool.mode === 'image') loadImages(files);
  else if (tool.mode === 'convert') loadConvert(files);
  else if (tool.mode === 'pdf') loadPdf(files);
  else if (tool.mode === 'wipe') loadWipe(files);
  else if (tool.mode === 'archive') loadArchive(files);
  else if (tool.mode === 'ocr') loadOcr(files);
  else loadFile(files[0]);
}
// From the wheel: pack the dropped files into one ZIP and save it.
async function quickZip(files) {
  island.progress('Packing a ZIP', files.length + (files.length === 1 ? ' file' : ' files'), null);
  try {
    const { writeArchive } = await import('./conv-archive.js');
    const name = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'files';
    const blob = await writeArchive(files.map((file) => ({ path: file.name, file })), 'zip');
    island.saveBlob(blob, name + '.zip');
    island.done('Saved ' + name + '.zip', files.length + (files.length === 1 ? ' file · ' : ' files · ') + formatBytes(blob.size), { label: 'Save again', run: () => island.saveBlob(blob, name + '.zip') });
  } catch (error) { island.fail('Couldn’t make the ZIP', error.message); }
}

async function polishExtracted(text, name) {
  await openTool('light-edit');
  if (text.length > MAX_CHARACTERS) { notify('That file has over 100,000 characters of text. Only the first part was loaded.'); text = text.slice(0, MAX_CHARACTERS); }
  replace(text, name, 'txt', true);
  processDraft();
}
setPolishHandler(polishExtracted);
setOcrPolishHandler(polishExtracted);
initHub({ run: runAction });
// A file dropped outside a drop area should never replace the page.
document.addEventListener('dragover', (event) => { if (!event.defaultPrevented && [...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
document.addEventListener('drop', (event) => { if (!event.defaultPrevented) event.preventDefault(); });

counts();
route();

