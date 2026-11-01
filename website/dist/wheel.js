// The drop-anywhere radial picker. Drag a file over the page and the wheel opens
// under the cursor; drop it on an option to run it. Choosing a file with the
// button opens the same wheel for pointer, touch and keyboard.
import { wheelActions } from './actions.js';
import { WHEEL, segmentAngles, hitTest, segmentPath, labelPoint, clampCentre } from './wheel-geometry.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const SIZE = (WHEEL.outer + 20) * 2;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = null, hooks = null, watchdog = 0, returnFocus = null;

function describe(files) {
  if (!files.length) return '';
  if (files.length > 1) return files.length + ' files';
  return files[0].name || '';
}

function setIndex(index) {
  if (!state || state.index === index) return;
  state.index = index;
  $('wheel-svg').querySelectorAll('.segment').forEach((node, i) => node.classList.toggle('active', i === index));
  const action = state.actions[index];
  $('wheel-label').textContent = action ? action.hint : state.mode === 'drag' ? 'Drop on an option' : 'Pick one';
  $('wheel').dataset.hub = index === -1 ? 'on' : '';
  if (action && state.mode === 'pick' && navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(4);
}

function render() {
  const svg = $('wheel-svg');
  svg.replaceChildren();
  const c = SIZE / 2;
  segmentAngles(state.actions.length).forEach((angles, i) => {
    const action = state.actions[i];
    const outer = document.createElementNS(SVG, 'g');
    outer.setAttribute('class', 'segment');
    outer.style.setProperty('--dx', (Math.cos(angles.middle) * 6).toFixed(2) + 'px');
    outer.style.setProperty('--dy', (Math.sin(angles.middle) * 6).toFixed(2) + 'px');
    outer.setAttribute('role', 'button');
    outer.setAttribute('aria-label', action.hint);
    const inner = document.createElementNS(SVG, 'g');
    inner.setAttribute('class', 'segment-body');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', segmentPath(c, c, angles.start, angles.end));
    path.setAttribute('stroke-width', WHEEL.corner * 2);
    const label = document.createElementNS(SVG, 'text');
    const at = labelPoint(c, c, angles.middle);
    label.setAttribute('x', at.x.toFixed(1)); label.setAttribute('y', at.y.toFixed(1));
    label.textContent = action.label;
    inner.append(path, label); outer.append(inner); svg.append(outer);
  });
}

function open(actions, x, y, mode, files) {
  const wasOpen = !!state;
  state = { actions, mode, files, index: null };
  const centre = clampCentre(x, y, window.innerWidth, window.innerHeight);
  state.cx = centre.x; state.cy = centre.y;
  const wheel = $('wheel');
  wheel.style.left = (centre.x - SIZE / 2) + 'px';
  wheel.style.top = (centre.y - SIZE / 2) + 'px';
  wheel.dataset.mode = mode;
  render();
  $('wheel-sub').textContent = describe(files);
  $('wheel-keys').textContent = mode === 'drag' ? 'Drop on the middle or outside to pick later' : '← → to move · Enter to run · Esc to close';
  setIndex(-2);
  $('drop-scrim').hidden = false;
  $('drop-scrim').dataset.wheel = 'on';
  wheel.hidden = false;
  if (mode === 'pick') { returnFocus = returnFocus || document.activeElement; wheel.focus({ preventScroll: true }); }
  if (wasOpen || reduced() || !wheel.animate) return;
  wheel.animate([{ transform: 'scale(.84)', opacity: 0 }, { transform: 'scale(1.015)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 300, easing: 'cubic-bezier(.25, .8, .35, 1)' });
  const bodies = wheel.querySelectorAll('.segment-body');
  bodies.forEach((body, i) => body.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 220, delay: bodies.length > 1 ? 120 * i / (bodies.length - 1) : 0, easing: 'cubic-bezier(.3, 1.4, .5, 1)', fill: 'backwards' }));
}

export function close() {
  clearTimeout(watchdog);
  $('drop-scrim').hidden = true;
  $('drop-scrim').dataset.wheel = '';
  $('scrim-text').textContent = 'Drop it anywhere';
  if (!state) return;
  state = null;
  $('wheel').hidden = true;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}

function run(index) {
  if (!state || index < 0 || !state.actions[index]) return;
  const action = state.actions[index], files = state.files;
  close();
  hooks.onRun(action, files);
}

export function openPicker(files, x, y) {
  const result = wheelActions(files);
  if (!result.actions.length) { hooks.onReject(result.reason); return; }
  open(result.actions, x, y, 'pick', files);
}

function hasFiles(event) { return [...(event.dataTransfer?.types || [])].includes('Files'); }

function onDragOver(event) {
  if (!hasFiles(event) || !hooks.isActive()) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  clearTimeout(watchdog);
  watchdog = setTimeout(close, 1200);
  if (state?.mode === 'drag') {
    const index = hitTest(event.clientX - state.cx, event.clientY - state.cy, state.actions.length);
    setIndex(index === null ? -2 : index);
    return;
  }
  if (state) return;
  if (!$('drop-scrim').hidden) return;
  const items = [...event.dataTransfer.items].filter((item) => item.kind === 'file').map((item) => ({ type: item.type }));
  const result = items.length && items.every((item) => item.type) ? wheelActions(items) : { actions: [] };
  if (result.actions.length) open(result.actions, event.clientX, event.clientY, 'drag', items.map(() => ({ name: '' })));
  else $('drop-scrim').hidden = false;
}

function onDrop(event) {
  if (!hasFiles(event) || !hooks.isActive()) return;
  event.preventDefault();
  const files = [...event.dataTransfer.files];
  const chosen = state?.mode === 'drag' ? state.actions[state.index] : null;
  close();
  const result = wheelActions(files);
  if (!result.actions.length) { hooks.onReject(result.reason); return; }
  const match = chosen && result.actions.find((action) => action.id === chosen.id);
  if (match) hooks.onRun(match, files);
  else open(result.actions, event.clientX, event.clientY, 'pick', files);
}

export function initWheel(options) {
  hooks = options;
  document.addEventListener('dragenter', onDragOver);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDrop);
  document.addEventListener('dragleave', (event) => {
    if (state?.mode === 'pick' || event.relatedTarget) return;
    if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) close();
  });
  document.addEventListener('pointermove', (event) => {
    if (state?.mode !== 'pick' || event.pointerType === 'touch') return;
    const index = hitTest(event.clientX - state.cx, event.clientY - state.cy, state.actions.length);
    setIndex(index === null ? -2 : index);
  });
  document.addEventListener('pointerdown', (event) => {
    if (state?.mode !== 'pick') return;
    const index = hitTest(event.clientX - state.cx, event.clientY - state.cy, state.actions.length);
    event.preventDefault();
    if (index === null || index === -1) close();
    else { setIndex(index); run(index); }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!state) return;
    const count = state.actions.length;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (state.mode !== 'pick') return;
    else if (['ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setIndex(state.index >= 0 ? (state.index + 1) % count : 0); }
    else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setIndex(state.index >= 0 ? (state.index - 1 + count) % count : count - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); run(state.index); }
    else if (event.key === 'Tab') event.preventDefault();
  });
  window.addEventListener('resize', close);
  window.addEventListener('hashchange', close);
}
