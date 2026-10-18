import { processOffice } from './office.js';
const $ = (id) => document.getElementById(id);
let active = null, lastTool = null, source = null, output = null, generation = 0;

export function showOffice(tool) {
  active = tool;
  generation++;
  if (!tool) return;
  if (lastTool !== tool.id) {
    source = null; output = null;
    $('office-output').hidden = true; $('office-error').hidden = true; $('office-filename').hidden = true;
  }
  lastTool = tool.id;
  $('office-title').textContent = tool.title;
  $('office-description').textContent = tool.description;
  $('office-input').accept = tool.accept;
  $('office-options').hidden = tool.id === 'metadata';
  $('office-limits').textContent = tool.accept.toUpperCase().replaceAll('.', '').replaceAll(',', ' / ') + ' · up to 10 MB · processed on your device';
  updateAction();
}

function updateAction() {
  $('office-action').disabled = false;
  $('office-action').textContent = output ? 'Download cleaned copy' : source ? 'Apply options' : active?.action || 'Select file';
  $('office-another').hidden = !source;
}

async function run() {
  if (!source || !active) return;
  const version = ++generation, tool = active, input = source;
  output = null;
  $('office-output').hidden = true; $('office-error').hidden = true;
  $('office-action').disabled = true; $('office-action').textContent = 'Processing…';
  try {
    const result = await processOffice(input.bytes, input.name, {
      metadata: tool.id === 'metadata', mode: $('office-mode').value,
      punctuation: $('office-punctuation').checked, locks: $('office-locks').value.split(/\r?\n/).filter(Boolean),
    });
    if (generation !== version || active?.id !== tool.id) return;
    output = result;
    const report = result.report;
    const rows = tool.id === 'metadata' ? report.properties : report.edits;
    $('office-summary').textContent = tool.id === 'metadata'
      ? rows.length + ' properties removed'
      : rows.length ? rows.length + (rows.length === 1 ? ' edit applied' : ' edits applied') : 'No matching edits. Original content retained.';
    $('office-scope').textContent = tool.id === 'metadata'
      ? 'Core and custom properties cleared; selected app properties and ZIP dates cleared. Comments, revisions and embedded media remain.'
      : tool.id === 'word' ? 'Main body and tables. Fields, links, tracked revisions, code, headers and footnotes are kept.'
        : tool.id === 'presentations' ? 'Slide text only. Notes, masters, fields and links are kept.'
          : 'Prose cells only. Formulas, numbers, first-row labels and short cells are kept.';
    $('office-changes').replaceChildren();
    for (const item of rows) {
      const row = document.createElement('div'); row.className = 'office-change';
      const text = document.createElement('p'), note = document.createElement('small');
      text.textContent = tool.id === 'metadata' ? item.name + ': ' + (item.before || '(empty)') + ' → removed' : item.before + ' → ' + (item.after || '[removed]');
      note.textContent = tool.id === 'metadata' ? item.part : item.reason;
      row.append(text, note); $('office-changes').append(row);
    }
    $('office-review').hidden = !rows.length;
    $('office-review').open = false;
    $('office-review-title').textContent = 'Review changes (' + rows.length + ')';
    $('office-output').hidden = false;
    $('office-summary').focus();
  } catch (error) {
    if (generation !== version) return;
    $('office-error').textContent = error.message;
    $('office-error').hidden = false;
  } finally { if (generation === version) updateAction(); }
}

async function load(file) {
  if (!file || !active) return;
  const version = ++generation, tool = active;
  output = null; source = null;
  $('office-output').hidden = true; $('office-filename').hidden = true; $('office-error').hidden = true;
  try {
    if (!tool.accept.split(',').some((extension) => file.name.toLowerCase().endsWith(extension))) throw new Error('Choose ' + tool.accept + ' for this tool.');
    if (file.size > 10_000_000) throw new Error('Choose a file smaller than 10 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (generation !== version || active?.id !== tool.id) return;
    source = { bytes, name: file.name };
    $('office-filename').textContent = file.name; $('office-filename').hidden = false;
    await run();
  } catch (error) {
    if (generation !== version) return;
    $('office-error').textContent = error.message; $('office-error').hidden = false;
    updateAction();
  } finally { $('office-input').value = ''; }
}

$('office-action').addEventListener('click', () => {
  if (!output) { if (source) run(); else $('office-input').click(); return; }
  const url = URL.createObjectURL(new Blob([output.bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a'); link.href = url;
  link.download = source.name.replace(/\.(docx|pptx|xlsx)$/i, '-cleaned.$1');
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('office-another').addEventListener('click', () => $('office-input').click());
$('office-input').addEventListener('change', () => load($('office-input').files[0]));
for (const id of ['office-mode', 'office-punctuation', 'office-locks']) $(id).addEventListener('input', () => {
  generation++; output = null; $('office-output').hidden = true; updateAction();
});
$('office-view').addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
$('office-view').addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer.files.length === 1) load(event.dataTransfer.files[0]);
  else { $('office-error').textContent = 'Choose one Office file at a time.'; $('office-error').hidden = false; }
});
