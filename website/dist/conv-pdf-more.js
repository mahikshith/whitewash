// More PDF tools: password protect and unlock (qpdf, in a worker), repair,
// compress (real image downsampling with pdf-lib + canvas, then qpdf's
// lossless object-stream pass) and visible signatures.
import * as libs from './libs.js';
import { openPdf } from './conv-pdf.js';

let worker = null, nextId = 1;
const pending = new Map();
function qpdf(args, input) {
  if (!worker) {
    worker = new Worker(new URL('./qpdf-worker.js', import.meta.url));
    worker.onmessage = ({ data }) => { const job = pending.get(data.id); if (!job) return; pending.delete(data.id); data.error ? job.reject(new Error(data.error)) : job.resolve(data.output); };
    worker.onerror = () => { for (const job of pending.values()) job.reject(new Error('The PDF engine couldn’t start.')); pending.clear(); worker = null; };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, args, input: new Uint8Array(input) }); });
}

export const isEncrypted = (bytes) => {
  // An /Encrypt entry in the trailer. Cheap check on the last 64 KB and the start.
  const text = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 65536))) + new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  return /\/Encrypt\s/.test(text);
};

// AES-256. The owner password is random and never shown: if it matched the
// open password, anyone who could open the file would get full rights and the
// print/copy/edit limits would mean nothing.
const randomPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
export async function protect(bytes, password, { allowPrint = true, allowCopy = false, allowEdit = false } = {}) {
  if (!password || password.length < 4) throw new Error('Use a password of at least 4 characters.');
  if (isEncrypted(bytes)) throw new Error('This PDF already has a password. Unlock it first.');
  const restrict = ['--print=' + (allowPrint ? 'full' : 'none'), '--extract=' + (allowCopy ? 'y' : 'n'), '--modify=' + (allowEdit ? 'all' : 'none')];
  return qpdf(['/in.pdf', '--encrypt', password, randomPassword(), '256', ...restrict, '--', '/out.pdf'], bytes);
}

export async function unlock(bytes, password) {
  try { return await qpdf(['--password=' + (password || ''), '--decrypt', '/in.pdf', '/out.pdf'], bytes); }
  catch (error) { throw new Error(/invalid password/i.test(error.message) ? 'That password isn’t right.' : 'This PDF couldn’t be unlocked. It may be damaged.'); }
}

// qpdf first. This WASM build can't run qpdf's own xref reconstruction (it
// needs C++ exceptions), so if qpdf gives up, pdf-lib takes over: it reads the
// file object by object without trusting the xref table, then writes a clean one.
export async function repair(bytes) {
  try { return await qpdf(['/in.pdf', '/out.pdf'], bytes); } catch { /* fall through */ }
  try {
    const { PDFDocument } = await libs.pdfLib();
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
    if (!doc.getPageCount()) throw new Error('no pages');
    return await doc.save();
  } catch { throw new Error('This PDF is too damaged to repair.'); }
}

