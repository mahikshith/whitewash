// The big dial. Lives on the page (homepage, section pages, converter), not as
// a pop-up. Before a file arrives its segments are shortcuts; once a file is
// dropped they become what you can do with it, and one click does it.
// Pointer, touch, keyboard and file drops all work on it.
import { segmentAngles, hitTest, segmentPath, labelPoint } from './wheel-geometry.js';

const SVG = 'http://www.w3.org/2000/svg';
export const BIG = { inner: 96, outer: 236, gap: 7, corner: 14, reach: 0 };
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createDial(root, { geometry = BIG, onPick, onHub, onHover }) {
  const size = (geometry.outer + 12) * 2, c = size / 2;
  root.classList.add('dial');
  root.style.setProperty('--dial-size', size + 'px');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'dial-svg');
  const hub = document.createElement('button');
  hub.type = 'button'; hub.className = 'dial-hub';
  hub.style.setProperty('--hub', (geometry.inner - 10) * 2 + 'px');
  const hubIcon = document.createElement('span'); hubIcon.className = 'dial-hub-icon'; hubIcon.setAttribute('aria-hidden', 'true');
  const hubTitle = document.createElement('strong'), hubSub = document.createElement('span');
  hub.append(hubIcon, hubTitle, hubSub);
  root.replaceChildren(svg, hub);
  let options = [], index = -1, busy = false;

  function highlight(i) {
    index = i;
    svg.querySelectorAll('.dial-seg').forEach((node, n) => node.classList.toggle('active', n === i));
    onHover?.(i >= 0 ? options[i] : null);
  }

  function pick(i) {
    if (busy || !options[i]) return;
    const node = svg.querySelectorAll('.dial-seg')[i];
    node?.classList.add('fired');
    setTimeout(() => node?.classList.remove('fired'), 450);
    onPick(options[i]);
  }

  function render(animate) {
    svg.replaceChildren();
    const count = options.length;
    segmentAngles(count).forEach((angles, i) => {
      const option = options[i];
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', 'dial-seg' + (option.primary ? ' primary' : ''));
      g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0');
      g.setAttribute('aria-label', option.hint ? option.label + ': ' + option.hint : option.label);
      g.style.setProperty('--dx', (Math.cos(angles.middle) * 7).toFixed(1) + 'px');
      g.style.setProperty('--dy', (Math.sin(angles.middle) * 7).toFixed(1) + 'px');
      const body = document.createElementNS(SVG, 'g'); body.setAttribute('class', 'dial-body');
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', segmentPath(c, c, angles.start, angles.end, geometry));
      path.setAttribute('stroke-width', geometry.corner * 2);
      body.append(path);
      const at = labelPoint(c, c, angles.middle, geometry);
      const small = count > 10;
      if (option.icon && count <= 12) {
        const use = document.createElementNS(SVG, 'use');
        const s = small ? 18 : 22;
        use.setAttribute('href', '#' + option.icon); use.setAttribute('class', 'dial-icon');
        use.setAttribute('x', (at.x - s / 2).toFixed(1)); use.setAttribute('y', (at.y - s - 2).toFixed(1));
        use.setAttribute('width', s); use.setAttribute('height', s);
        body.append(use);
      }
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', at.x.toFixed(1)); label.setAttribute('y', (at.y + (option.icon && count <= 12 ? 12 : 0)).toFixed(1));
      label.setAttribute('class', small ? 'small' : '');
      label.textContent = option.label;
      body.append(label);
      g.append(body); svg.append(g);
      g.addEventListener('focus', () => highlight(i));
      g.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(i); }
        else if (['ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); svg.children[(i + 1) % count]?.focus(); }
        else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); svg.children[(i - 1 + count) % count]?.focus(); }
      });
      if (animate && !reduced() && body.animate) body.animate([{ transform: 'scale(.75)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, delay: count > 1 ? 160 * i / (count - 1) : 0, easing: 'cubic-bezier(.3, 1.35, .5, 1)', fill: 'backwards' });
    });
  }

  function local(event) {
    const box = svg.getBoundingClientRect();
    const scale = size / box.width;
    return [(event.clientX - box.left - box.width / 2) * scale, (event.clientY - box.top - box.height / 2) * scale];
  }

  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const i = hitTest(...local(event), options.length, geometry);
    if (i !== index) highlight(i === null ? -1 : i);
  });
  svg.addEventListener('pointerleave', () => highlight(-1));
  svg.addEventListener('click', (event) => {
    const i = hitTest(...local(event), options.length, geometry);
    if (i !== null && i >= 0) pick(i);
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
      if (changed) { render(true); index = -1; }
    },
    busy(on) { busy = on; root.classList.toggle('busy', on); },
    get options() { return options; },
  };
}
