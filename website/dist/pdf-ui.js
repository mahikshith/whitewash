import * as pdf from './conv-pdf.js';
import { saveAll, readBytes, formatBytes, dropZone } from './files.js';
import { fileKind } from './actions.js';
import * as island from './island.js';

const $ = (id) => document.getElementById(id);
let active = null, items = [], pages = [], last = null, generation = 0, onPolish = null;
const MULTI = { 'pdf-merge': true, 'images-to-pdf': true };
const RUN_LABEL = { 'pdf-protect': 'Add password', 'pdf-unlock': 'Unlock PDF', 'pdf-compress': 'Compress PDF', 'pdf-repair': 'Repair PDF', 'pdf-sign': 'Sign and save', 'pdf-merge': 'Merge PDFs', 'pdf-split': 'Split PDF', 'pdf-organize': 'Save PDF', 'images-to-pdf': 'Make PDF', 'pdf-to-images': 'Save pages as images', 'pdf-polish': 'Polish the text', 'pdf-watermark': 'Add watermark', 'pdf-numbers': 'Add page numbers' };
// Jobs whose default setting is right for most people run as soon as the file
// lands. Change a setting afterwards and press the button to run it again.
const AUTO = new Set(['pdf-polish', 'pdf-compress', 'pdf-repair', 'pdf-to-images']);
const HINT = { 'images-to-pdf': 'JPG, PNG, WebP, GIF or BMP · add as many as you like · or drop them here', 'pdf-merge': 'Add two or more PDFs · or drop them here' };

export const setPolishHandler = (fn) => { onPolish = fn; };

export function showPdf(tool) {
  if (!tool) { generation++; return; }
  if (active?.id !== tool.id) { items = []; pages = []; last = null; $('pdf-output').hidden = true; $('pdf-error').hidden = true; }
  active = tool;
  $('pdf-title').textContent = tool.title;
  $('pdf-description').textContent = tool.description;
  $('pdf-hint').textContent = HINT[tool.id] || 'One PDF · up to 100 MB · or drop it here';
  $('pdf-input').multiple = !!MULTI[tool.id];
  $('pdf-input').accept = tool.id === 'images-to-pdf' ? 'image/jpeg,image/png,image/webp,image/gif,image/bmp' : '.pdf,application/pdf';
  for (const field of document.querySelectorAll('#pdf-options [data-for]')) field.hidden = !field.dataset.for.split(' ').includes(tool.id);
  $('pdf-options').hidden = ![...document.querySelectorAll('#pdf-options [data-for]')].some((f) => !f.hidden);
  $('pdf-run').textContent = RUN_LABEL[tool.id];
  render();
}

function render() {
  const multi = MULTI[active?.id];
  $('pdf-pick').textContent = items.length ? (multi ? 'Add more' : 'Choose a different file') : active?.action || 'Choose a PDF';
  $('pdf-files').hidden = !items.length || active?.id === 'pdf-organize';
  $('pdf-files').replaceChildren(...items.map((item, i) => {
    const row = document.createElement('li');
    const name = document.createElement('strong'); name.textContent = item.file.name;
    const info = document.createElement('span'); info.textContent = (item.pages ? item.pages + (item.pages === 1 ? ' page · ' : ' pages · ') : '') + formatBytes(item.file.size);
    row.append(name, info);
    if (multi) {
      const controls = document.createElement('span'); controls.className = 'row-controls';
      for (const [label, text, fn] of [['Move up', '↑', () => move(i, -1)], ['Move down', '↓', () => move(i, 1)], ['Remove', '×', () => { items.splice(i, 1); render(); }]]) {
        const button = document.createElement('button'); button.className = 'icon-button small'; button.textContent = text; button.setAttribute('aria-label', label + ': ' + item.file.name);
        button.addEventListener('click', fn); controls.append(button);
      }
      row.append(controls);
    }
    return row;
  }));
  $('pdf-pages').hidden = active?.id !== 'pdf-organize' || !pages.length;
  // No dead grey button before there's a file: the drop zone is the first step.
  $('pdf-run').closest('.primary-row').hidden = !items.length;
  if (items.length && AUTO.has(active?.id) && last && $('pdf-run').textContent === RUN_LABEL[active.id]) $('pdf-run').textContent = 'Redo with these settings';
  $('pdf-run').disabled = !items.length || (active?.id === 'pdf-merge' && items.length < 2) || (active?.id === 'pdf-organize' && !pages.some((p) => !p.deleted));
}

function move(i, step) {
  const j = i + step;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  render();
}

