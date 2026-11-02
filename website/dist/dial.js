// The big dial. Lives on the page (homepage, section pages, converter), not as
// a pop-up. Before a file arrives its segments are shortcuts; once a file is
// dropped they become what you can do with it, and one click does it.
//
// Two layers when there is a lot to offer: the inner ring holds the jobs, and
// pointing at a job with options (Convert, Pages…) fans those options out in
// the outer ring. With nothing nested it is one big ring.
// Pointer, touch, keyboard and file drops all work on it.
import { segmentAngles, segmentPath, labelPoint } from './wheel-geometry.js';

const SVG = 'http://www.w3.org/2000/svg';
const RADIUS = 254;
export const BIG = { inner: 92, outer: RADIUS, gap: 7, corner: 14 };
export const INNER = { inner: 86, outer: 170, gap: 6, corner: 12 };
export const OUTER = { inner: 178, outer: RADIUS, gap: 5, corner: 10 };
const TAU = Math.PI * 2;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const norm = (a) => ((a % TAU) + TAU) % TAU;

// Angles for the options of one job, centred on that job's segment.
export function childAngles(count, middle) {
  const step = Math.min(TAU / 12 * 1.0, TAU / Math.max(count, 1));
  const start = middle - (step * count) / 2;
  return Array.from({ length: count }, (_, i) => ({ start: start + i * step, end: start + (i + 1) * step, middle: start + (i + 0.5) * step }));
}
const within = (angle, { start, end }) => { const a = norm(angle - start); return a <= end - start; };

