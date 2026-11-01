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
  $('office-limits').textContent = tool.accept.toUpperCase().replaceAll('.', '').replaceAll(',', ', ') + ' · up to 10 MB · or drop it here';
  updateAction();
}

function updateAction() {
  $('office-action').disabled = false;
  $('office-action').textContent = output ? 'Download the new copy' : source ? 'Run again' : active?.action || 'Choose a file';
  $('office-another').hidden = !source;
}

async function run() {
  if (!source || !active) return;
  const version = ++generation, tool = active, input = source;
  output = null;
  $('office-output').hidden = true; $('office-error').hidden = true;
  $('office-action').disabled = true; $('office-action').textContent = 'Working…';
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
      ? (rows.length ? 'Removed ' + rows.length + (rows.length === 1 ? ' field' : ' fields') : 'No info fields found. The file was already clean.')
      : rows.length ? rows.length + (rows.length === 1 ? ' edit made' : ' edits made') : 'Nothing to change. This one already reads fine.';
    $('office-scope').textContent = tool.id === 'metadata'
      ? 'Author, company, app and date fields are gone. Comments, tracked changes and images inside the file are still there.'
      : tool.id === 'word' ? 'Edited the body text and tables. Headers, footnotes, links, fields and tracked changes were left alone.'
        : tool.id === 'presentations' ? 'Edited the text on your slides. Speaker notes, layouts, fields and links were left alone.'
          : 'Edited long text cells only. Formulas, numbers, header rows and short cells were left alone.';
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
    $('office-review-title').textContent = 'See changes (' + rows.length + ')';
    $('office-output').hidden = false;
    $('office-summary').focus();
  } catch (error) {
    if (generation !== version) return;
    $('office-error').textContent = error.message;
    $('office-error').hidden = false;
  } finally { if (generation === version) updateAction(); }
}

export async function loadOfficeFile(file) {
  if (!file || !active) return;
  const version = ++generation, tool = active;
  output = null; source = null;
  $('office-output').hidden = true; $('office-filename').hidden = true; $('office-error').hidden = true;
  try {
    if (!tool.accept.split(',').some((extension) => file.name.toLowerCase().endsWith(extension))) throw new Error('This tool takes ' + tool.accept.replaceAll(',', ', ') + ' files.');
    if (file.size > 10_000_000) throw new Error('That file is over 10 MB.');
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
$('office-input').addEventListener('change', () => loadOfficeFile($('office-input').files[0]));
for (const id of ['office-mode', 'office-punctuation', 'office-locks']) $(id).addEventListener('input', () => {
  generation++; output = null; $('office-output').hidden = true; updateAction();
});
$('office-view').addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
$('office-view').addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer.files.length === 1) loadOfficeFile(event.dataTransfer.files[0]);
  else { $('office-error').textContent = 'One file at a time, please.'; $('office-error').hidden = false; }
});
