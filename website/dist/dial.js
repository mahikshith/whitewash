// The big dial. Lives on the page (homepage, format pages, converter), not as
// a pop-up. It always shows one ring and one question: before a file arrives
// its segments are shortcuts; once a file is dropped they are what you can do
// with it, and one click does it.
//
// A segment with more choices behind it (Convert, Pages…) carries a small
// arrow. Clicking it swaps the ring for those choices and turns the middle
// into a Back button, so there is never a second ring to hunt for.
// Pointer, touch, keyboard and file drops all work on it.
import { segmentAngles, segmentPath, labelPoint } from './wheel-geometry.js';

const SVG = 'http://www.w3.org/2000/svg';
const RADIUS = 254;
export const BIG = { inner: 92, outer: RADIUS, gap: 7, corner: 14 };
const TAU = Math.PI * 2;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const within = (angle, { start, end }) => norm(angle - start) <= end - start;

export function createDial(root, { onPick, onHub, onHover, onLevel }) {
  const size = (RADIUS + 14) * 2, c = size / 2;
  root.classList.add('dial');
  root.style.setProperty('--dial-size', size + 'px');
  const caption = document.createElement('p');
  caption.className = 'dial-caption'; caption.setAttribute('aria-live', 'polite');
  root.before(caption);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'dial-svg');
  const ring = document.createElementNS(SVG, 'g');
  ring.setAttribute('class', 'dial-ring');
  svg.append(ring);
  const hub = document.createElement('button');
  hub.type = 'button'; hub.className = 'dial-hub';
  hub.style.setProperty('--hub', (BIG.inner - 8) * 2 / size * 100 + '%');
  const hubIcon = document.createElement('span'); hubIcon.className = 'dial-hub-icon'; hubIcon.setAttribute('aria-hidden', 'true');
  const hubTitle = document.createElement('strong'), hubSub = document.createElement('span');
  hub.append(hubIcon, hubTitle, hubSub);
  root.replaceChildren(svg, hub);

  let top = [], angles = [], busy = false, hot = -1, parent = null, rest = {};
  const shown = () => parent ? parent.children : top;

  function icon(name) {
    hubIcon.replaceChildren();
    if (!name) return;
    const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24');
    const u = document.createElementNS(SVG, 'use'); u.setAttribute('href', '#' + name); u.setAttribute('width', '24'); u.setAttribute('height', '24');
    s.append(u); hubIcon.append(s);
  }

  // The middle and the line above the dial always say where you are.
  function chrome() {
    root.classList.toggle('drilled', !!parent);
    if (parent) {
      hubTitle.textContent = 'Back'; hubSub.textContent = 'to all options'; icon('back');
      hub.setAttribute('aria-label', 'Back to all options');
      caption.textContent = parent.question || parent.hint || parent.label;
    } else {
      hubTitle.textContent = rest.title || ''; hubSub.textContent = rest.sub || ''; icon(rest.icon);
      hub.removeAttribute('aria-label');
      caption.textContent = rest.caption || '';
    }
  }

  function render(animate) {
    ring.replaceChildren();
    const options = shown(), count = options.length, small = count > 9;
    angles = count === 1 ? [{ start: -Math.PI / 2 - 0.9, end: -Math.PI / 2 + 0.9, middle: -Math.PI / 2 }] : segmentAngles(count);
    options.forEach((option, i) => {
      const arc = angles[i];
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', 'dial-seg' + (option.primary ? ' primary' : '') + (option.children ? ' parent' : ''));
      g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0');
      g.setAttribute('aria-label', (option.hint ? option.label + ': ' + option.hint : option.label) + (option.children ? '. Opens more options' : ''));
      g.style.setProperty('--dx', (Math.cos(arc.middle) * 6).toFixed(1) + 'px');
      g.style.setProperty('--dy', (Math.sin(arc.middle) * 6).toFixed(1) + 'px');
      const body = document.createElementNS(SVG, 'g'); body.setAttribute('class', 'dial-body');
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', segmentPath(c, c, arc.start, arc.end, BIG));
      path.setAttribute('stroke-width', BIG.corner * 2);
      body.append(path);
      const at = labelPoint(c, c, arc.middle, BIG);
      const withIcon = option.icon && count <= 10;
      if (withIcon) {
        const use = document.createElementNS(SVG, 'use'), s = small ? 20 : 24;
        use.setAttribute('href', '#' + option.icon); use.setAttribute('class', 'dial-icon');
        use.setAttribute('x', (at.x - s / 2).toFixed(1)); use.setAttribute('y', (at.y - s - 2).toFixed(1));
        use.setAttribute('width', s); use.setAttribute('height', s);
        body.append(use);
      }
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', at.x.toFixed(1)); label.setAttribute('y', (at.y + (withIcon ? 13 : 0)).toFixed(1));
      if (small) label.setAttribute('class', 'small');
      label.textContent = option.label + (option.children ? ' ›' : '');
      body.append(label);
      g.append(body);
      ring.append(g);
      g.addEventListener('focus', () => mark(i));
      g.addEventListener('blur', () => { if (hot === i) mark(-1); });
      g.addEventListener('keydown', (event) => keys(event, i));
      if (animate && !reduced() && body.animate) body.animate([{ transform: 'scale(.75)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 240, delay: count > 1 ? 140 * i / (count - 1) : 0, easing: 'cubic-bezier(.3, 1.35, .5, 1)', fill: 'backwards' });
    });
    chrome();
  }

  // Which segment is lit, and tell the page so it can explain it.
  function mark(i, quiet = false) {
    if (i === hot) return;
    hot = i;
    Array.from(ring.children).forEach((node, n) => node.classList.toggle('active', n === i));
    if (!quiet) onHover?.(i < 0 ? null : shown()[i]);
  }

  function open(option, focus = false) {
    parent = option; hot = -1;
    render(true);
    onLevel?.(parent);
    onHover?.(null);
    if (focus) ring.firstChild?.focus();
  }
  function back(focus = false) {
    if (!parent) return;
    const from = top.indexOf(parent);
    parent = null; hot = -1;
    render(true);
    onLevel?.(null);
    onHover?.(null);
    if (focus) ring.children[from]?.focus();
  }

  function fire(i, viaKeys = false) {
    const option = shown()[i];
    if (busy || !option) return;
    if (option.children && !option.direct) { open(option, viaKeys); return; }
    const node = ring.children[i];
    node?.classList.add('fired');
    setTimeout(() => node?.classList.remove('fired'), 450);
    onPick(option);
  }

  function keys(event, i) {
    const count = ring.children.length;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fire(i, true); }
    else if (['ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); ring.children[(i + 1) % count]?.focus(); }
    else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); ring.children[(i - 1 + count) % count]?.focus(); }
    else if (event.key === 'Escape' && parent) { event.preventDefault(); back(true); }
  }

  // The segment under a pointer event, or -1.
  function at(event) {
    const box = svg.getBoundingClientRect(), scale = size / box.width;
    const dx = (event.clientX - box.left - box.width / 2) * scale, dy = (event.clientY - box.top - box.height / 2) * scale;
    const r = Math.hypot(dx, dy);
    if (r < BIG.inner || r > BIG.outer + 6) return -1;
    return angles.findIndex((arc) => within(Math.atan2(dy, dx), arc));
  }

  svg.addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch') mark(at(event)); });
  root.addEventListener('pointerleave', () => mark(-1));
  svg.addEventListener('click', (event) => { const i = at(event); if (i >= 0) fire(i); });
  hub.addEventListener('click', () => { if (parent) back(); else onHub?.(); });

  return {
    // options: [{ id, label, hint, icon, children?, question?, primary?, direct? }].
    // `direct` makes a segment with children act on click instead of opening them.
    set(next, { title = '', sub = '', icon = 'plus', state = 'idle', caption = '' } = {}) {
      const changed = next.map((o) => o.id).join() !== top.map((o) => o.id).join();
      const openId = parent?.id;
      top = next;
      rest = { title, sub, icon, caption };
      root.dataset.state = state;
      if (changed) { parent = null; hot = -1; render(true); onLevel?.(null); }
      else { parent = openId ? top.find((o) => o.id === openId) || null : null; render(false); }
    },
    busy(on) { busy = on; root.classList.toggle('busy', on); },
    // Light a segment from outside (the list beside the dial does this).
    highlight(id) { mark(id == null ? -1 : shown().findIndex((o) => o.id === id), true); },
    open(id) { const option = top.find((o) => o.id === id); if (option?.children) open(option); },
    back,
    get options() { return shown(); },
    get parent() { return parent; },
  };
}
