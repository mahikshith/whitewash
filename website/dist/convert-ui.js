// The converter: formats on the left, a dial of what the chosen format can
// become on the right. Drop a file (or pick a format first) and click a
// segment: the converted file downloads straight away.
import { FORMATS, detectFormat, targets, convertFile, acceptList, conversionCount, inputFormats } from './convert.js';
import { saveAll, listRow, dropZone, formatBytes } from './files.js';
import * as island from './island.js';
import { routeNote, renderNote } from './notes.js';
import { createDial } from './dial.js';

const $ = (id) => document.getElementById(id);
let active = null, files = [], from = null, pending = null, last = null, generation = 0, dial = null;

const GROUPS = [
  ['Documents', ['docx', 'pdf', 'md', 'txt', 'html', 'odt', 'epub', 'pptx', 'rtf']],
  ['Data', ['xlsx', 'csv', 'tsv', 'json', 'ods']],
  ['Images', ['jpg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg']],
  ['Audio', ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'weba']],
  ['Video (sound only)', ['mp4', 'mov', 'mkv', 'webm']],
  ['Subtitles', ['srt', 'vtt']],
  ['Archives', ['zip', '7z', 'rar', 'tar', 'tgz', 'gz']],
];
const POPULAR = ['pdf', 'docx', 'xlsx', 'jpg', 'png', 'mp3', 'md', 'zip', 'pptx', 'csv'];

function fromPanel() {
  const ins = new Set(inputFormats());
  $('convert-from').replaceChildren(...GROUPS.map(([title, ids]) => {
    const group = document.createElement('div'); group.className = 'from-group';
    const h = document.createElement('h3'); h.textContent = title;
    const chips = document.createElement('div'); chips.className = 'from-chips';
    chips.append(...ids.filter((id) => ins.has(id) && FORMATS[id]).map((id) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.from = id; b.textContent = FORMATS[id].label; b.title = FORMATS[id].name;
      b.addEventListener('click', () => choose(id));
      return b;
    }));
    group.append(h, chips);
    return group;
  }));
}

function choose(id) {
  if (from !== id) { files = []; last = null; }
  from = id; pending = null;
  render();
}

export function showConvert(tool) {
  if (!tool) { generation++; return; }
  const key = tool.id + ':' + (tool.to || '') + ':' + (tool.from || '');
  if (active?.key !== key) {
    files = []; last = null; pending = null;
    from = tool.from ? [].concat(tool.from)[0] : null;
    if (tool.to && from) pending = tool.to;
    active = { ...tool, key };
    render();
  }
  $('convert-title').textContent = tool.id === 'convert' && !tool.to ? 'Convert any file' : tool.title;
  $('convert-description').textContent = tool.id === 'convert' && !tool.to ? 'Pick a format on the left or drop a file, then click what you want on the dial. ' + conversionCount() + ' conversions, all on your device.' : tool.description;
}

function note(option) {
  if (option?.from) { renderNote($('convert-note'), { title: FORMATS[option.from].name, rows: [['Turns into', targets(option.from).map((t) => FORMATS[t].label).join(', ')]], foot: 'Click to pick it.' }); return; }
  if (option?.to) { renderNote($('convert-note'), routeNote(from, option.to)); return; }
  if (!from) { renderNote($('convert-note'), { title: 'How it works', rows: [['1', 'Drop a file, or pick its format on the left'], ['2', 'The dial shows everything it can become'], ['3', 'Click one. The new file downloads']], foot: 'Documents keep their headings, lists, tables and links.' }); return; }
  const target = pending && targets(from).includes(pending) ? pending : null;
  if (target) { renderNote($('convert-note'), routeNote(from, target)); return; }
  renderNote($('convert-note'), { title: files.length ? 'Pick a format' : FORMATS[from].name, rows: [[files.length ? 'File' : 'Next', files.length ? files.map((f) => f.name).slice(0, 3).join(', ') + (files.length > 3 ? '…' : '') : 'Drop a ' + FORMATS[from].label + ' file, or click a format on the dial and choose the file after']], foot: 'Point at a format to see what you get.' });
}