export async function loadPdf(list) {
  const version = ++generation;
  $('pdf-error').hidden = true; $('pdf-output').hidden = true; last = null;
  const images = active.id === 'images-to-pdf';
  const accepted = list.filter((file) => images ? fileKind(file) === 'image' : /\.pdf$/i.test(file.name) || file.type === 'application/pdf');
  if (accepted.length < list.length) showError(images ? 'Only images can go in. Skipped the rest.' : 'Only PDF files work here. Skipped the rest.');
  if (!accepted.length) return;
  const added = [];
  for (const file of accepted) {
    if (file.size > 100_000_000) { showError(file.name + ' is over 100 MB.'); continue; }
    const item = { file, bytes: await readBytes(file) };
    if (!images && !['pdf-unlock', 'pdf-repair'].includes(active.id)) { try { item.pages = await pdf.pageCount(item.bytes); } catch (error) { showError(file.name + ': ' + error.message); continue; } }
    added.push(item);
  }
  if (version !== generation) return;
  items = MULTI[active.id] ? items.concat(added) : added.slice(0, 1);
  if (active.id === 'pdf-organize' && items[0]) await thumbnails(items[0].bytes, version);
  if (active.id === 'pdf-sign' && items[0]) { $('sign-page').replaceChildren(...Array.from({ length: items[0].pages }, (_, i) => new Option('Page ' + (i + 1), i))); $('sign-page').value = items[0].pages - 1; await signPreview(); }
  render();
  if (!MULTI[active.id] && items.length && AUTO.has(active.id)) run();
}

async function thumbnails(bytes, version) {
  $('pdf-pages').replaceChildren();
  pages = [];
  try {
    const { images } = await pdf.renderPages(bytes, { scale: 0.35, type: 'image/png', onPage: (n, total) => { $('pdf-pages').dataset.loading = 'Loading page ' + n + ' of ' + total + '…'; } });
    if (version !== generation) return;
    pages = images.map((image) => ({ index: image.page - 1, url: URL.createObjectURL(image.blob), rotation: 0, deleted: false }));
    drawPages();
  } catch (error) { showError(error.message); }
}

function drawPages() {
  $('pdf-pages').replaceChildren(...pages.map((page, i) => {
    const card = document.createElement('figure'); card.className = 'page-card' + (page.deleted ? ' deleted' : '');
    const img = document.createElement('img'); img.src = page.url; img.alt = 'Page ' + (page.index + 1); img.style.transform = 'rotate(' + page.rotation + 'deg)';
    const caption = document.createElement('figcaption'); caption.textContent = page.index + 1;
    const controls = document.createElement('div'); controls.className = 'page-controls';
    for (const [label, text, fn] of [
      ['Move left', '←', () => { if (i > 0) { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; drawPages(); } }],
      ['Rotate', '↻', () => { page.rotation = (page.rotation + 90) % 360; drawPages(); }],
      [page.deleted ? 'Put back' : 'Delete', page.deleted ? '↺' : '×', () => { page.deleted = !page.deleted; drawPages(); }],
      ['Move right', '→', () => { if (i < pages.length - 1) { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; drawPages(); } }],
    ]) { const b = document.createElement('button'); b.className = 'icon-button small'; b.textContent = text; b.setAttribute('aria-label', label + ', page ' + (page.index + 1)); b.addEventListener('click', fn); controls.append(b); }
    card.append(img, caption, controls);
    return card;
  }));
  render();
}

function showError(message) { $('pdf-error').textContent = message; $('pdf-error').hidden = false; }

async function imageBytes(file) {
  // Trust the bytes, not the name: a JPEG saved as .png is common.
  const bytes = await readBytes(file);
  const sniffed = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : null;
  if (sniffed) return { bytes, type: sniffed };
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'image/png' };
}

