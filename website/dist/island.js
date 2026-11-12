// The status pill that drops in at the top of the screen while a file is worked on.
const $ = (id) => document.getElementById(id);
let timer;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function show(state, title, detail = '') {
  const box = $('island');
  const wasHidden = box.hidden;
  clearTimeout(timer);
  box.hidden = false;
  box.dataset.state = state;
  $('island-title').textContent = title;
  $('island-detail').textContent = detail;
  $('island-action').hidden = true;
  if (wasHidden && !reduced() && box.animate) {
    box.animate([{ transform: 'translate(-50%, -24px) scale(.86)', opacity: 0 }, { transform: 'translate(-50%, 0) scale(1)', opacity: 1 }],
      { duration: 420, easing: 'cubic-bezier(.2, 1.3, .4, 1)' });
  }
}

export function progress(title, detail, fraction = null) {
  show('working', title, detail);
  $('island-bar').style.setProperty('--progress', fraction === null ? '35%' : Math.round(fraction * 100) + '%');
  $('island-bar').classList.toggle('indeterminate', fraction === null);
}

export function done(title, detail, action) {
  show('done', title, detail);
  document.dispatchEvent(new CustomEvent('whitewash:done', { detail: { title, detail, action } }));
  $('island-bar').style.setProperty('--progress', '100%');
  $('island-bar').classList.remove('indeterminate');
  if (action) {
    $('island-action').hidden = false;
    $('island-action').textContent = action.label;
    $('island-action').onclick = action.run;
  }
  timer = setTimeout(hide, 7000);
}

export function fail(title, detail) {
  show('failed', title, detail);
  document.dispatchEvent(new CustomEvent('whitewash:fail', { detail: { title, detail } }));
}

export function hide() {
  clearTimeout(timer);
  const box = $('island');
  if (box.hidden) return;
  if (reduced() || !box.animate) { box.hidden = true; return; }
  box.animate([{ opacity: 1 }, { transform: 'translate(-50%, -16px) scale(.92)', opacity: 0 }], { duration: 220, easing: 'ease-in' })
    .finished.then(() => { box.hidden = true; }, () => { box.hidden = true; });
}

document.addEventListener('DOMContentLoaded', () => {
  $('island-close').addEventListener('click', hide);
  $('island').addEventListener('pointerenter', () => clearTimeout(timer));
  $('island').addEventListener('pointerleave', () => { if ($('island').dataset.state === 'done') timer = setTimeout(hide, 3000); });
});

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
