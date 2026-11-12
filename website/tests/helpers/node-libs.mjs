// A Node stand-in for dist/libs.js, so tests can run code that draws PDFs.
// Only the loaders the converters ask for are here; add more as tests need them.
import { readFile } from 'node:fs/promises';

const vendor = new URL('../../dist/vendor/', import.meta.url);
let kit;

export const pdfLib = () => import('../../dist/vendor/pdf-lib.esm.min.js');

// fontkit ships as a browser script that hangs itself on `self`. Lend it one
// for the length of the import, then take it away again.
export const fontkit = () => kit ||= (async () => {
  const lent = !('self' in globalThis);
  if (lent) globalThis.self = globalThis;
  try { await import('../../dist/vendor/fontkit.umd.min.js'); }
  finally { if (lent) delete globalThis.self; }
  return globalThis.fontkit;
})();

export const fontBytes = (name) => readFile(new URL('fonts/' + name, vendor));