async function run() {
  if (!items.length) return;
  const version = ++generation, tool = active.id, source = items[0];
  $('pdf-error').hidden = true; $('pdf-output').hidden = true;
  $('pdf-run').disabled = true; $('pdf-run').textContent = 'Working…';
  const base = source.file.name.replace(/\.[^.]+$/, '');
  const asPdf = (bytes, name) => [{ blob: new Blob([bytes], { type: 'application/pdf' }), name }];
  try {
    let outputs, summary;
    if (tool === 'pdf-merge') { outputs = asPdf(await pdf.merge(items.map((i) => i.bytes)), 'merged.pdf'); summary = 'Merged ' + items.length + ' PDFs'; }
    else if (tool === 'pdf-split') {
      const ranges = $('pdf-ranges').value.trim();
      if (ranges) { const picked = pdf.parseRanges(ranges, source.pages); outputs = asPdf(await pdf.pickPages(source.bytes, picked), base + '-pages.pdf'); summary = 'Saved ' + picked.length + (picked.length === 1 ? ' page' : ' pages'); }
      else { outputs = (await pdf.splitEvery(source.bytes)).map((bytes, i) => ({ blob: new Blob([bytes], { type: 'application/pdf' }), name: base + '-page-' + String(i + 1).padStart(String(source.pages).length, '0') + '.pdf' })); summary = 'Split into ' + outputs.length + ' files'; }
    } else if (tool === 'pdf-organize') {
      const kept = pages.filter((p) => !p.deleted);
      outputs = asPdf(await pdf.pickPages(source.bytes, kept.map((p) => p.index), Object.fromEntries(kept.map((p) => [p.index, p.rotation]))), base + '-edited.pdf');
      summary = 'Saved ' + kept.length + (kept.length === 1 ? ' page' : ' pages');
    } else if (tool === 'images-to-pdf') {
      const images = [];
      for (const item of items) images.push(await imageBytes(item.file));
      outputs = asPdf(await pdf.imagesToPdf(images, { size: $('pdf-size').value, margin: Number($('pdf-margin').value) }), (items.length === 1 ? base : 'images') + '.pdf');
      summary = 'Made a ' + images.length + '-page PDF';
    } else if (tool === 'pdf-to-images') {
      const type = $('pdf-image-type').value, ext = type === 'image/png' ? 'png' : 'jpg';
      const { images } = await pdf.renderPages(source.bytes, { type, scale: Number($('pdf-image-scale').value), onPage: (n, total) => { $('pdf-run').textContent = 'Page ' + n + ' of ' + total + '…'; } });
      outputs = images.map((image) => ({ blob: image.blob, name: base + '-page-' + String(image.page).padStart(String(images.length).length, '0') + '.' + ext }));
      summary = 'Saved ' + outputs.length + (outputs.length === 1 ? ' image' : ' images');
    } else if (tool === 'pdf-watermark') {
      const text = $('pdf-wm-text').value.trim();
      if (!text) throw new Error('Type the watermark text first.');
      outputs = asPdf(await pdf.watermark(source.bytes, text, { opacity: Number($('pdf-wm-opacity').value) / 100 }), base + '-watermarked.pdf'); summary = 'Watermark added';
    } else if (tool === 'pdf-numbers') {
      outputs = asPdf(await pdf.pageNumbers(source.bytes, { position: $('pdf-num-pos').value, format: $('pdf-num-format').value }), base + '-numbered.pdf'); summary = 'Page numbers added';
    } else if (tool === 'pdf-protect') {
      const more = await import('./conv-pdf-more.js');
      if ($('pdf-pass').value !== $('pdf-pass2').value) throw new Error('The two passwords don’t match.');
      outputs = asPdf(await more.protect(source.bytes, $('pdf-pass').value, { allowPrint: $('pdf-allow-print').checked, allowCopy: $('pdf-allow-copy').checked }), base + '-protected.pdf');
      summary = 'Password added (AES-256). Keep it somewhere safe: it can’t be recovered';
    } else if (tool === 'pdf-unlock') {
      const more = await import('./conv-pdf-more.js');
      if (!more.isEncrypted(source.bytes)) throw new Error('This PDF has no password to remove.');
      outputs = asPdf(await more.unlock(source.bytes, $('pdf-unlock-pass').value), base + '-unlocked.pdf'); summary = 'Password removed';
    } else if (tool === 'pdf-repair') {
      const more = await import('./conv-pdf-more.js');
      outputs = asPdf(await more.repair(source.bytes), base + '-repaired.pdf'); summary = 'Rebuilt the PDF’s structure';
    } else if (tool === 'pdf-compress') {
      const more = await import('./conv-pdf-more.js');
      const result = await more.compress(source.bytes, $('pdf-level').value, (n, total) => { $('pdf-run').textContent = 'Image ' + n + ' of ' + total + '…'; });
      outputs = asPdf(result.bytes, base + '-compressed.pdf');
      const saved = Math.round((1 - result.after / result.before) * 100);
      summary = saved > 0 ? formatBytes(result.before) + ' → ' + formatBytes(result.after) + ' (' + saved + '% smaller, ' + result.images + (result.images === 1 ? ' photo' : ' photos') + ' shrunk)' : 'Already as small as it gets without hurting quality. You get the original back';
    } else if (tool === 'pdf-sign') {
      const more = await import('./conv-pdf-more.js');
      if (!signed) throw new Error('Draw your signature first.');
      if (!placed) throw new Error('Click the page where the signature should go.');
      const png = new Uint8Array(await (await new Promise((r) => trimmed().toBlob(r, 'image/png'))).arrayBuffer());
      outputs = asPdf(await more.sign(source.bytes, png, { page: Number($('sign-page').value), x: placed.x, y: placed.y, width: Number($('sign-size').value) / 100 }), base + '-signed.pdf');
      summary = 'Signed on page ' + (Number($('sign-page').value) + 1);
    } else if (tool === 'pdf-polish') {
      const { extractText } = await import('./convert.js');
      const text = await extractText(source.file, (step) => { $('pdf-run').textContent = step + '…'; });
      if (version !== generation) return;
      onPolish?.(text, base + '.txt');
      return;
    }
    if (version !== generation) return;
    last = await saveAll(outputs, base + '-pages.zip');
    $('pdf-summary').textContent = summary + (tool === 'pdf-compress' ? '' : ' · ' + formatBytes(last.blob.size));
    $('pdf-output').hidden = false;
  } catch (error) { if (version === generation) showError(error?.message || String(error) || 'That didn’t work.'); }
  finally { if (version === generation) { $('pdf-run').textContent = RUN_LABEL[tool]; render(); } }
}

