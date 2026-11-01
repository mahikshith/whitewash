import { FORMATS, detectFormat, targets, convertFile, acceptList, conversionCount } from './convert.js';
import { saveAll, listRow, dropZone, formatBytes } from './files.js';
import * as island from './island.js';

const $ = (id) => document.getElementById(id);
let active = null, files = [], from = null, last = null, generation = 0;

export function showConvert(tool) {
  if (!tool) { generation++; return; }
  if (active?.id !== tool.id) { files = []; from = null; last = null; render(); }
  active = tool;
  $('convert-title').textContent = tool.title;
  $('convert-description').textContent = tool.id === 'convert' ? 'Drop a file and pick what you want it to be. ' + conversionCount() + ' conversions, all done on your device.' : tool.description;
  $('convert-pick').textContent = files.length ? 'Choose a different file' : tool.action;
}

function render() {
  $('convert-files').hidden = !files.length;
  $('convert-files').replaceChildren(...files.map((file) => listRow(file.name, (FORMATS[from]?.name || 'Unknown') + ' · ' + formatBytes(file.size))));
  const options = from ? targets(from) : [];
  $('convert-targets').hidden = !options.length;
  $('convert-chips').replaceChildren(...options.map((to) => {
    const chip = document.createElement('button');
    chip.className = 'chip'; chip.dataset.to = to;
    chip.textContent = FORMATS[to].label;
    chip.title = FORMATS[to].name;
    if (from === 'pdf' && ['jpg', 'png', 'webp'].includes(to)) chip.title += ', one per page';
    chip.addEventListener('click', () => run(to));
    return chip;
  }));
  if (!last) $('convert-output').hidden = true;
  $('convert-error').hidden = true;
}

export function loadConvert(list) {
  last = null;
  const chosen = list.slice(0, 50);
  const formats = new Set(chosen.map(detectFormat));
  if (formats.has(null)) return fail('Whitewash doesn’t recognise ' + chosen.find((f) => !detectFormat(f)).name + '.');
  if (formats.size > 1) return fail('Pick files of one type at a time, like all Word files or all PNGs.');
  files = chosen; from = [...formats][0];
  if (!targets(from).length) return fail('There’s nothing to convert ' + FORMATS[from].label + ' files into yet.');
  render();
  $('convert-pick').textContent = 'Choose a different file';
  if (active?.to && [].concat(active.from).includes(from) && targets(from).includes(active.to)) run(active.to);
}

function fail(message) {
  files = []; from = null; render();
  $('convert-error').textContent = message; $('convert-error').hidden = false;
}

async function run(to) {
  if (!files.length) return;
  const version = ++generation;
  $('convert-error').hidden = true;
  $('convert-output').hidden = false;
  $('convert-download').hidden = true;
  $('convert-results').replaceChildren();
  document.querySelectorAll('#convert-chips .chip').forEach((chip) => { chip.disabled = true; chip.classList.toggle('active', chip.dataset.to === to); });
  const outputs = [], failed = [];
  for (const [i, file] of files.entries()) {
    const label = (files.length > 1 ? '(' + (i + 1) + '/' + files.length + ') ' : '') + FORMATS[from].label + ' → ' + FORMATS[to].label;
    $('convert-summary').textContent = 'Converting ' + label + '…';
    try { outputs.push(...await convertFile(file, to, (step) => { if (version === generation) $('convert-summary').textContent = step + '…'; })); }
    catch (error) { failed.push(file.name + ': ' + error.message); }
    if (version !== generation) return;
  }
  document.querySelectorAll('#convert-chips .chip').forEach((chip) => { chip.disabled = false; });
  if (!outputs.length) { $('convert-output').hidden = true; $('convert-error').textContent = failed.join(' '); $('convert-error').hidden = false; return; }
  const zipName = (files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'whitewash') + '-' + to + '.zip';
  last = await saveAll(outputs, zipName);
  $('convert-summary').textContent = 'Saved ' + last.name;
  $('convert-results').replaceChildren(...outputs.slice(0, 30).map((item) => listRow(item.name, formatBytes(item.blob.size))));
  if (outputs.length > 30) $('convert-results').append(listRow('…and ' + (outputs.length - 30) + ' more', 'in the zip'));
  $('convert-download').hidden = false;
  if (failed.length) { $('convert-error').textContent = failed.join(' '); $('convert-error').hidden = false; }
}

// One-step conversion from the wheel.
export async function quickConvertFile(file, to) {
  try {
    island.progress('Converting to ' + FORMATS[to].label, file.name, null);
    const outputs = await convertFile(file, to, (step) => island.progress(step, file.name, null));
    const saved = await saveAll(outputs, file.name.replace(/\.[^.]+$/, '') + '-' + to + '.zip');
    island.done('Saved ' + saved.name, formatBytes(file.size) + ' → ' + formatBytes(saved.blob.size), { label: 'Save again', run: () => island.saveBlob(saved.blob, saved.name) });
  } catch (error) { island.fail('That didn’t work', error.message); }
}

$('convert-input').accept = acceptList();
$('convert-pick').addEventListener('click', () => $('convert-input').click());
$('convert-again').addEventListener('click', () => $('convert-input').click());
$('convert-input').addEventListener('change', () => { const list = [...$('convert-input').files]; $('convert-input').value = ''; if (list.length) loadConvert(list); });
$('convert-download').addEventListener('click', () => { if (last) island.saveBlob(last.blob, last.name); });
dropZone($('convert-view'), loadConvert);
