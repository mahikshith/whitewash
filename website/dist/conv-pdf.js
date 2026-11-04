// PDF tools on pdf-lib (editing) and pdf.js (reading and rendering).
import * as libs from './libs.js';
import { wipeImage } from './image-meta.js';

const encrypted = (error) => /encrypt/i.test(String(error?.message));
export async function openPdf(bytes) {
  const { PDFDocument } = await libs.pdfLib();
  try { return await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (error) { throw new Error(encrypted(error) ? 'This PDF is password-protected. Unlock it first.' : 'This PDF looks damaged or isn’t a PDF.'); }
}

// New PDFs carry no producer, creator or dates, so they don't point back to
// any tool, including this one.
async function fresh() { const { PDFDocument } = await libs.pdfLib(); return PDFDocument.create({ updateMetadata: false }); }

export async function merge(files) {
  const out = await fresh();
  for (const bytes of files) {
    const src = await openPdf(bytes);
    for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
  }
  return out.save();
}

// "1-3, 5, 8-" → zero-based indices, in the order written.
export function parseRanges(text, count) {
  const pages = [];
  for (const part of String(text).split(/[,\s]+/).filter(Boolean)) {
    const match = part.match(/^(\d*)\s*-\s*(\d*)$|^(\d+)$/);
    if (!match) throw new Error('Use page numbers like 1-3, 5, 8-.');
    const [start, end] = match[3] ? [Number(match[3]), Number(match[3])] : [Number(match[1] || 1), Number(match[2] || count)];
    if (start < 1 || end > count || start > end) throw new Error('This PDF has ' + count + ' pages. Check the page numbers.');
    for (let p = start; p <= end; p++) pages.push(p - 1);
  }
  if (!pages.length) throw new Error('Type the pages you want, like 1-3, 5.');
  return pages;
}

export async function pickPages(bytes, indices, rotations = {}) {
  const { degrees } = await libs.pdfLib();
  const src = await openPdf(bytes), out = await fresh();
  const pages = await out.copyPages(src, indices);
  pages.forEach((page, i) => { const turn = rotations[indices[i]] || 0; if (turn) page.setRotation(degrees((page.getRotation().angle + turn) % 360)); out.addPage(page); });
  return out.save();
}

export async function splitEvery(bytes) {
  const src = await openPdf(bytes);
  const parts = [];
  for (const index of src.getPageIndices()) parts.push(await pickPages(bytes, [index]));
  return parts;
}

export async function rotateAll(bytes, turn) {
  const { degrees } = await libs.pdfLib();
  const doc = await openPdf(bytes);
  for (const page of doc.getPages()) page.setRotation(degrees((page.getRotation().angle + turn) % 360));
  return doc.save();
}

export async function imagesToPdf(images, { size = 'fit', margin = 0 } = {}) {
  const out = await fresh();
  for (const image of images) {
    // JPEGs are embedded byte for byte, so camera details and GPS would ride
    // along into the PDF. Strip them first.
    let bytes = image.bytes;
    try { bytes = wipeImage(bytes, { keepColorProfile: true }).bytes; } catch { /* not a format the wiper knows: embed as is */ }
    const embedded = image.type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const [pw, ph] = size === 'a4' ? [595.28, 841.89] : size === 'letter' ? [612, 792] : [embedded.width * 0.75 + margin * 2, embedded.height * 0.75 + margin * 2];
    const landscape = size !== 'fit' && embedded.width > embedded.height;
    const [w, h] = landscape ? [ph, pw] : [pw, ph];
    const scale = Math.min((w - margin * 2) / embedded.width, (h - margin * 2) / embedded.height);
    const page = out.addPage([w, h]);
    page.drawImage(embedded, { x: (w - embedded.width * scale) / 2, y: (h - embedded.height * scale) / 2, width: embedded.width * scale, height: embedded.height * scale });
  }
  return out.save();
}

export async function watermark(bytes, text, { opacity = 0.18, size: fixed = 0 } = {}) {
  const { StandardFonts, rgb, degrees } = await libs.pdfLib();
  const doc = await openPdf(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = Array.from(text).map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    // Unless a size is given, the text spans about 70% of the page diagonal.
    const size = fixed || Math.max(18, Math.min(140, Math.hypot(width, height) * 0.7 / font.widthOfTextAtSize(safe, 1)));
    const w = font.widthOfTextAtSize(safe, size);
    const angle = Math.atan2(height, width);
    page.drawText(safe, { x: width / 2 - (w / 2) * Math.cos(angle) + (size / 3) * Math.sin(angle), y: height / 2 - (w / 2) * Math.sin(angle) - (size / 3) * Math.cos(angle), size, font, color: rgb(0.5, 0.5, 0.5), opacity, rotate: degrees(angle * 180 / Math.PI) });
  }
  return doc.save();
}

export async function pageNumbers(bytes, { position = 'bottom-center', format = 'n / total' } = {}) {
  const { StandardFonts, rgb } = await libs.pdfLib();
  const doc = await openPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = format.replace(/\btotal\b/, pages.length).replace(/\bn\b/, i + 1);
    const { width } = page.getSize(), size = 10, w = font.widthOfTextAtSize(label, size);
    const x = position.endsWith('left') ? 36 : position.endsWith('right') ? width - 36 - w : (width - w) / 2;
    const y = position.startsWith('top') ? page.getSize().height - 30 : 22;
    page.drawText(label, { x, y, size, font, color: rgb(0.3, 0.3, 0.3) });
  });
  return doc.save();
}

