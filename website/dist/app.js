import { proposeEdits, applyEdits, inspectCharacters, wordCount, validateFile, MAX_CHARACTERS } from './engine.js';

const $ = (id) => document.getElementById(id);
const sample = `Good work deserves clear words.\n\nAt this point in time, we have a large number of ideas for the next release. We want to utilize customer feedback in order to make the experience simpler.\n\nThe revised estimate is INR\u00a048,500, with delivery on 21 October. The plan has the ability to support 12 teams. We will review progress on a daily basis.\n\nOur promise is simple: fewer distractions, thoughtful details, and room for your own voice.`;
let mode = 'polish';
let edits = [];
let selected = new Set();
let reviewed = false;
let resultText = '';
let originalAtReview = '';
let previousDraft = null;
let noticeTimer;

function notice(message) {
  $('notice').textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').textContent = ''; }, 6500);
}

function options() {
  return { mode, format: $('format').value, spaces: $('spaces').checked, softHyphens: $('soft-hyphens').checked, zeroWidth: $('zero-width').checked, locks: $('locks').value.split(/\r?\n/).filter(Boolean) };
}

function updateCounts() {
  const count = wordCount($('draft').value);
  $('input-count').textContent = `${count.toLocaleString()} words · ${$('draft').value.length.toLocaleString()} characters`;
  const chars = inspectCharacters($('draft').value);
  $('character-badge').textContent = chars.reduce((sum, item) => sum + item.count, 0);
  $('review').disabled = !$('draft').value.trim();
}

function invalidate() {
  reviewed = false;
  edits = [];
  selected = new Set();
  $('result-status').textContent = 'Review needed';
  $('changes').replaceChildren();
  const message = document.createElement('p');
  message.className = 'empty-changes';
  message.textContent = 'Ready when you are. Review this draft to see suggestions.';
  $('changes').append(message);
  $('result').replaceChildren();
  const outputMessage = document.createElement('span');
  outputMessage.className = 'empty-output';
  outputMessage.textContent = 'Your reviewed draft will appear here.';
  $('result').append(outputMessage);
  $('output-count').textContent = 'No result yet';
  $('edit-count').textContent = '0';
  $('review-subtitle').textContent = 'Every suggestion is yours to keep.';
  for (const id of ['copy', 'download', 'accept-all', 'reject-all']) $(id).disabled = true;
  updateCounts();
}

function renderResult() {
  if (!reviewed) return;
  try { resultText = applyEdits(originalAtReview, edits, selected); }
  catch (error) { invalidate(); notice(error.message); return; }
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const edit of edits) {
    fragment.append(document.createTextNode(originalAtReview.slice(cursor, edit.start)));
    if (selected.has(edit.id)) {
      const mark = document.createElement('mark');
      mark.textContent = edit.after;
      mark.title = edit.reason;
      fragment.append(mark);
    } else fragment.append(document.createTextNode(edit.before));
    cursor = edit.end;
  }
  fragment.append(document.createTextNode(originalAtReview.slice(cursor)));
  $('result').replaceChildren(fragment);
  $('output-count').textContent = `${wordCount(resultText).toLocaleString()} words`;
  $('result-status').textContent = selected.size ? `${selected.size} edit${selected.size === 1 ? '' : 's'} applied` : 'Original retained';
  $('edit-count').textContent = edits.length;
  $('review-subtitle').textContent = edits.length ? `${selected.size} of ${edits.length} suggestions accepted.` : 'A clean starting point. Nothing to change.';
  $('copy').disabled = !resultText;
  $('download').disabled = !resultText;
  $('accept-all').disabled = !edits.length || selected.size === edits.length;
  $('reject-all').disabled = !selected.size;
}

function visibleText(value) {
  return value.replace(/\u00a0/g, '⍽').replace(/\u202f/g, '⍽').replace(/\u00ad/g, '[soft hyphen]').replace(/\u200b/g, '[zero-width space]').replace(/\ufeff/g, '[BOM]') || '[remove]';
}

