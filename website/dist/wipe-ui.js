// Metadata wiper: photos, PDFs and Office files. Each file is wiped, then the
// clean copy is opened again and checked before it is offered for download.
import { scanImage, wipeImage, verifyWiped } from './image-meta.js';
import { processOffice } from './office.js';
import { saveAll, readBytes, formatBytes, dropZone } from './files.js';
import * as island from './island.js';

const $ = (id) => document.getElementById(id);
let outputs = [], last = null, generation = 0;
const IMAGE = /\.(jpe?g|png|webp|gif)$/i, OFFICE = /\.(docx|pptx|xlsx)$/i, PDF = /\.pdf$/i, TEXT = /\.(txt|md|markdown|csv|json)$/i;
const OFFICE_LABEL = { title: 'Title', subject: 'Subject', creator: 'Author', keywords: 'Keywords', description: 'Comments', lastModifiedBy: 'Last edited by', revision: 'Revision number', created: 'Created', modified: 'Last saved', lastPrinted: 'Last printed', category: 'Category', contentStatus: 'Status', Application: 'Made with', AppVersion: 'App version', Company: 'Company', Manager: 'Manager', Template: 'Template', TotalTime: 'Editing time', HyperlinkBase: 'Link base' };
const OFFICE_MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };

export function showWipe(tool) {
  if (!tool) { generation++; return; }
  $('wipe-title').textContent = tool.title;
  $('wipe-description').textContent = tool.description;
}

async function wipeOne(file, options) {
  if (file.size > 100_000_000) throw new Error('Over 100 MB.');
  const extension = file.name.split('.').pop().toLowerCase();
  if (IMAGE.test(file.name)) {
    const bytes = await readBytes(file);
    const found = scanImage(bytes).items.filter((item) => item.risk !== 'low' || !options.keepColor);
    const result = wipeImage(bytes, { keepColorProfile: options.keepColor });
    return { found, remaining: verifyWiped(result.bytes), bytes: result.bytes, type: MIME[extension] };
  }
  if (PDF.test(file.name)) {
    const { wipePdf } = await import('./conv-pdf.js');
    const result = await wipePdf(await readBytes(file));
    return { found: result.removed, remaining: result.remaining, bytes: result.bytes, type: MIME.pdf };
  }
  if (OFFICE.test(file.name)) {
    const result = await processOffice(await readBytes(file), file.name, { metadata: true });
    const found = result.report.properties.filter((p) => String(p.before ?? '').trim()).map((p) => ({ label: OFFICE_LABEL[p.name] || p.name, detail: p.before, risk: /creator|lastModifiedBy|Company|Manager|author/i.test(p.name) ? 'high' : 'medium' }));
    return { found, remaining: [], bytes: result.bytes, type: OFFICE_MIME[extension] };
  }
  if (TEXT.test(file.name)) return { found: [], remaining: [], note: 'Plain text files don’t carry hidden metadata inside them. Only the file name and your computer’s own records can give anything away.' };
  throw new Error('Use a photo (JPG, PNG, WebP, GIF), a PDF, or a Word, PowerPoint or Excel file.');
}

function card(file, result, error, newName) {
  const box = document.createElement('article'); box.className = 'wipe-card';
  const head = document.createElement('header');
  const name = document.createElement('strong'); name.textContent = file.name;
  const status = document.createElement('span'); status.className = 'status ' + (error ? 'bad' : result.remaining.length ? 'warn' : 'new');
  status.textContent = error ? 'Couldn’t wipe' : result.note ? 'Nothing to wipe' : result.remaining.length ? 'Check needed' : result.found.length ? 'Clean' : 'Already clean';
  head.append(name, status); box.append(head);
  const text = (content, className) => { const p = document.createElement('p'); p.textContent = content; if (className) p.className = className; box.append(p); };
  if (error) { text(error.message, 'bad'); return box; }
  if (result.note) { text(result.note); return box; }
  if (result.found.length) {
    const list = document.createElement('ul'); list.className = 'found-list';
    for (const item of result.found) {
      const li = document.createElement('li');
      const risk = document.createElement('span'); risk.className = 'risk ' + item.risk; risk.textContent = item.risk === 'high' ? 'Sensitive' : item.risk === 'low' ? 'Minor' : 'Revealing';
      const label = document.createElement('b'); label.textContent = item.label;
      const detail = document.createElement('span'); detail.textContent = item.detail ? ' ' + item.detail : '';
      li.append(risk, label, detail); list.append(li);
    }
    text('Found and removed:');
    box.append(list);
  } else text('No hidden info found. You still get a fresh copy.');
  text(result.remaining.length ? 'Still there after wiping: ' + result.remaining.map((r) => r.label).join(', ') + '.' : 'Checked the new copy: nothing left. ' + (newName ? 'Saved as ' + newName + '.' : ''), result.remaining.length ? 'bad' : 'ok');
  return box;
}

