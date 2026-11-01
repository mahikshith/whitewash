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
export const mammoth = () => script('mammoth.browser.min.js', 'mammoth');
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