// Metadata wiper for PDFs: clears the Info dictionary and the XMP stream, then
// reopens the copy to check nothing came back.
const PDF_LABEL = { Author: 'Author', Creator: 'Made with', Producer: 'PDF tool', Title: 'Title', Subject: 'Subject', Keywords: 'Keywords', CreationDate: 'Created', ModDate: 'Last saved', Trapped: 'Print trapping flag' };

export async function scanPdf(bytes) {
  const { PDFName } = await libs.pdfLib();
  const doc = await openPdf(bytes);
  const items = [];
  const info = doc.getInfoDict();
  for (const [key, value] of info.entries()) {
    const name = key.decodeText?.() || key.asString().slice(1);
    let detail = value.decodeText ? value.decodeText() : String(value).replace(/^\((.*)\)$/s, '$1');
    const date = /Date$/.test(name) && String(detail).match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
    if (date) detail = date[1] + '-' + (date[2] || '01') + '-' + (date[3] || '01') + (date[4] ? ' ' + date[4] + ':' + (date[5] || '00') : '');
    items.push({ label: PDF_LABEL[name] || name, detail: String(detail).slice(0, 120), risk: /Author|Creator|Producer|Title/.test(name) ? 'high' : 'medium' });
  }
  const meta = doc.catalog.get(PDFName.of('Metadata'));
  if (meta) items.push({ label: 'XMP metadata', detail: 'Hidden XML block (author, tools, edit history)', risk: 'high' });
  const pieceInfo = doc.catalog.get(PDFName.of('PieceInfo'));
  if (pieceInfo) items.push({ label: 'App private data', detail: 'Editing data left by the app that made the file', risk: 'medium' });
  let pageMeta = 0;
  for (const page of doc.getPages()) if (page.node.get(PDFName.of('Metadata')) || page.node.get(PDFName.of('PieceInfo'))) pageMeta++;
  if (pageMeta) items.push({ label: 'Page metadata', detail: pageMeta + (pageMeta === 1 ? ' page has' : ' pages have') + ' its own hidden data', risk: 'medium' });
  if (doc.context.trailerInfo.ID) items.push({ label: 'Document ID', detail: 'A unique ID that can link copies of this file', risk: 'medium' });
  return { items };
}

export async function wipePdf(bytes) {
  const { PDFName } = await libs.pdfLib();
  const { items } = await scanPdf(bytes);
  const doc = await openPdf(bytes);
  const info = doc.getInfoDict();
  for (const key of [...info.keys()]) info.delete(key);
  for (const key of ['Metadata', 'PieceInfo']) doc.catalog.delete(PDFName.of(key));
  for (const page of doc.getPages()) for (const key of ['Metadata', 'PieceInfo']) page.node.delete(PDFName.of(key));
  // Dropping the key isn't enough: pdf-lib saves every object, referenced or
  // not, so the XMP stream itself would stay in the file. Delete every
  // metadata stream outright, including ones on images and fonts.
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (object?.dict?.get?.(PDFName.of('Type')) === PDFName.of('Metadata')) doc.context.delete(ref);
  }
  delete doc.context.trailerInfo.ID;
  const out = await doc.save({ updateFieldAppearances: false });
  // pdf-lib writes its own Producer and dates on save; strip them from the saved copy too.
  const again = await openPdf(out);
  const left = again.getInfoDict();
  for (const key of [...left.keys()]) left.delete(key);
  delete again.context.trailerInfo.Info;
  delete again.context.trailerInfo.ID;
  const clean = await again.save({ updateFieldAppearances: false });
  // Everything the scan can still find counts, and so does a raw XMP packet.
  const remaining = (await scanPdf(clean)).items;
  if (/<x:xmpmeta|<\?xpacket/.test(new TextDecoder('latin1').decode(clean))) remaining.push({ label: 'XMP metadata', detail: 'Hidden XML block still in the file', risk: 'high' });
  return { bytes: clean, removed: items, remaining };
}

// pdf.js: text and rendering.
export async function loadForReading(bytes) {
  const pdfjs = await libs.pdfjs();
  try { return await pdfjs.getDocument({ data: bytes.slice(), ...libs.pdfjsOptions() }).promise; }
  catch (error) { throw new Error(/password/i.test(error?.message || error?.name) ? 'This PDF is password-protected. Unlock it first.' : 'This PDF looks damaged or isn’t a PDF.'); }
}

export async function textPages(bytes, onPage) {
  const doc = await loadForReading(bytes);
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onPage?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push({ items: content.items.filter((i) => 'str' in i).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], size: Math.hypot(i.transform[2], i.transform[3]) || i.height, width: i.width })) });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

export async function renderPages(bytes, { scale = 2, type = 'image/png', quality = 0.9, pages: only, onPage } = {}) {
  const doc = await loadForReading(bytes);
  const out = [];
  const list = only || Array.from({ length: doc.numPages }, (_, i) => i + 1);
  for (const n of list) {
    onPage?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    if (viewport.width * viewport.height > 40_000_000) throw new Error('Page ' + n + ' is too large to render.');
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (type === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    await page.render({ canvasContext: context, viewport, background: type === 'image/jpeg' ? '#ffffff' : undefined }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    out.push({ page: n, blob, width: canvas.width, height: canvas.height });
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
  const count = doc.numPages;
  await doc.destroy();
  return { images: out, count };
}

export async function pageCount(bytes) { return (await openPdf(bytes)).getPageCount(); }