export async function loadWipe(list) {
  const version = ++generation;
  const options = { keepColor: $('wipe-keep-color').checked, neutral: $('wipe-neutral').checked };
  outputs = []; last = null;
  $('wipe-error').hidden = true;
  $('wipe-output').hidden = false;
  $('wipe-results').replaceChildren();
  $('wipe-download').hidden = true;
  let n = 0;
  for (const file of list.slice(0, 100)) {
    $('wipe-summary').textContent = 'Wiping ' + (++n) + ' of ' + Math.min(list.length, 100) + '…';
    let result = null, error = null, newName = '';
    try {
      result = await wipeOne(file, options);
      if (result.bytes) {
        const extension = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '';
        newName = options.neutral ? 'file-' + (outputs.length + 1) + extension : file.name.replace(/(\.[^.]+)$/, '-clean$1');
        outputs.push({ blob: new Blob([result.bytes], { type: result.type }), name: newName });
      }
    } catch (e) { error = e; }
    if (version !== generation) return;
    $('wipe-results').append(card(file, result, error, newName));
  }
  if (!outputs.length) { $('wipe-summary').textContent = 'Nothing to download'; return; }
  last = await saveAll(outputs, 'clean-files.zip');
  $('wipe-summary').textContent = 'Wiped ' + outputs.length + (outputs.length === 1 ? ' file' : ' files') + ' · saved ' + last.name + ' (' + formatBytes(last.blob.size) + ')';
  $('wipe-download').hidden = false;
}

// From the wheel: wipe straight away and report in the status pill.
export async function quickWipe(files) {
  island.progress('Wiping metadata', files.length > 1 ? files.length + ' files' : files[0].name, null);
  const done = [], issues = [];
  let found = 0;
  for (const file of files) {
    try {
      const result = await wipeOne(file, { keepColor: true });
      found += result.found.length;
      if (result.remaining.length) issues.push(file.name);
      if (result.bytes) done.push({ blob: new Blob([result.bytes], { type: result.type }), name: file.name.replace(/(\.[^.]+)$/, '-clean$1') });
    } catch (error) { issues.push(file.name + ': ' + error.message); }
  }
  if (!done.length) { island.fail('Couldn’t wipe that', issues[0] || 'No supported files.'); return; }
  const saved = await saveAll(done, 'clean-files.zip');
  island.done(issues.length ? 'Wiped, with warnings' : 'Metadata wiped', (found ? 'Removed ' + found + (found === 1 ? ' item' : ' items') : 'Nothing hidden was found') + ' · saved ' + saved.name, { label: 'Save again', run: () => island.saveBlob(saved.blob, saved.name) });
}

$('wipe-pick').addEventListener('click', () => $('wipe-input').click());
$('wipe-again').addEventListener('click', () => $('wipe-input').click());
$('wipe-input').addEventListener('change', () => { const list = [...$('wipe-input').files]; $('wipe-input').value = ''; if (list.length) loadWipe(list); });
$('wipe-download').addEventListener('click', () => { if (last) island.saveBlob(last.blob, last.name); });
dropZone($('wipe-view'), loadWipe);
