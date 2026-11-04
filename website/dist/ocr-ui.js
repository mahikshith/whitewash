// "Read text from scans": images or scanned PDFs → text, polish, or a
// searchable PDF.
import { recognize, joinPdfs, pdfPagesForOcr } from './conv-ocr.js';
import { fileKind } from './actions.js';
import { dropZone } from './files.js';
import * as island from './island.js';

const $ = (id) => document.getElementById(id);
let generation = 0, result = null, baseName = 'scan', onPolish = null;
export const setOcrPolishHandler = (fn) => { onPolish = fn; };

export function showOcr(tool) {
  if (!tool) { generation++; return; }
  $('ocr-title').textContent = tool.title;
  $('ocr-description').textContent = tool.description;
}

export async function loadOcr(list) {
  const version = ++generation;
  $('ocr-error').hidden = true; $('ocr-output').hidden = false; $('ocr-text').value = ''; result = null;
  const pdfs = list.filter((f) => fileKind(f) === 'pdf'), images = list.filter((f) => fileKind(f) === 'image');
  if (!pdfs.length && !images.length) { $('ocr-output').hidden = true; fail('Use photos or scans (JPG, PNG, WebP) or a scanned PDF.'); return; }
  if (pdfs.length > 1 || (pdfs.length && images.length)) { $('ocr-output').hidden = true; fail('Use one PDF, or a set of images, at a time.'); return; }
  baseName = (list[0].name || 'scan').replace(/\.[^.]+$/, '');
  const say = (text) => { if (version === generation) $('ocr-summary').textContent = text; };
  try {
    say('Getting pages ready…');
    const sources = pdfs.length ? await pdfPagesForOcr(new Uint8Array(await pdfs[0].arrayBuffer()), (n, total) => say('Preparing page ' + n + ' of ' + total + '…')) : images;
    say('Starting the text reader…');
    const widths = sources.map((source) => source.pageWidth);
    result = await recognize(sources, { pdf: true, onPage: (n, total, p) => say('Reading page ' + n + ' of ' + total + '… ' + Math.round(p * 100) + '%') });
    if (version !== generation) return;
    result.widths = widths;
    const text = result.pages.map((p) => p.text.trim()).join('\n\n');
    const confidence = Math.round(result.pages.reduce((s, p) => s + p.confidence, 0) / result.pages.length);
    $('ocr-text').value = text;
    say(text.trim() ? 'Found ' + text.split(/\s+/).filter(Boolean).length.toLocaleString() + ' words on ' + result.pages.length + (result.pages.length === 1 ? ' page' : ' pages') + ' · ' + (confidence >= 85 ? 'clear read' : confidence >= 65 ? 'mostly clear, check it' : 'hard to read, check carefully') : 'No text found. Try a sharper, straighter scan.');
  } catch (error) { if (version === generation) { $('ocr-output').hidden = true; fail(error.message); } }
}

function fail(message) { $('ocr-error').textContent = message; $('ocr-error').hidden = false; }

$('ocr-pick').addEventListener('click', () => $('ocr-input').click());
$('ocr-input').addEventListener('change', () => { const list = [...$('ocr-input').files]; $('ocr-input').value = ''; if (list.length) loadOcr(list); });
$('ocr-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('ocr-text').value); island.done('Copied', 'The text is on your clipboard'); } catch { $('ocr-text').select(); } });
$('ocr-save').addEventListener('click', () => island.saveBlob(new Blob([$('ocr-text').value], { type: 'text/plain;charset=utf-8' }), baseName + '.txt'));
$('ocr-polish').addEventListener('click', () => onPolish?.($('ocr-text').value, baseName + '.txt'));
$('ocr-pdf').addEventListener('click', async () => {
  if (!result?.pages.every((p) => p.pdf)) return;
  try { island.saveBlob(new Blob([await joinPdfs(result.pages.map((p) => p.pdf), result.widths)], { type: 'application/pdf' }), baseName + '-searchable.pdf'); }
  catch (error) { fail('Couldn’t build the searchable PDF: ' + error.message); }
});
dropZone($('ocr-view'), loadOcr);
