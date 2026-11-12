// The homepage and the format pages (PDF, Word, Excel…). Each is a big dial
// beside a short panel, and both always follow the same three steps: add a
// file, pick what you want, save it. Before a file the dial's segments are
// shortcuts. After a file is dropped they are the jobs that fit it, and the
// same jobs are listed in plain words beside the dial.
import { createDial } from './dial.js';
import { tools } from './tools.js';
import { sections, sectionDial } from './sections.js';
import { wheelActions, PICKER_ACCEPT } from './actions.js';
import { actionNote, renderNote } from './notes.js';
import { dropZone, formatBytes } from './files.js';
import { detectFormat, FORMATS } from './convert.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
let current = undefined, files = [], hooks = null, dial = null, pending = null, finished = false;

const HOME = {
  title: 'Take the AI out of any document.',
  lede: 'Drop a Word file, deck, spreadsheet, PDF or plain text. One click strips the filler, stock AI phrases and hidden characters, and hands back the same file. The same dial converts, compresses and cleans metadata.',
};

function idleNote() {
  const section = sections.find((s) => s.id === current);
  if (!section) return { title: 'One click on Humanize', rows: [['Before', 'Certainly! It is important to note that the launch slipped by two weeks. I hope this helps!'], ['After', 'The launch slipped by two weeks.']], foot: 'Word, PowerPoint and Excel come back as the same file, with every style and table kept.', proof: true };
  return { title: 'How this page works', rows: [['1', 'Drop a ' + section.title + ' file on the dial, or click the middle'], ['2', 'The dial and a plain list show every job that fits it'], ['3', 'Click one. The finished file saves to your downloads']], foot: 'No file yet? Click a job on the dial to see what it does.' };
}

function icon(name) {
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('viewBox', '0 0 24 24');
  const use = document.createElementNS(SVG, 'use'); use.setAttribute('href', '#' + (name || 'file'));
  svg.append(use);
  return svg;
}

// What the hovered or focused option does, in the panel beside the dial.
function hover(option) {
  const box = files.length ? $('hub-note') : $('hub-info');
  if (!option) { if (files.length) renderNote(box, null); else renderNote(box, idleNote()); return; }
  if (option.children) { renderNote(box, { title: option.label, rows: [['Does', option.hint], ['Inside', option.children.map((c) => c.label).join(', ')]], foot: 'Click to see these options.' }); return; }
  if (option.back) { renderNote(box, null); return; }
  if (option.nav) {
    const tool = option.toolId && tools.find((t) => t.id === option.toolId);
    renderNote(box, tool ? { title: tool.title, rows: [['Does', tool.description]], foot: 'Click to open it.' } : { title: option.hint || option.label, rows: [['Does', option.description || option.hint]], foot: option.to ? 'Click, choose your file, and it converts straight away.' : 'Click to open it.' });
    return;
  }
  renderNote(box, actionNote(option, files));
}

const IDLE = { title: 'Drop a file', sub: 'or click to choose', icon: 'plus', state: 'idle' };

function setStep(step) {
  for (const item of $('hub-steps').children) {
    const n = Number(item.dataset.step);
    item.classList.toggle('current', n === step);
    item.classList.toggle('done', n < step);
    if (n === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  }
}

// The same options as the dial, as a plain list.
function renderJobs() {
  const box = $('hub-jobs');
  box.replaceChildren();
  if (!files.length) return;
  const parent = dial.parent;
  $('hub-question').textContent = parent ? (parent.question || parent.hint || parent.label) : 'What do you want to do?';
  const row = (option) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'job' + (option.primary ? ' primary-job' : '') + (option.back ? ' back-job' : '');
    const text = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = option.label;
    const hint = document.createElement('small'); hint.textContent = option.hint || '';
    text.append(title, hint);
    const go = document.createElement('span'); go.className = 'job-go'; go.setAttribute('aria-hidden', 'true'); go.textContent = option.back ? '' : option.children ? '›' : '';
    button.append(icon(option.back ? 'back' : option.icon || (option.to ? 'swap' : 'file')), text, go);
    button.addEventListener('click', () => { if (option.back) dial.back(); else if (option.children) dial.open(option.id); else pick(option); });
    const light = (on) => { if (!option.back) { dial.highlight(on ? option.id : null); hover(on ? option : null); } };
    button.addEventListener('pointerenter', () => light(true));
    button.addEventListener('pointerleave', () => light(false));
    button.addEventListener('focus', () => light(true));
    button.addEventListener('blur', () => light(false));
    return button;
  };
  if (parent) box.append(row({ back: true, label: 'Back', hint: 'All options for this file' }));
  box.append(...dial.options.map(row));
}