export function createDial(root, { onPick, onHub, onHover }) {
  const size = (RADIUS + 14) * 2, c = size / 2;
  root.classList.add('dial');
  root.style.setProperty('--dial-size', size + 'px');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'dial-svg');
  const track = document.createElementNS(SVG, 'circle');
  track.setAttribute('class', 'dial-track'); track.setAttribute('cx', c); track.setAttribute('cy', c); track.setAttribute('r', (OUTER.inner + OUTER.outer) / 2);
  track.setAttribute('stroke-width', OUTER.outer - OUTER.inner);
  const innerRing = document.createElementNS(SVG, 'g'), outerRing = document.createElementNS(SVG, 'g');
  innerRing.setAttribute('class', 'dial-ring'); outerRing.setAttribute('class', 'dial-ring outer');
  svg.append(track, innerRing, outerRing);
  const hub = document.createElement('button');
  hub.type = 'button'; hub.className = 'dial-hub';
  hub.style.setProperty('--hub', (INNER.inner - 8) * 2 / size * 100 + '%');
  const hubIcon = document.createElement('span'); hubIcon.className = 'dial-hub-icon'; hubIcon.setAttribute('aria-hidden', 'true');
  const hubTitle = document.createElement('strong'), hubSub = document.createElement('span');
  hub.append(hubIcon, hubTitle, hubSub);
  root.replaceChildren(svg, hub);

  let options = [], angles = [], nested = false, busy = false;
  let open = -1, pinned = false, children = [], childArcs = [], hot = null, resting = -1;

  const geometry = () => nested ? INNER : BIG;

  function segment(option, arc, geo, cls, small, showIcon) {
    const g = document.createElementNS(SVG, 'g');
    g.setAttribute('class', 'dial-seg ' + cls + (option.primary ? ' primary' : '') + (option.children ? ' parent' : ''));
    g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', option.hint ? option.label + ': ' + option.hint : option.label);
    if (option.children) g.setAttribute('aria-expanded', 'false');
    g.style.setProperty('--dx', (Math.cos(arc.middle) * 6).toFixed(1) + 'px');
    g.style.setProperty('--dy', (Math.sin(arc.middle) * 6).toFixed(1) + 'px');
    const body = document.createElementNS(SVG, 'g'); body.setAttribute('class', 'dial-body');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', segmentPath(c, c, arc.start, arc.end, geo));
    path.setAttribute('stroke-width', geo.corner * 2);
    body.append(path);
    const at = labelPoint(c, c, arc.middle, geo);
    if (showIcon && option.icon) {
      const use = document.createElementNS(SVG, 'use'), s = small ? 18 : 22;
      use.setAttribute('href', '#' + option.icon); use.setAttribute('class', 'dial-icon');
      use.setAttribute('x', (at.x - s / 2).toFixed(1)); use.setAttribute('y', (at.y - s - 1).toFixed(1));
      use.setAttribute('width', s); use.setAttribute('height', s);
      body.append(use);
    }
    const label = document.createElementNS(SVG, 'text');
    label.setAttribute('x', at.x.toFixed(1)); label.setAttribute('y', (at.y + (showIcon && option.icon ? 12 : 0)).toFixed(1));
    if (small) label.setAttribute('class', 'small');
    label.textContent = option.label;
    body.append(label);
    g.append(body);
    return g;
  }

  function renderInner(animate) {
    innerRing.replaceChildren();
    const count = options.length, geo = geometry();
    angles = segmentAngles(count);
    options.forEach((option, i) => {
      const g = segment(option, angles[i], geo, 'inner', count > 9, count <= 12);
      innerRing.append(g);
      g.addEventListener('focus', () => { if (option.children) expand(i, false); else hideOuter(); mark({ ring: 'inner', i }); });
      g.addEventListener('keydown', (event) => keys(event, 'inner', i));
      if (animate && !reduced() && g.firstChild.animate) g.firstChild.animate([{ transform: 'scale(.75)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, delay: count > 1 ? 160 * i / (count - 1) : 0, easing: 'cubic-bezier(.3, 1.35, .5, 1)', fill: 'backwards' });
    });
  }

  function renderOuter() {
    outerRing.replaceChildren();
    root.classList.toggle('open', open >= 0);
    innerRing.querySelectorAll('.dial-seg').forEach((node, n) => { node.classList.toggle('open', n === open); if (options[n]?.children) node.setAttribute('aria-expanded', n === open); });
    if (open < 0) { children = []; childArcs = []; return; }
    children = options[open].children;
    childArcs = childAngles(children.length, angles[open].middle);
    children.forEach((child, j) => {
      const g = segment(child, childArcs[j], OUTER, 'child', true, false);
      outerRing.append(g);
      g.addEventListener('focus', () => mark({ ring: 'outer', i: j }));
      g.addEventListener('keydown', (event) => keys(event, 'outer', j));
      if (!reduced() && g.firstChild.animate) g.firstChild.animate([{ transform: 'scale(.85)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 200, delay: 18 * Math.abs(j - (children.length - 1) / 2), easing: 'cubic-bezier(.3, 1.3, .5, 1)', fill: 'backwards' });
    });
  }

  function expand(i, pin) {
    if (pin !== undefined) pinned = pin;
    if (open === i) return;
    open = i; renderOuter();
  }
  // With nothing pointed at, one job stays open so the outer ring is never empty.
  function hideOuter() { if (pinned || open < 0) return; open = -1; renderOuter(); }
  function collapse() { pinned = false; if (open === resting) return; open = resting; renderOuter(); }

  // Which segment is lit, and tell the page so it can explain it.
  function mark(next) {
    hot = next;
    innerRing.querySelectorAll('.dial-seg').forEach((node, n) => node.classList.toggle('active', next?.ring === 'inner' && n === next.i));
    outerRing.querySelectorAll('.dial-seg').forEach((node, n) => node.classList.toggle('active', next?.ring === 'outer' && n === next.i));
    onHover?.(!next ? null : next.ring === 'inner' ? options[next.i] : children[next.i]);
  }

  // What is under a point given in dial coordinates (centre at 0, 0).
  function at(dx, dy) {
    const r = Math.hypot(dx, dy), angle = Math.atan2(dy, dx), geo = geometry();
    if (r < geo.inner) return { ring: 'hub' };
    if (r <= geo.outer + 4) {
      const i = angles.findIndex((arc) => within(angle, arc));
      return i >= 0 ? { ring: 'inner', i } : null;
    }
    if (open >= 0 && r <= OUTER.outer + 14) {
      const j = childArcs.findIndex((arc) => within(angle, arc));
      return j >= 0 ? { ring: 'outer', i: j } : { ring: 'gap' };
    }
    return null;
  }

  function fire(target) {
    if (busy || !target) return;
    const option = target.ring === 'inner' ? options[target.i] : children[target.i];
    if (!option) return;
    if (option.children) { if (option.nav && open === target.i) { onPick(option); return; } expand(target.i, true); mark(target); return; }
    const node = (target.ring === 'inner' ? innerRing : outerRing).querySelectorAll('.dial-seg')[target.i];
    node?.classList.add('fired');
    setTimeout(() => node?.classList.remove('fired'), 450);
    onPick(option);
  }

  function keys(event, ring, i) {
    const list = ring === 'inner' ? innerRing : outerRing, count = list.children.length;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = ring === 'inner' ? options[i] : children[i];
      if (option?.children) { expand(i, true); outerRing.firstChild?.focus(); }
      else fire({ ring, i });
    } else if (['ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); list.children[(i + 1) % count]?.focus(); }
    else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); list.children[(i - 1 + count) % count]?.focus(); }
    else if (event.key === 'Escape' && ring === 'outer') { event.preventDefault(); innerRing.children[open]?.focus(); }
  }

  function local(event) {
    const box = svg.getBoundingClientRect(), scale = size / box.width;
    return [(event.clientX - box.left - box.width / 2) * scale, (event.clientY - box.top - box.height / 2) * scale];
  }

  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const target = at(...local(event));
    if (target?.ring === 'inner') {
      if (options[target.i]?.children) expand(target.i, false);
      else hideOuter();
    }
    const next = target && (target.ring === 'inner' || target.ring === 'outer') ? target : null;
    if (next?.ring !== hot?.ring || next?.i !== hot?.i) {
      if (!next && target?.ring === 'gap') return;
      mark(next);
    }
  });
  root.addEventListener('pointerleave', () => { if (!pinned) collapse(); mark(null); });
  svg.addEventListener('click', (event) => {
    const target = at(...local(event));
    if (target?.ring === 'inner' || target?.ring === 'outer') fire(target);
  });
  hub.addEventListener('click', () => onHub?.());

  return {
    set(next, { title = '', sub = '', icon = 'plus', state = 'idle' } = {}) {
      const changed = next.map((o) => o.id).join() !== options.map((o) => o.id).join();
      options = next;
      root.dataset.state = state;
      hubTitle.textContent = title; hubSub.textContent = sub;
      hubIcon.replaceChildren();
      if (icon) { const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); const u = document.createElementNS(SVG, 'use'); u.setAttribute('href', '#' + icon); u.setAttribute('width', '24'); u.setAttribute('height', '24'); s.append(u); hubIcon.append(s); }
      if (changed) {
        nested = options.some((o) => o.children?.length);
        root.classList.toggle('nested', nested);
        resting = options.findIndex((o) => o.children?.length);
        open = resting; pinned = false; hot = null;
        renderInner(true); renderOuter();
      }
    },
    busy(on) { busy = on; root.classList.toggle('busy', on); },
    get options() { return options; },
  };
}