function render() {
  document.querySelectorAll('#convert-from .chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.from === from));
  $('convert-files').hidden = !files.length;
  $('convert-files').replaceChildren(...files.slice(0, 6).map((file) => listRow(file.name, formatBytes(file.size))));
  if (!from) {
    dial.set(POPULAR.filter((id) => FORMATS[id]).map((id) => ({ id: 'from-' + id, label: FORMATS[id].label, hint: 'Convert a ' + FORMATS[id].name, from: id })), { title: 'Drop a file', sub: 'or pick what it is', icon: 'arrow-up', state: 'idle' });
  } else {
    const list = targets(from);
    dial.set(list.map((to) => ({ id: 'to-' + to, label: FORMATS[to].label, hint: 'Make it ' + FORMATS[to].name, to, primary: to === pending })),
      files.length ? { title: files.length === 1 ? files[0].name : files.length + ' files', sub: 'click a format', icon: 'check', state: 'loaded' }
        : { title: FORMATS[from].label, sub: 'drop a file or click here', icon: 'arrow-up', state: 'idle' });
  }
  if (!last) $('convert-output').hidden = true;
  $('convert-error').hidden = true;
  note(null);
}

export function loadConvert(list) {
  last = null;
  const chosen = list.slice(0, 50);
  const formats = new Set(chosen.map(detectFormat));
  if (formats.has(null)) return fail('Whitewash doesn’t recognise ' + chosen.find((f) => !detectFormat(f)).name + '.');
  if (formats.size > 1) return fail('Pick files of one type at a time, like all Word files or all PNGs.');
  const format = [...formats][0];
  if (!targets(format).length) return fail('There’s nothing to convert ' + FORMATS[format].label + ' files into yet.');
  if (pending && !targets(format).includes(pending)) pending = null;
  files = chosen; from = format;
  render();
  if (pending) run(pending);
}

function fail(message) {
  files = []; render();
  $('convert-error').textContent = message; $('convert-error').hidden = false;
}

function pickOption(option) {
  if (option.from) { choose(option.from); return; }
  if (!files.length) { pending = option.to; render(); openPicker(); return; }
  run(option.to);
}

function openPicker() {
  $('convert-input').accept = from ? '.' + (from === 'jpg' ? 'jpg,.jpeg' : from === 'md' ? 'md,.markdown' : from === 'html' ? 'html,.htm' : from) : acceptList();
  $('convert-input').click();
}

async function run(to) {
  if (!files.length) return;
  pending = null;
  const version = ++generation;
  $('convert-error').hidden = true;
  $('convert-output').hidden = false;
  $('convert-download').hidden = true;
  $('convert-results').replaceChildren();
  dial.busy(true);
  const outputs = [], failed = [];
  for (const [i, file] of files.entries()) {
    const label = (files.length > 1 ? '(' + (i + 1) + '/' + files.length + ') ' : '') + FORMATS[from].label + ' → ' + FORMATS[to].label;
    $('convert-summary').textContent = 'Converting ' + label + '…';
    island.progress('Converting to ' + FORMATS[to].label, file.name, null);
    try { outputs.push(...await convertFile(file, to, (step) => { if (version === generation) $('convert-summary').textContent = step + '…'; })); }
    catch (error) { failed.push(file.name + ': ' + error.message); }
    if (version !== generation) { dial.busy(false); return; }
  }
  dial.busy(false);
  if (!outputs.length) { island.hide(); $('convert-output').hidden = true; $('convert-error').textContent = failed.join(' '); $('convert-error').hidden = false; return; }
  const zipName = (files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'whitewash') + '-' + to + '.zip';
  last = await saveAll(outputs, zipName);
  island.done('Saved ' + last.name, formatBytes(files.reduce((s, f) => s + f.size, 0)) + ' → ' + formatBytes(last.blob.size), { label: 'Save again', run: () => island.saveBlob(last.blob, last.name) });
  $('convert-summary').textContent = 'Saved ' + last.name;
  $('convert-results').replaceChildren(...outputs.slice(0, 8).map((item) => listRow(item.name, formatBytes(item.blob.size))));
  if (outputs.length > 8) $('convert-results').append(listRow('…and ' + (outputs.length - 8) + ' more', 'in the zip'));
  $('convert-download').hidden = false;
  if (failed.length) { $('convert-error').textContent = failed.join(' '); $('convert-error').hidden = false; }
}

// One-step conversion from a dial elsewhere on the site.
export async function quickConvertFile(file, to) {
  try {
    island.progress('Converting to ' + FORMATS[to].label, file.name, null);
    const outputs = await convertFile(file, to, (step) => island.progress(step, file.name, null));
    const saved = await saveAll(outputs, file.name.replace(/\.[^.]+$/, '') + '-' + to + '.zip');
    island.done('Saved ' + saved.name, formatBytes(file.size) + ' → ' + formatBytes(saved.blob.size), { label: 'Save again', run: () => island.saveBlob(saved.blob, saved.name) });
  } catch (error) { island.fail('That didn’t work', error.message); }
}

dial = createDial($('convert-dial'), { onPick: pickOption, onHub: openPicker, onHover: note });
fromPanel();
$('convert-again').addEventListener('click', openPicker);
$('convert-input').addEventListener('change', () => { const list = [...$('convert-input').files]; $('convert-input').value = ''; if (list.length) loadConvert(list); });
$('convert-download').addEventListener('click', () => { if (last) island.saveBlob(last.blob, last.name); });
dropZone($('convert-view'), loadConvert);