function refresh() {
  $('hub-error').hidden = true;
  let loaded = files.length > 0;
  if (loaded) {
    const result = wheelActions(files);
    if (!result.actions.length) {
      $('hub-error').textContent = result.reason; $('hub-error').hidden = false;
      files = []; loaded = false;
    } else {
      const name = files.length === 1 ? files[0].name : files.length + ' files';
      dial.set(result.actions.map((a, i) => ({ ...a, primary: i === 0 && !!a.humanize, question: a.children ? a.hint : undefined })),
        { title: name, sub: 'click here to change it', icon: 'check', state: 'loaded', caption: 'Pick what to do with ' + name });
      $('hub-file').textContent = name;
      $('hub-file-size').textContent = formatBytes(files.reduce((s, f) => s + f.size, 0)) + (files.length === 1 && detectFormat(files[0]) ? ' · ' + FORMATS[detectFormat(files[0])].name : '');
    }
  }
  if (!loaded) {
    const home = !sections.find((s) => s.id === current);
    // On the homepage a segment opens that format's page; there is nothing to drill into.
    dial.set(sectionDial(current).map((o) => home ? { ...o, direct: true } : o), { ...IDLE, caption: home ? 'Drop any file here, or pick a kind of file' : 'Drop a file here, or pick a job' });
    finished = false;
  }
  $('hub-intro').hidden = loaded;
  $('hub-work').hidden = !loaded;
  $('hub-result').hidden = !finished;
  setStep(!loaded ? 1 : finished ? 3 : 2);
  renderJobs();
  hover(null);
}

function card(leaf) {
  const link = document.createElement('a');
  link.href = leaf.href; link.className = 'tool-card';
  const body = document.createElement('span');
  const title = document.createElement('strong'); title.textContent = leaf.title;
  const text = document.createElement('small'); text.textContent = leaf.description;
  body.append(title, text); link.append(icon(leaf.icon), body);
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
  if (current !== sectionId) { current = sectionId; files = []; pending = null; finished = false; renderTools(); }
  const section = sections.find((s) => s.id === current);
  $('hub-title').textContent = section ? section.lede : HOME.title;
  $('hub-lede').textContent = section ? section.blurb : HOME.lede;
  $('hub-eyebrow').textContent = section ? section.title : 'Humanizer · Converter · PDF tools';
  refresh();
}

export function loadHub(list) {
  files = list.slice(0, 100); finished = false;
  refresh();
  // A conversion picked before the file was chosen runs as soon as it arrives.
  const wanted = pending; pending = null;
  if (wanted && files.length === 1 && detectFormat(files[0]) === wanted.from) pick({ id: 'to-' + wanted.to, label: FORMATS[wanted.to].label, to: wanted.to });
}

async function pick(option) {
  if (option.nav && option.from && option.to) { pending = { from: option.from, to: option.to }; $('hub-input').click(); return; }
  if (option.nav) { location.hash = option.nav; return; }
  if (option.pick) { $('hub-input').click(); return; }
  finished = false; $('hub-result').hidden = true; $('hub-error').hidden = true; setStep(2);
  dial.busy(true); $('hub-work').classList.add('busy');
  try { await hooks.run(option, files); } finally { dial.busy(false); $('hub-work').classList.remove('busy'); }
}

// The status pill reports every finished job. Keep the last one on the page
// too, so the result doesn't vanish with the pill.
function onDone(event) {
  if (!files.length || $('hub-view').hidden) return;
  const { title, detail, action } = event.detail;
  finished = true;
  $('hub-result-title').textContent = title;
  $('hub-result-detail').textContent = detail || '';
  const button = $('hub-result-action');
  button.hidden = !action;
  if (action) { button.textContent = action.label; button.onclick = action.run; }
  $('hub-result').hidden = false;
  setStep(3);
}
function onFail(event) {
  if (!files.length || $('hub-view').hidden) return;
  $('hub-error').textContent = event.detail.detail || event.detail.title; $('hub-error').hidden = false;
}

export function initHub(options) {
  hooks = options;
  dial = createDial($('hub-dial'), { onPick: pick, onHub: () => $('hub-input').click(), onHover: hover, onLevel: () => { if (dial) renderJobs(); } });
  $('hub-input').accept = PICKER_ACCEPT;
  $('hub-pick').addEventListener('click', () => { pending = null; $('hub-input').click(); });
  $('hub-change').addEventListener('click', () => { pending = null; $('hub-input').click(); });
  $('hub-clear').addEventListener('click', () => { files = []; finished = false; refresh(); });
  $('hub-input').addEventListener('change', () => { const list = [...$('hub-input').files]; $('hub-input').value = ''; if (list.length) loadHub(list); });
  document.addEventListener('whitewash:done', onDone);
  document.addEventListener('whitewash:fail', onFail);
  dropZone($('hub-view'), (list) => { pending = null; loadHub(list); });
}
