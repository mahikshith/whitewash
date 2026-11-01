import { convertImage, formatBytes, uniqueNames } from './images.js';
import { replaceEntry, writeZip } from './office-zip.js';
import * as island from './island.js';

const $ = (id) => document.getElementById(id);
let active = null, sources = [], results = [], generation = 0;
const PRESETS = {
  'image-convert': { format: 'image/webp', longest: 0, fields: ['format', 'quality'] },
  'image-resize': { format: 'keep', longest: 1600, fields: ['size', 'format', 'quality'] },
  'image-clean': { format: 'keep', longest: 0, fields: ['quality'], suffix: '-clean' },
  'image-compress': { format: 'keep', longest: 2560, quality: 72, fields: ['size', 'format', 'quality'], suffix: '-small', squeeze: true },
};

function settings() {
  const preset = PRESETS[active.id];
  return {
    type: $('image-format').value,
    quality: Number($('image-quality').value) / 100,
    longest: preset.fields.includes('size') ? Math.max(16, Math.min(20000, Number($('image-longest').value) || 0)) : 0,
    suffix: preset.suffix || '',
    squeeze: !!preset.squeeze,
  };
}

export function showImages(tool) {
  if (!tool) { generation++; return; }
  if (active?.id !== tool.id) {
    const preset = PRESETS[tool.id];
    sources = []; results = [];
    $('image-format').value = preset.format;
    $('image-longest').value = preset.longest || 1600;
    $('image-quality').value = preset.quality || 88; $('image-quality-value').textContent = $('image-quality').value;
    $('image-output').hidden = true; $('image-error').hidden = true;
    for (const field of ['format', 'size', 'quality']) $('image-' + field + '-field').hidden = !preset.fields.includes(field);
  }
  active = tool;
  $('image-title').textContent = tool.title;
  $('image-description').textContent = tool.description;
  $('image-pick').textContent = sources.length ? 'Choose different images' : tool.action;
}

async function convertAll(files, options, onStep) {
  const done = [], failed = [];
  for (const [i, file] of files.entries()) {
    onStep?.(i, file);
    try {
      const item = await convertImage(file, options);
      if (options.squeeze) { const { squeeze } = await import('./image-squeeze.js'); item.blob = await squeeze(item.blob, options.quality); }
      done.push(item);
    }
    catch (error) { failed.push(error.message); }
  }
  uniqueNames(done.map((item) => item.name)).forEach((name, i) => { done[i].name = name; });
  return { done, failed };
}

async function bundle(items) {
  if (items.length === 1) return { blob: items[0].blob, name: items[0].name };
  const entries = new Map();
  for (const item of items) replaceEntry(entries, item.name, new Uint8Array(await item.blob.arrayBuffer()));
  return { blob: new Blob([writeZip(entries)], { type: 'application/zip' }), name: 'whitewash-images.zip' };
}

function summary(items) {
  const before = items.reduce((sum, item) => sum + item.before, 0);
  const after = items.reduce((sum, item) => sum + item.blob.size, 0);
  const change = before ? Math.round((1 - after / before) * 100) : 0;
  return formatBytes(before) + ' → ' + formatBytes(after) + (change > 0 ? ' (' + change + '% smaller)' : change < 0 ? ' (' + -change + '% bigger)' : '');
}

async function run() {
  if (!sources.length || !active) return;
  const version = ++generation;
  $('image-error').hidden = true;
  $('image-summary').textContent = 'Working…';
  $('image-output').hidden = false;
  $('image-download').disabled = true;
  const { done, failed } = await convertAll(sources, settings(), (i) => {
    if (version === generation) $('image-summary').textContent = 'Working on ' + (i + 1) + ' of ' + sources.length + '…';
  });
  if (version !== generation) return;
  results = done;
  $('image-results').replaceChildren(...done.map((item) => {
    const row = document.createElement('li');
    const name = document.createElement('strong'); name.textContent = item.name;
    const detail = document.createElement('span'); detail.textContent = item.width + ' × ' + item.height + ' · ' + formatBytes(item.before) + ' → ' + formatBytes(item.blob.size);
    row.append(name, detail); return row;
  }));
  $('image-summary').textContent = done.length ? (done.length === 1 ? '1 image ready' : done.length + ' images ready') + ' · ' + summary(done) : 'Nothing converted';
  $('image-download').disabled = !done.length;
  $('image-download').textContent = done.length > 1 ? 'Download all (.zip)' : 'Download';
  if (failed.length) { $('image-error').textContent = failed.join(' '); $('image-error').hidden = false; }
}

export function loadImages(files) {
  sources = files.slice(0, 50);
  $('image-pick').textContent = 'Choose different images';
  run();
}

// One-step conversion from the wheel: convert, download, report in the status pill.
export async function quickConvert(files, action) {
  const options = { type: action.convert, quality: action.convert === 'keep' ? 0.92 : 0.88, suffix: action.convert === 'keep' ? '-clean' : '' };
  const { done, failed } = await convertAll(files, options, (i, file) => island.progress(
    files.length > 1 ? 'Converting ' + (i + 1) + ' of ' + files.length : 'Converting', file.name, i / files.length));
  if (!done.length) { island.fail('That didn’t work', failed[0] || 'No images converted.'); return; }
  const file = await bundle(done);
  island.saveBlob(file.blob, file.name);
  island.done(action.convert === 'keep' ? 'Photo info removed' : 'Saved ' + file.name,
    summary(done) + (failed.length ? ' · ' + failed.length + ' skipped' : ''),
    { label: 'Save again', run: () => island.saveBlob(file.blob, file.name) });
}

$('image-pick').addEventListener('click', () => $('image-input').click());
$('image-again').addEventListener('click', () => $('image-input').click());
$('image-input').addEventListener('change', () => { loadImages([...$('image-input').files]); $('image-input').value = ''; });
for (const id of ['image-format', 'image-longest', 'image-quality']) $(id).addEventListener('change', run);
$('image-quality').addEventListener('input', () => { $('image-quality-value').textContent = $('image-quality').value; });
$('image-download').addEventListener('click', async () => {
  if (!results.length) return;
  const file = await bundle(results);
  island.saveBlob(file.blob, file.name);
});
$('image-view').addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
$('image-view').addEventListener('drop', (event) => { event.preventDefault(); loadImages([...event.dataTransfer.files]); });
