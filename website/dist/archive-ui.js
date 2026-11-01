// Archives page: open one archive to see and save what's inside or switch its
// format, or pack any set of files into a new archive.
import { ARCHIVE_OUT, EXTENSION, MAX_ARCHIVE, archiveFormat, readArchive, writeArchive, stripArchiveExtension } from './conv-archive.js';
import { FORMATS } from './convert.js';
import { listRow, dropZone, formatBytes } from './files.js';
import * as island from './island.js';

const $ = (id) => document.getElementById(id);
let entries = [], source = null, generation = 0;
const SHOWN = 200;

export function showArchive(tool) {
  if (!tool) { generation++; return; }
  $('archive-title').textContent = tool.title;
  $('archive-description').textContent = tool.description;
}

function fail(message) {
  $('archive-error').textContent = message; $('archive-error').hidden = false;
}

function draw(mode) {
  $('archive-list').replaceChildren(...entries.slice(0, SHOWN).map(({ path, file }) => {
    const save = document.createElement('button');
    save.className = 'text-button'; save.textContent = 'Save';
    save.setAttribute('aria-label', 'Save ' + path);
    save.addEventListener('click', () => island.saveBlob(file, path.split('/').pop()));
    return listRow(path, formatBytes(file.size), mode === 'open' ? save : undefined);
  }));
  if (entries.length > SHOWN) $('archive-list').append(listRow('…and ' + (entries.length - SHOWN) + ' more', 'included when you save'));
  const from = source ? archiveFormat(source.name) : null;
  $('archive-targets-label').textContent = mode === 'open' ? 'Save everything as' : 'Pack into';
  $('archive-chips').replaceChildren(...ARCHIVE_OUT.filter((to) => to !== from).map((to) => {
    const chip = document.createElement('button');
    chip.className = 'chip'; chip.dataset.to = to; chip.textContent = FORMATS[to].label; chip.title = FORMATS[to].name;
    chip.addEventListener('click', () => pack(to));
    return chip;
  }));
}

export async function loadArchive(list) {
  const version = ++generation;
  $('archive-error').hidden = true; $('archive-output').hidden = true;
  const total = list.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_ARCHIVE) return fail('That’s over 300 MB in total.');
  if (list.length === 1 && archiveFormat(list[0].name)) {
    source = list[0];
    $('archive-summary').textContent = 'Opening ' + source.name + '…';
    $('archive-output').hidden = false; $('archive-list').replaceChildren(); $('archive-chips').replaceChildren();
    try {
      const found = await readArchive(source, (n) => { if (version === generation) $('archive-summary').textContent = 'Unpacked ' + n + (n === 1 ? ' file…' : ' files…'); });
      if (version !== generation) return;
      entries = found;
      const size = entries.reduce((sum, e) => sum + e.file.size, 0);
      $('archive-summary').textContent = source.name + ': ' + entries.length + (entries.length === 1 ? ' file, ' : ' files, ') + formatBytes(size) + ' unpacked';
      draw('open');
    } catch (error) { if (version === generation) { $('archive-output').hidden = true; fail(error.message); } }
    return;
  }
  source = null;
  entries = list.map((file) => ({ path: file.webkitRelativePath || file.name, file }));
  $('archive-summary').textContent = entries.length + (entries.length === 1 ? ' file, ' : ' files, ') + formatBytes(total) + ' to pack';
  $('archive-output').hidden = false;
  draw('pack');
}

async function pack(to) {
  if (!entries.length) return;
  const version = ++generation;
  const chips = document.querySelectorAll('#archive-chips .chip');
  chips.forEach((chip) => { chip.disabled = true; chip.classList.toggle('active', chip.dataset.to === to); });
  const base = source ? stripArchiveExtension(source.name) : entries.length === 1 ? entries[0].file.name.replace(/\.[^.]+$/, '') : 'files';
  const name = base + '.' + (EXTENSION[to] || to);
  const before = $('archive-summary').textContent;
  $('archive-summary').textContent = 'Packing ' + FORMATS[to].label + '…';
  try {
    const blob = await writeArchive(entries, to);
    if (version !== generation) return;
    island.saveBlob(blob, name);
    const size = entries.reduce((sum, e) => sum + e.file.size, 0);
    $('archive-summary').textContent = 'Saved ' + name + ' · ' + formatBytes(size) + ' → ' + formatBytes(blob.size);
  } catch (error) {
    if (version === generation) { $('archive-summary').textContent = before; fail(error.message || 'Couldn’t make that archive.'); }
  } finally { chips.forEach((chip) => { chip.disabled = false; }); }
}

$('archive-pick').addEventListener('click', () => $('archive-input').click());
$('archive-again').addEventListener('click', () => $('archive-input').click());
$('archive-input').addEventListener('change', () => { const list = [...$('archive-input').files]; $('archive-input').value = ''; if (list.length) loadArchive(list); });
dropZone($('archive-view'), loadArchive);