$('pdf-pick').addEventListener('click', () => $('pdf-input').click());
$('pdf-input').addEventListener('change', () => { const list = [...$('pdf-input').files]; $('pdf-input').value = ''; if (list.length) loadPdf(list); });
$('pdf-run').addEventListener('click', run);
$('pdf-download').addEventListener('click', () => { if (last) island.saveBlob(last.blob, last.name); });
dropZone($('pdf-view'), loadPdf);

// ---------- Signature pad and placement ----------
let signed = false, placed = null, drawing = false;
const pad = $('sign-pad'), ink = pad.getContext('2d', { willReadFrequently: true });
function padPoint(event) { const r = pad.getBoundingClientRect(); return [(event.clientX - r.left) * pad.width / r.width, (event.clientY - r.top) * pad.height / r.height]; }
pad.addEventListener('pointerdown', (event) => { drawing = true; pad.setPointerCapture(event.pointerId); const [x, y] = padPoint(event); ink.beginPath(); ink.moveTo(x, y); ink.lineWidth = 3.2; ink.lineCap = ink.lineJoin = 'round'; ink.strokeStyle = '#0b1f5c'; });
pad.addEventListener('pointermove', (event) => { if (!drawing) return; const [x, y] = padPoint(event); ink.lineTo(x, y); ink.stroke(); signed = true; });
pad.addEventListener('pointerup', () => { drawing = false; updateGhost(); });
$('sign-clear').addEventListener('click', () => { ink.clearRect(0, 0, pad.width, pad.height); signed = false; updateGhost(); });

// The signature cropped to its ink, so the size slider means the signature's width.
function trimmed() {
  const { data, width, height } = ink.getImageData(0, 0, pad.width, pad.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = document.createElement('canvas');
  if (x1 < x0) { out.width = out.height = 1; return out; }
  out.width = x1 - x0 + 8; out.height = y1 - y0 + 8;
  out.getContext('2d').drawImage(pad, x0 - 4, y0 - 4, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function signPreview() {
  if (!items[0]) return;
  const { images } = await pdf.renderPages(items[0].bytes, { scale: 1, type: 'image/png', pages: [Number($('sign-page').value) + 1] });
  const img = $('sign-page-img');
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(images[0].blob);
  placed = { x: 0.62, y: 0.84 }; updateGhost();
}
function updateGhost() {
  const ghost = $('sign-ghost');
  ghost.hidden = !(signed && placed);
  if (ghost.hidden) return;
  ghost.src = trimmed().toDataURL('image/png');
  ghost.style.left = Math.min(placed.x, 1 - $('sign-size').value / 100) * 100 + '%'; ghost.style.top = placed.y * 100 + '%'; ghost.style.width = $('sign-size').value + '%';
}
$('sign-preview').addEventListener('click', (event) => {
  const r = $('sign-page-img').getBoundingClientRect();
  placed = { x: Math.min(0.98, Math.max(0, (event.clientX - r.left) / r.width)), y: Math.min(0.98, Math.max(0, (event.clientY - r.top) / r.height)) };
  updateGhost();
});
$('sign-page').addEventListener('change', signPreview);
$('sign-size').addEventListener('input', updateGhost);
