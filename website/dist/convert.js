// The conversion map: which formats go to which, and how. Every route runs on
// this device with the engines in conv-doc.js, conv-data.js, conv-pdf.js and
// the browser canvas.
import * as libs from './libs.js';
import * as docs from './conv-doc.js';
import * as data from './conv-data.js';
import { AUDIO_IN, AUDIO_OUT } from './conv-audio.js';
import { ARCHIVE_IN, ARCHIVE_OUT, EXTENSION, archiveFormat, stripArchiveExtension } from './conv-archive.js';

export const FORMATS = {
  txt: { label: 'TXT', name: 'Plain text', mime: 'text/plain' },
  md: { label: 'Markdown', name: 'Markdown', mime: 'text/markdown' },
  html: { label: 'HTML', name: 'Web page', mime: 'text/html' },
  docx: { label: 'Word', name: 'Word document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  odt: { label: 'ODT', name: 'OpenDocument text', mime: 'application/vnd.oasis.opendocument.text' },
  rtf: { label: 'RTF', name: 'Rich text', mime: 'application/rtf' },
  epub: { label: 'EPUB', name: 'E-book', mime: 'application/epub+zip' },
  pdf: { label: 'PDF', name: 'PDF', mime: 'application/pdf' },
  pptx: { label: 'PowerPoint', name: 'Slide deck', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  csv: { label: 'CSV', name: 'Comma-separated values', mime: 'text/csv' },
  tsv: { label: 'TSV', name: 'Tab-separated values', mime: 'text/tab-separated-values' },
  json: { label: 'JSON', name: 'JSON', mime: 'application/json' },
  xlsx: { label: 'Excel', name: 'Excel workbook', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ods: { label: 'ODS', name: 'OpenDocument spreadsheet', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  srt: { label: 'SRT', name: 'Subtitles', mime: 'application/x-subrip' },
  vtt: { label: 'VTT', name: 'Web subtitles', mime: 'text/vtt' },
  jpg: { label: 'JPG', name: 'JPEG image', mime: 'image/jpeg' },
  png: { label: 'PNG', name: 'PNG image', mime: 'image/png' },
  webp: { label: 'WebP', name: 'WebP image', mime: 'image/webp' },
  gif: { label: 'GIF', name: 'GIF image', mime: 'image/gif' },
  bmp: { label: 'BMP', name: 'Bitmap image', mime: 'image/bmp' },
  avif: { label: 'AVIF', name: 'AVIF image', mime: 'image/avif' },
  svg: { label: 'SVG', name: 'SVG image', mime: 'image/svg+xml' },
  tiff: { label: 'TIFF', name: 'TIFF image', mime: 'image/tiff' },
  ico: { label: 'ICO', name: 'Icon', mime: 'image/x-icon' },
  mp3: { label: 'MP3', name: 'MP3 audio', mime: 'audio/mpeg' },
  wav: { label: 'WAV', name: 'WAV audio', mime: 'audio/wav' },
  flac: { label: 'FLAC', name: 'FLAC audio (lossless)', mime: 'audio/flac' },
  ogg: { label: 'OGG', name: 'Ogg audio (Opus)', mime: 'audio/ogg' },
  opus: { label: 'Opus', name: 'Opus audio', mime: 'audio/opus' },
  m4a: { label: 'M4A', name: 'M4A audio (AAC)', mime: 'audio/mp4' },
  aac: { label: 'AAC', name: 'AAC audio', mime: 'audio/aac' },
  weba: { label: 'WEBA', name: 'WebM audio', mime: 'audio/webm' },
  mp4: { label: 'MP4', name: 'MP4 video (sound only)', mime: 'video/mp4' },
  mov: { label: 'MOV', name: 'QuickTime video (sound only)', mime: 'video/quicktime' },
  mkv: { label: 'MKV', name: 'Matroska video (sound only)', mime: 'video/x-matroska' },
  webm: { label: 'WebM', name: 'WebM video (sound only)', mime: 'video/webm' },
  zip: { label: 'ZIP', name: 'ZIP archive', mime: 'application/zip' },
  '7z': { label: '7Z', name: '7-Zip archive', mime: 'application/x-7z-compressed' },
  rar: { label: 'RAR', name: 'RAR archive', mime: 'application/vnd.rar' },
  tar: { label: 'TAR', name: 'TAR archive', mime: 'application/x-tar' },
  tgz: { label: 'TAR.GZ', name: 'Gzipped TAR archive', mime: 'application/gzip' },
  tbz2: { label: 'TAR.BZ2', name: 'Bzip2 TAR archive', mime: 'application/x-bzip2' },
  txz: { label: 'TAR.XZ', name: 'XZ TAR archive', mime: 'application/x-xz' },
  gz: { label: 'GZ', name: 'Gzip file', mime: 'application/gzip' },
  bz2: { label: 'BZ2', name: 'Bzip2 file', mime: 'application/x-bzip2' },
  xz: { label: 'XZ', name: 'XZ file', mime: 'application/x-xz' },
};
export const FAMILY = (id) => AUDIO_IN.includes(id) ? 'audio' : ARCHIVE_IN.includes(id) ? 'archive' : null;
const ALIASES = { htm: 'html', xhtml: 'html', markdown: 'md', jpeg: 'jpg', text: 'txt', tif: 'tiff', m4v: 'mp4', oga: 'ogg', wave: 'wav' };
// MIME types browsers report that differ from the ones above.
const MIME_ALIASES = { 'audio/mp3': 'mp3', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/x-flac': 'flac', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'application/x-zip-compressed': 'zip', 'application/x-rar-compressed': 'rar', 'application/x-gzip': 'gz', 'application/x-tar': 'tar' };

const DOC_IN = ['txt', 'md', 'html', 'docx', 'odt', 'epub', 'pdf', 'pptx'];
const DOC_OUT = ['pdf', 'docx', 'md', 'html', 'txt', 'odt', 'rtf', 'epub', 'pptx'];
const DATA_IN = ['csv', 'tsv', 'json', 'xlsx', 'ods'];
const DATA_OUT = ['xlsx', 'csv', 'tsv', 'json', 'ods', 'md', 'html', 'pdf', 'docx'];
const TABLE_ONLY = ['csv', 'tsv', 'json', 'xlsx', 'ods'];
const SUBS = ['srt', 'vtt'];
const IMAGE_IN = ['jpg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg'];
const IMAGE_OUT = ['jpg', 'png', 'webp', 'pdf', 'bmp', 'tiff', 'ico'];

export function detectFormat(file) {
  const archive = archiveFormat(file.name || '');
  if (archive) return archive;
  const extension = (file.name || '').includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  const id = ALIASES[extension] || extension;
  if (FORMATS[id]) return id;
  return MIME_ALIASES[file.type] || Object.keys(FORMATS).find((key) => FORMATS[key].mime === file.type) || null;
}

export function targets(from) {
  const out = new Set();
  if (DOC_IN.includes(from)) DOC_OUT.forEach((t) => out.add(t));
  if (from === 'pdf') ['jpg', 'png', 'webp'].forEach((t) => out.add(t));
  if (DATA_IN.includes(from)) DATA_OUT.forEach((t) => out.add(t));
  if (from === 'html' || from === 'md') ['xlsx', 'csv', 'json'].forEach((t) => out.add(t));
  if (SUBS.includes(from)) [...SUBS, 'txt'].forEach((t) => out.add(t));
  if (IMAGE_IN.includes(from)) IMAGE_OUT.forEach((t) => out.add(t));
  if (AUDIO_IN.includes(from)) AUDIO_OUT.forEach((t) => out.add(t));
  if (ARCHIVE_IN.includes(from)) ARCHIVE_OUT.forEach((t) => out.add(t));
  out.delete(from);
  return [...out];
}

export const conversionCount = () => Object.keys(FORMATS).reduce((sum, id) => sum + targets(id).length, 0);
export const inputFormats = () => Object.keys(FORMATS).filter((id) => targets(id).length);
export const acceptList = () => inputFormats().map((id) => '.' + (EXTENSION[id] || id)).concat(['.htm', '.jpeg', '.markdown', '.tgz', '.m4v']).join(',');

const baseName = (name) => (name || 'file').replace(/\.[^.]+$/, '') || 'file';
// UTF-16 files carry a byte-order mark. Anything that isn't valid UTF-8 is
// read as Windows-1252 so accented letters in old files don't turn into �.
const text = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const label = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  let decoded;
  try { decoded = new TextDecoder(label, { fatal: label === 'utf-8' }).decode(bytes); } catch { decoded = new TextDecoder('windows-1252').decode(bytes); }
  return decoded.replace(/^\ufeff/, '');
};
const bytesOf = async (file) => new Uint8Array(await file.arrayBuffer());

// ---------- Subtitles ----------
export function parseSubtitles(source) {
  const cues = [];
  for (const block of source.replace(/\r\n?/g, '\n').replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [start, end] = lines[at].split('-->').map((s) => s.trim().split(/\s+/)[0]);
    cues.push({ start: normaliseTime(start), end: normaliseTime(end), text: lines.slice(at + 1).join('\n') });
  }
  if (!cues.length) throw new Error('No subtitles found in this file.');
  return cues;
}
function normaliseTime(time) {
  const parts = time.replace(',', '.').split(':');
  if (parts.length === 2) parts.unshift('00');
  const [h, m, s] = parts;
  const [whole, ms = '0'] = s.split('.');
  return h.padStart(2, '0') + ':' + m.padStart(2, '0') + ':' + whole.padStart(2, '0') + '.' + ms.padEnd(3, '0').slice(0, 3);
}
export const writeSrt = (cues) => cues.map((c, i) => (i + 1) + '\n' + c.start.replace('.', ',') + ' --> ' + c.end.replace('.', ',') + '\n' + c.text).join('\n\n') + '\n';
export const writeVtt = (cues) => 'WEBVTT\n\n' + cues.map((c) => c.start + ' --> ' + c.end + '\n' + c.text).join('\n\n') + '\n';

// ---------- Documents and tables ----------
async function readDoc(file, from, progress) {
  if (from === 'txt') return docs.blocksFromText(await text(file));
  if (from === 'md') return docs.resolveImages(docs.blocksFromMarkdown(await text(file), await libs.marked()));
  if (from === 'html') return docs.resolveImages(docs.blocksFromHtml(await text(file)));
  if (from === 'docx') return docs.blocksFromDocx(await bytesOf(file));
  if (from === 'odt') return docs.blocksFromHtml(await docs.htmlFromOdt(await bytesOf(file)));
  if (from === 'epub') return docs.blocksFromEpub(await bytesOf(file));
  if (from === 'pptx') return (await import('./pptx-read.js')).blocksFromPptx(await bytesOf(file));
  if (from === 'pdf') {
    const { extractPages, blocksFromPdfPages } = await import('./pdf-extract.js');
    const doc = blocksFromPdfPages(await extractPages(await bytesOf(file), { onPage: (n, total) => progress?.('Reading page ' + n + ' of ' + total) }));
    if (doc.blocks.some((b) => b.t !== 'img')) return doc;
    // Scanned pages have no text to copy, so read them with OCR instead.
    const ocr = await import('./conv-ocr.js');
    const sources = await ocr.pdfPagesForOcr(await bytesOf(file), (n, total) => progress?.('Preparing page ' + n + ' of ' + total));
    const read = await ocr.recognize(sources, { onPage: (n, total) => progress?.('Reading scanned page ' + n + ' of ' + total) });
    const scanned = ocr.blocksFromOcr(read.pages);
    if (!scanned.blocks.length) throw new Error('No text found in this PDF, even after reading it as a scan.');
    return scanned;
  }
  if (DATA_IN.includes(from)) return docs.blocksFromTable(await readTable(file, from));
  throw new Error('Can’t read ' + from + ' files yet.');
}

export async function readTable(file, from) {
  if (from === 'csv' || from === 'tsv') return { sheets: [{ name: baseName(file.name), rows: data.parseDelimited(await text(file), from === 'tsv' ? '\t' : undefined) }] };
  if (from === 'json') return data.parseJson(await text(file));
  if (from === 'xlsx') return data.readXlsx(await bytesOf(file));
  if (from === 'ods') return data.readOds(await bytesOf(file));
  if (from === 'html') return data.tableFromHtml(docs.inertHtml(await text(file)));
  if (from === 'md') return data.tableFromMarkdown(await text(file));
  throw new Error('Can’t read a table from ' + from + '.');
}

async function writeDoc(doc, to) {
  if (to === 'txt') return docs.toText(doc);
  if (to === 'md') return docs.toMarkdown(doc);
  if (to === 'html') return docs.toHtml(doc);
  if (to === 'docx') return docs.toDocx(doc);
  if (to === 'odt') return docs.toOdt(doc);
  if (to === 'rtf') return docs.toRtf(doc);
  if (to === 'epub') return docs.toEpub(doc);
  if (to === 'pdf') return docs.toPdf(doc, libs);
  if (to === 'pptx') { const { writePptx, blocksToSlides } = await import('./pptx-write.js'); return writePptx(blocksToSlides(doc)); }
  throw new Error('Can’t write ' + to + '.');
}

function writeTable(table, to) {
  if (to === 'csv') return data.writeDelimited(table.sheets[0].rows, ',');
  if (to === 'tsv') return data.writeDelimited(table.sheets[0].rows, '\t');
  if (to === 'json') return data.writeJson(table);
  if (to === 'xlsx') return data.writeXlsx(table);
  if (to === 'ods') return data.writeOds(table);
  if (to === 'md') return data.writeMarkdown(table);
  return null;
}

// ---------- Images ----------
async function decodeImage(file, from) {
  if (from === 'svg') {
    const url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode().catch(() => { throw new Error('Couldn’t draw this SVG.'); });
      let width = image.naturalWidth || 1024, height = image.naturalHeight || 1024;
      const scale = Math.max(1, 1024 / Math.max(width, height));
      return { source: image, width: Math.round(width * scale), height: Math.round(height * scale) };
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  try { const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); return { source: bitmap, width: bitmap.width, height: bitmap.height }; }
  catch { throw new Error('Couldn’t read this image. It may be damaged or use a format this browser can’t open.'); }
}

function canvasFor(image, width = image.width, height = image.height, background) {
  if (width * height > 100_000_000) throw new Error('That image is over 100 megapixels.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (background) { context.fillStyle = background; context.fillRect(0, 0, width, height); }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image.source, 0, 0, width, height);
  return { canvas, context };
}
const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob && blob.type === type ? resolve(blob) : reject(new Error('This browser can’t save ' + FORMATS[Object.keys(FORMATS).find((k) => FORMATS[k].mime === type)]?.label + ' files.')), type, quality));

async function writeImage(file, from, to) {
  const image = await decodeImage(file, from);
  try {
    if (to === 'jpg' || to === 'png' || to === 'webp') return await toBlob(canvasFor(image, undefined, undefined, to === 'jpg' ? '#fff' : null).canvas, FORMATS[to].mime, 0.9);
    const codecs = await import('./image-codecs.js');
    if (to === 'bmp' || to === 'tiff') {
      const { context, canvas } = canvasFor(image);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      return new Blob([to === 'bmp' ? codecs.encodeBMP(pixels) : codecs.encodeTIFF(pixels)], { type: FORMATS[to].mime });
    }
    if (to === 'ico') {
      const sizes = [16, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(image.width, image.height) || s <= 48);
      const pngs = [];
      for (const size of sizes) {
        const scale = Math.min(size / image.width, size / image.height);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high';
        const w = image.width * scale, h = image.height * scale;
        context.drawImage(image.source, (size - w) / 2, (size - h) / 2, w, h);
        pngs.push({ width: size, height: size, bytes: new Uint8Array(await (await toBlob(canvas, 'image/png')).arrayBuffer()) });
      }
      return new Blob([codecs.encodeICO(pngs)], { type: FORMATS.ico.mime });
    }
    if (to === 'pdf') {
      const keepPng = from === 'png' || from === 'svg' || from === 'gif' || from === 'webp' || from === 'bmp' || from === 'avif';
      const bytes = from === 'jpg' ? await bytesOf(file) : new Uint8Array(await (await toBlob(canvasFor(image, undefined, undefined, keepPng ? null : '#fff').canvas, keepPng ? 'image/png' : 'image/jpeg', 0.92)).arrayBuffer());
      const { imagesToPdf } = await import('./conv-pdf.js');
      return new Blob([await imagesToPdf([{ bytes, type: from === 'jpg' ? 'image/jpeg' : keepPng ? 'image/png' : 'image/jpeg' }])], { type: FORMATS.pdf.mime });
    }
  } finally { image.source.close?.(); }
  throw new Error('Can’t make ' + to + ' from an image.');
}

// ---------- Entry point ----------
// Returns [{ blob, name }]. Most routes give one file; PDF → images gives one per page.
export async function convertFile(file, to, progress) {
  const from = detectFormat(file);
  if (!from) throw new Error('Whitewash doesn’t recognise this file type.');
  if (!targets(from).includes(to)) throw new Error(FORMATS[from].label + ' to ' + FORMATS[to].label + ' isn’t supported.');
  const family = FAMILY(from);
  if (family === 'audio') {
    const { convertAudio } = await import('./conv-audio.js');
    progress?.('Converting sound');
    const blob = await convertAudio(file, to, { onProgress: (p) => progress?.('Converting sound ' + Math.round(p * 100) + '%') });
    return [{ blob, name: baseName(file.name) + '.' + to }];
  }
  if (family === 'archive') {
    const { readArchive, writeArchive } = await import('./conv-archive.js');
    progress?.('Opening ' + FORMATS[from].label);
    const entries = await readArchive(file, (n) => progress?.('Unpacked ' + n + (n === 1 ? ' file' : ' files')));
    progress?.('Packing ' + FORMATS[to].label);
    const base = stripArchiveExtension(file.name);
    return [{ blob: await writeArchive(entries, to), name: base + '.' + (EXTENSION[to] || to) }];
  }
  if (file.size > 60_000_000) throw new Error('That file is over 60 MB.');
  const name = baseName(file.name) + '.' + to;
  const wrap = (content) => [{ blob: content instanceof Blob ? content : new Blob([content], { type: FORMATS[to].mime + (typeof content === 'string' ? ';charset=utf-8' : '') }), name }];

  if (IMAGE_IN.includes(from)) return wrap(await writeImage(file, from, to));
  if (from === 'pdf' && ['jpg', 'png', 'webp'].includes(to)) {
    const { renderPages } = await import('./conv-pdf.js');
    const { images } = await renderPages(await bytesOf(file), { type: FORMATS[to].mime, scale: 2, onPage: (n, total) => progress?.('Drawing page ' + n + ' of ' + total) });
    return images.map((image) => ({ blob: image.blob, name: baseName(file.name) + '-page-' + String(image.page).padStart(String(images.length).length, '0') + '.' + to }));
  }
  // Two routes are about how pages look, not how text flows, so they skip the
  // block list: slides are drawn onto PDF pages, and PDF pages become slides.
  if (from === 'pptx' && to === 'pdf') {
    const { pptxToPdf } = await import('./pptx-render.js');
    return wrap(await pptxToPdf(await bytesOf(file), libs, (n, total) => progress?.('Drawing slide ' + n + ' of ' + total)));
  }
  if (from === 'pdf' && to === 'pptx') {
    const { pdfToPptx } = await import('./pdf-to-pptx.js');
    return wrap(await pdfToPptx(await bytesOf(file), { onPage: (n, total) => progress?.('Rebuilding page ' + n + ' of ' + total) }));
  }
  if (SUBS.includes(from)) {
    const cues = parseSubtitles(await text(file));
    return wrap(to === 'srt' ? writeSrt(cues) : to === 'vtt' ? writeVtt(cues) : cues.map((c) => c.text).join('\n') + '\n');
  }
  if (TABLE_ONLY.includes(to) || (DATA_IN.includes(from) && to === 'md')) {
    const table = await readTable(file, from);
    // CSV and TSV hold one table, so a workbook with several sheets gives one file per sheet.
    if ((to === 'csv' || to === 'tsv') && table.sheets.length > 1) {
      return table.sheets.map((sheet) => ({ blob: new Blob([writeTable({ sheets: [sheet] }, to)], { type: FORMATS[to].mime + ';charset=utf-8' }), name: baseName(file.name) + '-' + (sheet.name || 'sheet').replace(/[\\/:*?"<>|]+/g, '_') + '.' + to }));
    }
    return wrap(await writeTable(table, to));
  }
  progress?.('Reading ' + FORMATS[from].label);
  const doc = await readDoc(file, from, progress);
  if (!doc.title) doc.title = baseName(file.name);
  progress?.('Writing ' + FORMATS[to].label);
  // Markdown can't hold pictures, so they are saved beside it and linked.
  const pictures = to === 'md' ? doc.blocks.filter((b) => b.t === 'img') : [];
  if (pictures.length) {
    const stem = baseName(file.name).replace(/[^\w.-]+/g, '-') || 'file';
    const names = pictures.map((b, i) => stem + '-image-' + (i + 1) + (b.mime === 'image/jpeg' ? '.jpg' : '.png'));
    const markdown = docs.toMarkdown(doc, { image: (_, i) => names[i] });
    return [...wrap(markdown), ...pictures.map((b, i) => ({ blob: new Blob([b.bytes], { type: b.mime }), name: names[i] }))];
  }
  return wrap(await writeDoc(doc, to));
}

// Text for the polish tool, from any document format.
export async function extractText(file, progress) {
  const from = detectFormat(file);
  if (!DOC_IN.includes(from)) throw new Error('Can’t pull text out of this file.');
  return docs.toText(await readDoc(file, from, progress));
}
