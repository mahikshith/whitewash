// OCR with Tesseract (English, LSTM engine), fully on this device. Images and
// scanned PDF pages become text, or a searchable PDF that keeps the page images
// and puts invisible, selectable text on top.
import * as libs from './libs.js';

const MAX_PAGES = 50;

async function makeWorker(onProgress) {
  const T = await libs.tesseract();
  return T.createWorker('eng', 1, {
    ...libs.tesseractPaths(),
    logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
    errorHandler: () => {},
  });
}

// sources: [Blob|ImageBitmap|HTMLCanvasElement]. Returns { pages: [{ text, confidence, pdf }] }.
export async function recognize(sources, { pdf = false, onPage } = {}) {
  if (sources.length > MAX_PAGES) throw new Error('Up to ' + MAX_PAGES + ' pages at a time.');
  let worker;
  try { worker = await makeWorker((p) => onPage?.(current, sources.length, p)); }
  catch { throw new Error('The text reader couldn’t start. Reload the page and try again.'); }
  let current = 0;
  const pages = [];
  try {
    for (const source of sources) {
      current++;
      onPage?.(current, sources.length, 0);
      const { data } = await worker.recognize(source, {}, { text: true, pdf });
      pages.push({ text: data.text || '', confidence: data.confidence || 0, pdf: data.pdf ? new Uint8Array(data.pdf) : null });
    }
  } finally { await worker.terminate().catch(() => {}); }
  return { pages };
}

// Joins one-page PDFs from Tesseract into one searchable PDF. Tesseract sizes
// a page from the image's DPI, and a rendered page has none, so pages that came
// from a PDF are scaled back to the width (in points) they started at.
export async function joinPdfs(parts, widths = []) {
  const { PDFDocument } = await libs.pdfLib();
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const [i, bytes] of parts.entries()) {
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    for (const page of await out.copyPages(src, src.getPageIndices())) {
      const factor = widths[i] ? widths[i] / page.getWidth() : 1;
      if (Math.abs(factor - 1) > 0.01) page.scale(factor, factor);
      out.addPage(page);
    }
  }
  return out.save();
}

// Pages of a PDF as canvases at OCR resolution (about 200 dpi).
export async function pdfPagesForOcr(bytes, onPage) {
  const { renderPages, pageCount } = await import('./conv-pdf.js');
  const count = await pageCount(bytes);
  if (count > MAX_PAGES) throw new Error('This PDF has ' + count + ' pages. Up to ' + MAX_PAGES + ' at a time.');
  const scale = 2.8;
  const { images } = await renderPages(bytes, { scale, type: 'image/png', onPage });
  return images.map((image) => Object.assign(image.blob, { pageWidth: image.width / scale }));
}
