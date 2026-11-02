// One-click Humanize: drop a document, get the same kind of file back with the
// AI filler, stock phrases, chatbot leftovers and hidden characters gone.
// Word, PowerPoint and Excel are edited in place, so every style, table and
// picture stays exactly where it was. PDFs, web pages, ODT and EPUB have no
// editable text layer in the browser, so they come back as Word files.
import { proposeEdits, applyEdits } from './engine.js';
import { detectFormat, convertFile } from './convert.js';
import { readTextFile } from './uploads.js';
import { IN_PLACE, VIA_WORD } from './actions.js';

const OFFICE_MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
export const HUMANIZE = { mode: 'humanize', zeroWidth: true, punctuation: true };
const CLEAN = { mode: 'clean', zeroWidth: true };

// What changed, in words a person reads in one glance.
export function summarize(edits) {
  const count = (kind) => edits.filter((e) => e.kind === kind).length;
  const parts = [];
  const phrases = edits.filter((e) => e.kind === 'clarity' && !/^Capitalise/.test(e.reason)).length, hidden = edits.filter((e) => e.kind === 'cleanup' && /space|hyphen|byte-order/i.test(e.reason)).length;
  const junk = count('artifact'), other = edits.filter((e) => e.kind === 'cleanup').length - hidden;
  if (phrases) parts.push(phrases + (phrases === 1 ? ' AI phrase' : ' AI phrases'));
  if (hidden) parts.push(hidden + (hidden === 1 ? ' hidden character' : ' hidden characters'));
  if (junk) parts.push(junk + (junk === 1 ? ' chatbot leftover' : ' chatbot leftovers'));
  if (other) parts.push(other + (other === 1 ? ' punctuation fix' : ' punctuation fixes'));
  return parts.length ? 'Fixed ' + parts.join(', ') : 'Nothing to fix, it already reads like you';
}

const base = (name) => name.replace(/\.[^.]+$/, '');

// Returns { blob, name, edits, summary, note }.
export async function humanizeFile(file, kind = 'polish', onStep) {
  const options = kind === 'clean' ? CLEAN : HUMANIZE;
  const suffix = kind === 'clean' ? '-clean' : '-humanized';
  const format = detectFormat(file);
  if (format === 'txt' || format === 'md') {
    const input = await readTextFile(file);
    const edits = proposeEdits(input.text, { ...options, format: input.format });
    const text = applyEdits(input.text, edits);
    return { blob: new Blob([text], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }), name: base(file.name) + suffix + '.' + format, edits, summary: summarize(edits) };
  }
  let bytes, name, note = '';
  if (IN_PLACE.includes(format)) { bytes = new Uint8Array(await file.arrayBuffer()); name = file.name; }
  else if (VIA_WORD.includes(format)) {
    onStep?.('Reading the text');
    const [docx] = await convertFile(file, 'docx');
    bytes = new Uint8Array(await docx.blob.arrayBuffer()); name = base(file.name) + '.docx';
    note = format === 'pdf' ? 'A PDF’s words can’t be edited in place, so you get a Word file.' : 'You get a Word file.';
  } else throw new Error('Humanize works on Word, PowerPoint, Excel, PDF, Markdown and text files.');
  onStep?.('Rewriting');
  const { processOffice } = await import('./office.js');
  const result = await processOffice(bytes, name, options);
  const type = name.match(/\.(docx|pptx|xlsx)$/i)[1].toLowerCase();
  return { blob: new Blob([result.bytes], { type: OFFICE_MIME[type] }), name: base(name) + suffix + '.' + type, edits: result.report.edits, summary: summarize(result.report.edits), note };
}

// Plain text out of any document, for the Edit view.
export async function textOf(file) {
  const format = detectFormat(file);
  if (format === 'txt' || format === 'md') return (await readTextFile(file)).text;
  const { extractText } = await import('./convert.js');
  return extractText(file);
}