async function lossless(bytes) {
  try { return await qpdf(['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '/in.pdf', '/out.pdf'], bytes); }
  catch { return bytes; }
}

export const COMPRESS = {
  light: { maxSide: 2400, quality: 0.82, label: 'Light' },
  balanced: { maxSide: 1600, quality: 0.7, label: 'Balanced' },
  strong: { maxSide: 1100, quality: 0.55, label: 'Strong' },
};

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Text encodings some PDF writers wrap around image data, e.g.
// [/ASCII85Decode /DCTDecode]. Anything else and the image is left alone.
function ascii85(bytes) {
  const out = []; let group = [], i = 0;
  if (bytes[0] === 60 && bytes[1] === 126) i = 2; // <~
  for (; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 126) break; // ~>
    if (c <= 32) continue;
    if (c === 122 && !group.length) { out.push(0, 0, 0, 0); continue; } // z
    group.push(c - 33);
    if (group.length === 5) { let n = 0; for (const d of group) n = n * 85 + d; out.push(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); group = []; }
  }
  if (group.length) { const k = group.length; while (group.length < 5) group.push(84); let n = 0; for (const d of group) n = n * 85 + d; out.push(...[n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].slice(0, k - 1)); }
  return new Uint8Array(out);
}
function asciiHex(bytes) {
  const text = new TextDecoder('latin1').decode(bytes).replace(/>.*$/s, '').replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(Math.ceil(text.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt((text.slice(i * 2, i * 2 + 2) + '0').slice(0, 2), 16);
  return out;
}
const UNWRAP = { '/ASCII85Decode': ascii85, '/ASCIIHexDecode': asciiHex, '/FlateDecode': inflate };
async function unwrap(bytes, wrappers) { for (const f of wrappers) bytes = await UNWRAP[f](bytes); return bytes; }
export const _test = { ascii85, asciiHex };

// Shrinks photos inside the PDF. Text, vector drawings and fonts are untouched.
// Returns { bytes, before, after, images } and never makes the file bigger.
export async function compress(bytes, level = 'balanced', onProgress) {
  const preset = COMPRESS[level] || COMPRESS.balanced;
  const { PDFName, PDFRawStream, PDFNumber, PDFArray } = await libs.pdfLib();
  const doc = await openPdf(bytes);
  const context = doc.context;
  const candidates = context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
  let done = 0, shrunk = 0;
  for (const [ref, stream] of candidates) {
    onProgress?.(++done, candidates.length);
    const dict = stream.dict;
    const filterObj = dict.get(PDFName.of('Filter'));
    const filters = filterObj instanceof PDFArray ? filterObj.asArray().map(String) : filterObj ? [String(filterObj)] : [];
    const filter = filters.at(-1);
    const wrappers = filters.slice(0, -1);
    if (!wrappers.every((f) => UNWRAP[f]) || (wrappers.length && dict.has(PDFName.of('DecodeParms')))) continue;
    const width = dict.get(PDFName.of('Width'))?.asNumber?.() || 0, height = dict.get(PDFName.of('Height'))?.asNumber?.() || 0;
    const bpc = dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.();
    if (width * height < 90_000 || dict.has(PDFName.of('ImageMask')) || dict.has(PDFName.of('Mask'))) continue;
    let space = dict.get(PDFName.of('ColorSpace'));
    if (space && !(space instanceof PDFName)) space = context.lookup(space);
    const spaceName = space instanceof PDFName ? space.toString() : space instanceof PDFArray ? space.get(0).toString() : '';
    const channels = spaceName === '/DeviceRGB' ? 3 : spaceName === '/DeviceGray' ? 1 : spaceName === '/ICCBased' ? context.lookup(space.get(1))?.dict?.get(PDFName.of('N'))?.asNumber?.() : null;
    let bitmap;
    try {
      if (filter === '/DCTDecode') {
        if (dict.has(PDFName.of('Decode'))) continue; // inverted CMYK and friends: leave alone
        bitmap = await createImageBitmap(new Blob([await unwrap(stream.contents, wrappers)], { type: 'image/jpeg' }));
      } else if (filter === '/FlateDecode' && bpc === 8 && (channels === 3 || channels === 1) && !dict.has(PDFName.of('DecodeParms'))) {
        const raw = await inflate(await unwrap(stream.contents, wrappers));
        if (raw.length < width * height * channels) continue;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0, j = 0; i < width * height; i++, j += channels) {
          rgba[i * 4] = raw[j]; rgba[i * 4 + 1] = raw[channels === 3 ? j + 1 : j]; rgba[i * 4 + 2] = raw[channels === 3 ? j + 2 : j]; rgba[i * 4 + 3] = 255;
        }
        bitmap = await createImageBitmap(new ImageData(rgba, width, height));
      } else continue;
    } catch { continue; }
    const scale = Math.min(1, preset.maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, w, h); bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: preset.quality });
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    if (jpeg.length >= stream.contents.length * 0.9) continue;
    const next = dict.clone(context);
    next.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    next.delete(PDFName.of('DecodeParms'));
    next.set(PDFName.of('Width'), PDFNumber.of(w));
    next.set(PDFName.of('Height'), PDFNumber.of(h));
    next.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    next.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
    next.set(PDFName.of('Length'), PDFNumber.of(jpeg.length));
    context.assign(ref, PDFRawStream.of(next, jpeg));
    shrunk++;
  }
  const resaved = shrunk ? await doc.save({ useObjectStreams: true }) : bytes;
  const final = await lossless(resaved);
  const best = [bytes, resaved, final].reduce((a, b) => (b.length < a.length ? b : a));
  return { bytes: best, before: bytes.length, after: best.length, images: shrunk, candidates: candidates.length };
}

// Draws a signature image (PNG bytes) on one page. x, y, width are fractions of
// the page, measured from the top left, so they match the on-screen preview.
export async function sign(bytes, png, { page = 0, x = 0.6, y = 0.8, width = 0.28 } = {}) {
  const doc = await openPdf(bytes);
  const target = doc.getPage(page);
  const image = await doc.embedPng(png);
  const { width: pw, height: ph } = target.getSize();
  const rotation = target.getRotation().angle % 360;
  if (rotation) throw new Error('This page is rotated. Straighten it with Reorder and rotate first.');
  const w = pw * width, h = w * image.height / image.width;
  target.drawImage(image, { x: pw * Math.min(x, 1 - width), y: Math.max(0, ph - ph * y - h), width: w, height: h });
  return doc.save();
}