function renderChanges() {
  $('changes').replaceChildren();
  if (!edits.length) {
    const message = document.createElement('p');
    message.className = 'empty-changes';
    message.textContent = mode === 'clean' ? 'No eligible cleanup changes. Meaningful Unicode and protected content are retained.' : 'No matching light edits. This preview checks a small set of wordy phrases; it does not judge your writing.';
    $('changes').append(message);
  }
  for (const edit of edits) {
    const label = document.createElement('label');
    label.className = 'change';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(edit.id);
    checkbox.setAttribute('aria-label', `Accept suggestion ${edit.id + 1}: ${edit.reason}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(edit.id); else selected.delete(edit.id);
      renderResult();
    });
    const body = document.createElement('span');
    const category = document.createElement('strong');
    category.textContent = edit.kind === 'clarity' ? 'A clearer phrase' : 'Copy-paste cleanup';
    const before = document.createElement('del');
    before.textContent = visibleText(edit.before);
    const arrow = document.createElement('span');
    arrow.className = 'change-arrow';
    arrow.textContent = ' → ';
    const after = document.createElement('ins');
    after.textContent = edit.after === ' ' ? '[regular space]' : visibleText(edit.after);
    const reason = document.createElement('small');
    reason.textContent = edit.reason;
    body.append(category, before, arrow, after, reason);
    label.append(checkbox, body);
    $('changes').append(label);
  }
  renderResult();
}

function review(announce = true) {
  if (!$('draft').value.trim()) { invalidate(); if (announce) notice('Add a draft first.'); return; }
  try {
    originalAtReview = $('draft').value;
    edits = proposeEdits(originalAtReview, options());
    selected = new Set(edits.map((edit) => edit.id));
    reviewed = true;
    renderChanges();
    updateCounts();
    if (announce) {
      notice(edits.length ? `${edits.length} suggestion${edits.length === 1 ? '' : 's'} ready. Keep or reject each one.` : 'Review complete. No matching suggestions.');
      setView('result');
    }
  } catch (error) { invalidate(); notice(error.message); }
}

function setView(view) {
  document.querySelector('.editors').dataset.view = view;
  $('show-original').setAttribute('aria-pressed', String(view === 'original'));
  $('show-result').setAttribute('aria-pressed', String(view === 'result'));
}

function replaceDraft(value, name, format, isSample = false) {
  previousDraft = { text: $('draft').value, name: $('document-name').textContent, format: $('format').value, sample: !$('sample-tag').hidden };
  $('undo-source').disabled = false;
  $('draft').value = value;
  $('document-name').textContent = name;
  $('format').value = format;
  $('sample-tag').hidden = !isSample;
  invalidate();
  setView('original');
}

async function importFile(file) {
  if (!file) return;
  try {
    const format = validateFile(file.name, file.size);
    const bytes = await file.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.length > MAX_CHARACTERS) throw new Error('Keep this draft under 100,000 characters.');
    if (text.includes('\0')) throw new Error('This file contains binary data. Choose a plain UTF-8 text file.');
    replaceDraft(text, file.name, format);
    notice('Imported locally. Review changes when you are ready.');
    $('draft').focus();
  } catch (error) {
    notice(error instanceof TypeError ? 'This file is not valid UTF-8 text. Your current draft is unchanged.' : error.message);
  } finally { $('file-input').value = ''; }
}

$('draft').addEventListener('input', () => { $('sample-tag').hidden = true; invalidate(); });
$('draft').addEventListener('paste', (event) => {
  const pasted = event.clipboardData?.getData('text/plain');
  if (pasted && $('draft').value.length - ($('draft').selectionEnd - $('draft').selectionStart) + pasted.length > MAX_CHARACTERS) {
    event.preventDefault(); notice('That paste exceeds 100,000 characters. Paste a smaller section; your current draft is unchanged.');
  }
});
$('review').addEventListener('click', () => review());
for (const name of ['clean', 'polish']) $(`mode-${name}`).addEventListener('click', () => {
  mode = name;
  $('mode-clean').setAttribute('aria-pressed', String(name === 'clean'));
  $('mode-polish').setAttribute('aria-pressed', String(name === 'polish'));
  $('mode-help').textContent = name === 'clean' ? 'Character cleanup · no model calls' : 'Rule-based polish · no model calls';
  invalidate();
});
for (const id of ['format', 'spaces', 'soft-hyphens', 'zero-width']) $(id).addEventListener('change', invalidate);
$('locks').addEventListener('input', invalidate);
$('show-original').addEventListener('click', () => setView('original'));
$('show-result').addEventListener('click', () => setView('result'));
$('accept-all').addEventListener('click', () => { selected = new Set(edits.map((edit) => edit.id)); renderChanges(); });
$('reject-all').addEventListener('click', () => { selected.clear(); renderChanges(); });
$('load-sample').addEventListener('click', () => { replaceDraft(sample, 'Sample draft.txt', 'txt', true); review(false); notice('Sample loaded. Undo replace restores your previous draft.'); });
$('clear-draft').addEventListener('click', () => { replaceDraft('', 'Untitled draft.txt', 'txt'); $('draft').focus(); });
$('undo-source').addEventListener('click', () => {
  if (!previousDraft) return;
  const previous = previousDraft;
  $('draft').value = previous.text;
  $('document-name').textContent = previous.name;
  $('format').value = previous.format;
  $('sample-tag').hidden = !previous.sample;
  previousDraft = null;
  $('undo-source').disabled = true;
  invalidate();
  notice('Previous draft restored.');
});
$('import-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => importFile($('file-input').files[0]));
const workspace = document.querySelector('.studio');
workspace.addEventListener('dragover', (event) => {
  if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); workspace.classList.add('drop-active'); }
});
workspace.addEventListener('dragleave', (event) => { if (!workspace.contains(event.relatedTarget)) workspace.classList.remove('drop-active'); });
workspace.addEventListener('drop', (event) => {
  event.preventDefault(); workspace.classList.remove('drop-active');
  if (event.dataTransfer.files.length !== 1) { notice('Drop one .txt or .md file at a time.'); return; }
  importFile(event.dataTransfer.files[0]);
});
$('copy').addEventListener('click', async () => {
  if (!reviewed) return;
  try { await navigator.clipboard.writeText(resultText); notice('Reviewed draft copied.'); }
  catch { notice('Clipboard access was unavailable. Download the draft, or select the result to copy it.'); }
});
$('download').addEventListener('click', () => {
  if (!reviewed) return;
  const extension = $('format').value;
  const blob = new Blob([resultText], { type: extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${$('document-name').textContent.replace(/\.(txt|md|markdown)$/i, '')}-edited.${extension}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Edited copy downloaded. Your original file is unchanged.');
});

function openDialog(title, paragraphs) {
  $('dialog-title').textContent = title;
  $('dialog-content').replaceChildren();
  for (const text of paragraphs) { const p = document.createElement('p'); p.textContent = text; $('dialog-content').append(p); }
  $('info-dialog').showModal();
}
$('close-dialog').addEventListener('click', () => $('info-dialog').close());
$('info-dialog').addEventListener('click', (event) => { if (event.target === $('info-dialog')) { const rect = $('info-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('info-dialog').close(); } });
$('open-privacy').addEventListener('click', () => openDialog('Your words, on your device.', [
  'This preview processes your draft in this browser tab. It sends no document text to a model or detector and uses no analytics, cookies or draft storage. Reloading or closing the tab clears the in-app draft.',
  'Only your light/dark appearance preference is saved in this browser. Your draft and edits are not saved.',
  'The hosting service still receives normal page requests and may keep access logs. Your clipboard and downloaded files are managed by your device.',
  'TXT and Markdown exports contain the reviewed text. Original Office/PDF metadata is not available from pasted text, and this preview does not sanitize those documents.',
]));
$('open-principles').addEventListener('click', () => openDialog('A better edit earns your trust.', [
  'Make the writing useful. Keep its meaning. Let the writer see and choose every change. Those are the principles behind Whitewash.',
  'This early version offers local character cleanup and a small set of English phrase edits. It protects numbers, quotes, links, user-locked phrases, and conservative Markdown structures. It does not infer human authorship.',
  'Our next quality gate is a blinded comparison of naturalness, factual preservation and time to a usable document. We have not measured superiority over QuillBot or Undetectable AI.',
]));
$('open-limits').addEventListener('click', () => openDialog('What this preview can do', [
  'Working now: local TXT/Markdown import, character inspection, optional cleanup, rule-based English light edits, per-change review, copy and download. Limits: one UTF-8 file, 400 KB, 100,000 characters and 500 suggestions per review. Larger suggestion sets require a smaller section.',
  'Markdown protection is conservative: code fences, indented code, headings, link/table/HTML/math-like lines and frontmatter are left unchanged. This is a text editor, not a full Markdown renderer.',
  'Not connected yet: model-assisted rewriting, saved voice profiles, Office/PDF export, metadata sanitization, AI classification or provider watermark verification. This preview cannot certify that text is human-written or watermark-free.',
]));
$('open-inspector').addEventListener('click', () => {
  const items = inspectCharacters($('draft').value);
  openDialog('See the invisible details.', [items.length ? 'These characters may be intentional. Cleanup preferences control eligible changes; quotes, code and locked phrases remain protected. Positions below use UTF-16 offsets.' : 'No tracked special characters found. This does not check statistical watermarks or determine who wrote the text.']);
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'character-item';
    const heading = document.createElement('strong');
    const code = document.createElement('span'); code.className = 'character-code'; code.textContent = item.code;
    heading.append(code, `${item.name} × ${item.count}`);
    const description = document.createElement('small'); description.textContent = item.note;
    const positions = document.createElement('small'); positions.textContent = `Position${item.positions.length === 1 ? '' : 's'}: ${item.positions.join(', ')}${item.count > 10 ? ' (first 10)' : ''}`;
    row.append(heading, description, positions); $('dialog-content').append(row);
  }
});

$('draft').value = sample;
review(false);
