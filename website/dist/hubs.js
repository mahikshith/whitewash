// The homepage and the section pages (Humanize, PDF, Compress, Audio, Archives,
// Privacy). Each is a big dial beside a short explanation. Before a file: the
// dial's segments open tools. After a file is dropped: they do things to it,
// in one click.
import { createDial } from './dial.js';
import { sections, tools } from './tools.js';
import { idleOptions, sectionActions, PICKER_ACCEPT } from './actions.js';
import { actionNote, renderNote } from './notes.js';
import { dropZone, formatBytes } from './files.js';

const $ = (id) => document.getElementById(id);
let current = undefined, files = [], hooks = null, dial = null;

const HOME = {
  title: 'Drop a file. Pick one thing. Done.',
  lede: 'Humanize AI drafts and documents, convert anything, shrink PDFs, wipe hidden metadata. One click, and nothing leaves your device.',
};

function idleNote() {
  const section = sections.find((s) => s.id === current);
  if (!section) return { title: 'How it works', rows: [['1', 'Drop any file on the dial, or click the middle'], ['2', 'The dial shows what you can do with it'], ['3', 'Click one. You get the finished file']], foot: 'Word, PowerPoint, Excel, PDF, text, images, audio, archives.' };
  return { title: section.title, rows: [['Drop', section.blurb]], foot: 'Or point at the dial to see each tool.' };
}

function loadedNote() {
  const list = files.length === 1 ? files[0].name + ' · ' + formatBytes(files[0].size) : files.length + ' files · ' + formatBytes(files.reduce((s, f) => s + f.size, 0));
  return { title: 'Pick what to do', rows: [['File', list], ['Next', 'Click a segment. The result downloads straight away, or opens its tool if it needs one more choice']], foot: 'Point at a segment to see exactly what you get.' };
}

function hover(option) {
  if (!option) { renderNote($('hub-info'), files.length ? loadedNote() : idleNote()); return; }
  if (option.nav) {
    const tool = option.toolId && tools.find((t) => t.id === option.toolId);
    const section = sections.find((s) => '#' + s.id === option.nav || s.href === option.nav);
    renderNote($('hub-info'), tool ? { title: tool.title, rows: [['Does', tool.description]], foot: 'Click to open it.' } : section ? { title: section.title, rows: [['Does', section.blurb]], foot: 'Click to open it.' } : { title: option.label, rows: [['Does', option.hint]] });
    return;
  }
  if (option.pick) { renderNote($('hub-info'), { title: option.hint, rows: [['Then', 'The dial shows what you can do with it']], foot: 'Or drop it anywhere on this page.' }); return; }
  renderNote($('hub-info'), actionNote(option, files));
}

function refresh() {
  $('hub-error').hidden = true;
  if (!files.length) {
    dial.set(idleOptions(current), { title: 'Drop a file', sub: 'or click to choose', icon: 'arrow-up', state: 'idle' });
  } else {
    const result = sectionActions(current, files);
    if (!result.actions.length) {
      $('hub-error').textContent = result.reason; $('hub-error').hidden = false;
      files = [];
      dial.set(idleOptions(current), { title: 'Drop a file', sub: 'or click to choose', icon: 'arrow-up', state: 'idle' });
    } else {
      dial.set(result.actions.map((a, i) => ({ ...a, primary: i === 0 && !!a.humanize })), { title: files.length === 1 ? files[0].name : files.length + ' files', sub: 'click a segment · or here to change', icon: 'check', state: 'loaded' });
    }
  }
  $('hub-clear').hidden = !files.length;
  $('hub-pick').textContent = files.length ? 'Choose a different file' : 'Choose a file';
  hover(null);
}

function card(tool) {
  const link = document.createElement('a');
  link.href = '#' + tool.id; link.className = 'tool-card';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#' + tool.icon); icon.append(use);
  const body = document.createElement('span');
  const title = document.createElement('strong'); title.textContent = tool.title;
  const text = document.createElement('small'); text.textContent = tool.description;
  body.append(title, text); link.append(icon, body);
  return link;
}

function renderTools() {
  const box = $('hub-tools');
  box.replaceChildren();
  const section = sections.find((s) => s.id === current);
  const groups = section ? [section] : sections;
  for (const group of groups) {
    const wrap = document.createElement('section'); wrap.className = 'tool-section';
    const head = document.createElement('h2');
    if (section) head.textContent = 'Every ' + group.title + ' tool';
    else { const a = document.createElement('a'); a.href = group.href || '#' + group.id; a.textContent = group.title; head.append(a); }
    const grid = document.createElement('div'); grid.className = 'tool-grid';
    grid.append(...group.tools.map((id) => card(tools.find((t) => t.id === id))));
    wrap.append(head, grid); box.append(wrap);
  }
}

// sectionId: null for the homepage, a section id, or false to hide.
export function showHub(sectionId) {
  if (sectionId === false) { current = undefined; return; }
  if (current !== sectionId) { current = sectionId; files = []; renderTools(); }
  const section = sections.find((s) => s.id === current);
  $('hub-title').textContent = section ? section.lede : HOME.title;
  $('hub-lede').textContent = section ? section.blurb : HOME.lede;
  $('hub-eyebrow').textContent = section ? section.title : 'Free · No sign-up · Files never leave your device';
  refresh();
}

export function loadHub(list) { files = list.slice(0, 100); refresh(); }

async function pick(option) {
  if (option.nav) { location.hash = option.nav; return; }
  if (option.pick) { $('hub-input').click(); return; }
  dial.busy(true);
  try { await hooks.run(option, files); } finally { dial.busy(false); }
}

export function initHub(options) {
  hooks = options;
  dial = createDial($('hub-dial'), { onPick: pick, onHub: () => $('hub-input').click(), onHover: hover });
  $('hub-input').accept = PICKER_ACCEPT;
  $('hub-pick').addEventListener('click', () => $('hub-input').click());
  $('hub-clear').addEventListener('click', () => { files = []; refresh(); });
  $('hub-input').addEventListener('change', () => { const list = [...$('hub-input').files]; $('hub-input').value = ''; if (list.length) loadHub(list); });
  dropZone($('hub-view'), loadHub);
}
