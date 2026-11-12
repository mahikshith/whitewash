// Lazy loaders for the vendored engines. Nothing here downloads until a tool
// needs it, and everything comes from this site's own /vendor folder.
const cache = new Map();
const once = (key, load) => { if (!cache.has(key)) cache.set(key, load().catch((error) => { cache.delete(key); throw error; })); return cache.get(key); };
const base = new URL('./vendor/', import.meta.url);

function script(file, global) {
  return once(file, () => new Promise((resolve, reject) => {
    if (globalThis[global]) { resolve(globalThis[global]); return; }
    const tag = document.createElement('script');
    tag.src = new URL(file, base).href;
    tag.onload = () => globalThis[global] ? resolve(globalThis[global]) : reject(new Error('Couldn’t start ' + file + '.'));
    tag.onerror = () => reject(new Error('Couldn’t load a converter. Check your connection and try again.'));
    document.head.append(tag);
  }));
}

export const pdfLib = () => once('pdf-lib', () => import('./vendor/pdf-lib.esm.min.js'));
export const fontkit = () => script('fontkit.umd.min.js', 'fontkit');
export const marked = () => once('marked', () => import('./vendor/marked.esm.js').then((m) => m.marked));
export const pdfjs = () => once('pdfjs', async () => {
  const lib = await import('./vendor/pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', base).href;
  return lib;
});
export const pdfjsOptions = () => ({
  cMapUrl: new URL('pdfjs/cmaps/', base).href, cMapPacked: true,
  standardFontDataUrl: new URL('pdfjs/standard_fonts/', base).href,
  isEvalSupported: false, enableXfa: false,
});
export const fontBytes = (name) => once('font:' + name, () => fetch(new URL('fonts/' + name, base)).then((r) => {
  if (!r.ok) throw new Error('Couldn’t load the PDF font.');
  return r.arrayBuffer();
}));
export const media = () => once('media', () => import('./vendor/media/mediabunny.min.mjs'));
// MP3, FLAC and AAC encoders are only registered when the browser can't encode them itself.
export const mediaEncoder = (codec) => once('encoder:' + codec, async () => {
  const mb = await media();
  if (await mb.canEncodeAudio(codec)) return;
  if (codec === 'mp3') (await import('./vendor/media/mp3-encoder.min.mjs')).registerMp3Encoder();
  else if (codec === 'flac') (await import('./vendor/media/flac-encoder.min.mjs')).registerFlacEncoder();
  else if (codec === 'aac') (await import('./vendor/media/aac-encoder.min.mjs')).registerAacEncoder();
});
export const archive = () => once('archive', async () => {
  const lib = await import('./vendor/libarchive/libarchive.js');
  lib.Archive.init({ workerUrl: new URL('libarchive/worker-bundle.js', base) });
  return lib;
});
export const fflate = () => once('fflate', () => import('./vendor/fflate.mjs'));
export const tesseract = () => once('tesseract', () => import('./vendor/tesseract/tesseract.esm.min.js').then((m) => m.default || m));
export const tesseractPaths = () => ({ workerPath: new URL('tesseract/worker.min.js', base).href, corePath: new URL('tesseract/core/', base).href, langPath: new URL('tesseract/lang/', base).href, gzip: true });

// Text the PDF fonts can't draw (emoji, Chinese, Japanese, Korean, Arabic…),
// drawn by the browser with the device's own fonts and returned as a PNG.
const textImages = new Map();
export function textImage(text, { bold = false, color = '1A1A1F' } = {}) {
  const key = text + '|' + bold + '|' + color;
  if (textImages.has(key)) return textImages.get(key);
  const em = 64, canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  const font = (bold ? '700 ' : '') + em + 'px system-ui, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Noto Sans CJK SC", sans-serif';
  context.font = font;
  const width = context.measureText(text).width;
  if (!width) { textImages.set(key, null); return null; }
  canvas.width = Math.ceil(width) + 4; canvas.height = Math.ceil(em * 1.5);
  context.font = font; context.fillStyle = '#' + color; context.textBaseline = 'alphabetic';
  context.fillText(text, 2, em * 1.1);
  const raw = atob(canvas.toDataURL('image/png').split(',')[1]), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const made = { bytes, width, canvasWidth: canvas.width, height: canvas.height, baseline: em * 1.1, em };
  textImages.set(key, made);
  return made;
}
