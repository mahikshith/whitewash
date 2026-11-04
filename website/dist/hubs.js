// The homepage and the section pages (Humanize, PDF, Compress, Audio, Archives,
// Privacy). Each is a big dial beside a short explanation. Before a file: the
// dial's segments open tools. After a file is dropped: they do things to it,
// in one click.
import { createDial } from './dial.js';
import { tools } from './tools.js';
import { sections, sectionDial } from './sections.js';
import { wheelActions, PICKER_ACCEPT } from './actions.js';
import { actionNote, renderNote } from './notes.js';
import { dropZone, formatBytes } from './files.js';

const $ = (id) => document.getElementById(id);
let current = undefined, files = [], hooks = null, dial = null;

const HOME = {
  title: 'Take the AI out of any document.',
  lede: 'Drop a Word file, deck, spreadsheet, PDF or plain text. One click strips the filler, stock AI phrases and hidden characters, and hands back the same file. The same dial converts, compresses and cleans metadata.',
};

function idleNote() {
  const section = sections.find((s) => s.id === current);
  if (!section) return { title: 'One click on Humanize', rows: [['Before', 'Certainly! It is important to note that the launch slipped by two weeks. I hope this helps!'], ['After', 'The launch slipped by two weeks.']], foot: 'Word, PowerPoint and Excel come back as the same file, with every style and table kept.', proof: true };
  const jobs = section.items.map((item) => item.label).join(', ');
  return { title: 'Point at the dial', rows: [['Jobs', jobs], ['Tip', 'Drop a file first and the dial only shows what fits it']], foot: 'Each job opens its options in the outer ring.' };
}

function loadedNote() {
  const list = files.length === 1 ? files[0].name + ' · ' + formatBytes(files[0].size) : files.length + ' files · ' + formatBytes(files.reduce((s, f) => s + f.size, 0));
  return { title: 'Pick what to do', rows: [['File', list], ['Next', 'Click a segment. The result downloads straight away, or opens its tool if it needs one more choice']], foot: 'Point at a segment to see exactly what you get.' };
}

function hover(option) {
  if (!option) { renderNote($('hub-info'), files.length ? loadedNote() : idleNote()); return; }
  if (option.children) { renderNote($('hub-info'), { title: option.label, rows: [['Does', option.hint], ['Options', option.children.map((c) => c.label).join(', ')]], foot: option.nav ? 'Click to open the page, or point at an option.' : 'Point at an option in the outer ring.' }); return; }
  if (option.nav) {
    const tool = option.toolId && tools.find((t) => t.id === option.toolId);
    renderNote($('hub-info'), tool ? { title: tool.title, rows: [['Does', tool.description]], foot: 'Click to open it.' } : { title: option.hint || option.label, rows: [['Does', option.description || option.hint]], foot: 'Click to open it.' });
    return;
  }
  if (option.pick) { renderNote($('hub-info'), { title: option.hint, rows: [['Then', 'The dial shows what you can do with it']], foot: 'Or drop it anywhere on this page.' }); return; }
  renderNote($('hub-info'), actionNote(option, files));
}

const IDLE = { title: 'Drop a file', sub: 'or click to choose', icon: 'plus', state: 'idle' };

function refresh() {
  $('hub-error').hidden = true;
  if (!files.length) {
    dial.set(sectionDial(current), IDLE);
  } else {
    const result = wheelActions(files);
    if (!result.actions.length) {
      $('hub-error').textContent = result.reason; $('hub-error').hidden = false;
      files = [];
      dial.set(sectionDial(current), IDLE);
    } else {
      dial.set(result.actions.map((a, i) => ({ ...a, primary: i === 0 && !!a.humanize })), { title: files.length === 1 ? files[0].name : files.length + ' files', sub: 'click a segment · or here to change', icon: 'check', state: 'loaded' });
    }
  }
  $('hub-clear').hidden = !files.length;
  $('hub-pick').textContent = files.length ? 'Choose a different file' : 'Choose a file';
  hover(null);
}

function card(leaf) {
  const link = document.createElement('a');
  link.href = leaf.href; link.className = 'tool-card';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#' + leaf.icon); icon.append(use);
  const body = document.createElement('span');
  const title = document.createElement('strong'); title.textContent = leaf.title;
  const text = document.createElement('small'); text.textContent = leaf.description;
  body.append(title, text); link.append(icon, body);
  return link;
}

// The section's tools as cards, one row per job. The homepage shows none:
// every tool lives on its own section page.
function renderTools() {
  const box = $('hub-tools');
  box.replaceChildren();
  const section = sections.find((s) => s.id === current);
  box.hidden = !section;
  if (!section) return;
  const loose = section.items.filter((item) => !item.children);
  const rows = [...(loose.length ? [{ label: section.title + ' tools', children: loose }] : []), ...section.items.filter((item) => item.children)];
  for (const row of rows) {
    const wrap = document.createElement('section'); wrap.className = 'tool-section';
    const head = document.createElement('h2'); head.textContent = row.label;
    wrap.append(head);
    const toolsIn = row.children.filter((leaf) => leaf.toolId), routes = row.children.filter((leaf) => !leaf.toolId);
    if (toolsIn.length) { const grid = document.createElement('div'); grid.className = 'tool-grid'; grid.append(...toolsIn.map(card)); wrap.append(grid); }
    wrap.classList.toggle('compact', !toolsIn.length);
    if (routes.length) {
      const chips = document.createElement('div'); chips.className = 'route-row';
      chips.append(...routes.map((leaf) => { const a = document.createElement('a'); a.href = leaf.href; a.className = 'route-chip'; a.textContent = leaf.title; a.title = leaf.description; return a; }));
      wrap.append(chips);
    }
    box.append(wrap);
  }
}

// sectionId: null for the homepage, a section id, or false to hide.
export function showHub(sectionId) {
  if (sectionId === false) { current = undefined; return; }
  if (current !== sectionId) { current = sectionId; files = []; renderTools(); }
  const section = sections.find((s) => s.id === current);
  $('hub-title').textContent = section ? section.lede : HOME.title;
  $('hub-lede').textContent = section ? section.blurb : HOME.lede;
  $('hub-eyebrow').textContent = section ? section.title : 'Humanizer · Converter · PDF tools';
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
