// Tables: CSV, TSV, JSON, XLSX, ODS, Markdown and HTML. A table is
// { sheets: [{ name, rows: string[][] }] }. Values are kept as text; spreadsheet
// formulas are read as their last saved result.
import { readZip, unpack, deflateEntry, writeZip } from './office-zip.js';
const BIG = { maxBytes: 60_000_000, maxEntries: 5000 };

const encoder = new TextEncoder(), decoder = new TextDecoder();
const MAX_CELLS = 2_000_000;
const escapeXml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const escapeHtml = escapeXml;

function guard(rows) {
  if (rows.reduce((sum, row) => sum + row.length, 0) > MAX_CELLS) throw new Error('That table has over 2 million cells. Split it first.');
  return rows;
}

export function detectDelimiter(text) {
  const sample = text.slice(0, 5000).split(/\r?\n/).slice(0, 10);
  let best = ',', score = -1;
  for (const delimiter of [',', '\t', ';', '|']) {
    const counts = sample.map((line) => line.split(delimiter).length - 1).filter((n) => n > 0);
    const consistent = counts.length && counts.every((n) => n === counts[0]) ? counts.length * 10 : 0;
    const total = consistent + counts.reduce((a, b) => a + b, 0);
    if (total > score) { score = total; best = delimiter; }
  }
  return best;
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return guard(rows);
}

export function writeDelimited(rows, delimiter = ',') {
  const cell = (value) => {
    const text = String(value ?? '');
    return /["\r\n]/.test(text) || text.includes(delimiter) || /^\s|\s$/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return rows.map((row) => row.map(cell).join(delimiter)).join('\r\n') + '\r\n';
}

export function parseJson(text) {
  let data;
  try { data = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new Error('That isn’t valid JSON.'); }
  if (data && !Array.isArray(data) && typeof data === 'object') {
    const arrays = Object.entries(data).filter(([, value]) => Array.isArray(value));
    if (arrays.length) return { sheets: arrays.map(([name, value]) => ({ name, rows: jsonRows(value) })) };
    data = [data];
  }
  if (!Array.isArray(data)) throw new Error('JSON needs to be a list of rows or objects.');
  return { sheets: [{ name: 'Sheet1', rows: jsonRows(data) }] };
}

function jsonRows(list) {
  const flat = (value) => value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (list.every(Array.isArray)) return guard(list.map((row) => row.map(flat)));
  const keys = [];
  for (const item of list) if (item && typeof item === 'object') for (const key of Object.keys(item)) if (!keys.includes(key)) keys.push(key);
  if (!keys.length) return guard(list.map((value) => [flat(value)]));
  return guard([keys, ...list.map((item) => keys.map((key) => flat(item?.[key])))]);
}

// A column comes back as JSON numbers or true/false only when every filled cell
// in it fits. Codes with a leading zero (like 01234) keep the column as text,
// so a zip code column never ends up half numbers and half strings.
const NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;
function columnTypes(body, width) {
  return Array.from({ length: width }, (_, i) => {
    const values = body.map((row) => row[i]).filter((v) => v !== '' && v !== undefined && v !== null);
    if (!values.length) return 'text';
    if (values.every((v) => typeof v === 'number' || (typeof v === 'string' && NUMBER.test(v)))) return 'number';
    if (values.every((v) => v === 'true' || v === 'false' || typeof v === 'boolean')) return 'boolean';
    return 'text';
  });
}
const typed = (value, type) => {
  if (value === undefined || value === null || value === '') return '';
  if (type === 'number') return Number(value);
  if (type === 'boolean') return value === true || value === 'true';
  return typeof value === 'string' ? value : String(value);
};

export function writeJson(table) {
  const sheet = (rows) => {
    const [header = [], ...body] = rows;
    // Cells past the last header still get a key, so no value is dropped.
    const width = Math.max(header.length, ...body.map((row) => row.length));
    const keys = Array.from({ length: width }, (_, i) => header[i] || 'column' + (i + 1));
    const types = columnTypes(body, keys.length);
    return body.map((row) => Object.fromEntries(keys.map((key, i) => [key, typed(row[i], types[i])])));
  };
  const value = table.sheets.length === 1 ? sheet(table.sheets[0].rows) : Object.fromEntries(table.sheets.map((s) => [s.name, sheet(s.rows)]));
  return JSON.stringify(value, null, 2) + '\n';
}

export function writeMarkdown(table) {
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return table.sheets.map((sheet) => {
    const width = Math.max(1, ...sheet.rows.map((row) => row.length));
    const pad = (row) => Array.from({ length: width }, (_, i) => cell(row[i]));
    const [header = [], ...body] = sheet.rows;
    const lines = ['| ' + pad(header).join(' | ') + ' |', '|' + ' --- |'.repeat(width), ...body.map((row) => '| ' + pad(row).join(' | ') + ' |')];
    return (table.sheets.length > 1 ? '## ' + sheet.name + '\n\n' : '') + lines.join('\n');
  }).join('\n\n') + '\n';
}

export function tableHtml(table) {
  return table.sheets.map((sheet) => {
    const [header = [], ...body] = sheet.rows;
    return (table.sheets.length > 1 ? '<h2>' + escapeHtml(sheet.name) + '</h2>' : '')
      + '<table><thead><tr>' + header.map((v) => '<th>' + escapeHtml(v) + '</th>').join('') + '</tr></thead><tbody>'
      + body.map((row) => '<tr>' + row.map((v) => '<td>' + escapeHtml(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }).join('\n');
}

// Column letters for a zero-based index: 0 → A, 26 → AA.
export const columnName = (index) => { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name; };
const columnIndex = (ref) => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function xml(bytes) {
  const text = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('This spreadsheet has an unsupported structure.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This spreadsheet looks damaged.');
  return doc;
}
const byLocal = (node, name) => Array.from(node.getElementsByTagName('*')).filter((n) => n.localName === name);
const childrenNamed = (node, name) => Array.from(node.childNodes).filter((n) => n.nodeType === 1 && n.localName === name);

export async function readXlsx(bytes) {
  const entries = await readZip(bytes, BIG);
  const part = async (name) => entries.has(name) ? xml(await unpack(entries.get(name))) : null;
  const workbook = await part('xl/workbook.xml');
  if (!workbook) throw new Error('This isn’t a readable .xlsx file.');
  const rels = await part('xl/_rels/workbook.xml.rels');
  const targets = new Map(byLocal(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const shared = await part('xl/sharedStrings.xml');
  const insidePhonetic = (node) => { for (let n = node.parentNode; n; n = n.parentNode) if (n.localName === 'rPh') return true; return false; };
  const strings = shared ? childrenNamed(shared.documentElement, 'si').map((si) => byLocal(si, 't').filter((t) => !insidePhonetic(t)).map((t) => t.textContent).join('')) : [];
  const dateStyles = await xlsxDateStyles(await part('xl/styles.xml'));
  const epoch = /^(1|true)$/.test(byLocal(workbook, 'workbookPr')[0]?.getAttribute('date1904') || '') ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const sheets = [];
  for (const sheet of byLocal(workbook, 'sheet')) {
    const id = sheet.getAttribute('r:id') || Array.from(sheet.attributes).find((a) => a.localName === 'id')?.value;
    let target = targets.get(id) || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const doc = await part(target);
    if (!doc) continue;
    const rows = [];
    for (const row of byLocal(doc, 'row')) {
      const index = Number(row.getAttribute('r') || rows.length + 1) - 1;
      const values = [];
      for (const c of childrenNamed(row, 'c')) {
        const col = c.getAttribute('r') ? columnIndex(c.getAttribute('r')) : values.length;
        const type = c.getAttribute('t');
        const v = childrenNamed(c, 'v')[0]?.textContent ?? '';
        values[col] = type === 's' ? strings[Number(v)] ?? '' : type === 'inlineStr' ? byLocal(c, 't').map((t) => t.textContent).join('') : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v !== '' && (!type || type === 'n') && dateStyles.has(Number(c.getAttribute('s') || 0)) ? serialDate(Number(v), epoch, dateStyles.get(Number(c.getAttribute('s') || 0))) : v;
      }
      rows[index] = Array.from(values, (v) => v ?? '');
    }
    sheets.push({ name: sheet.getAttribute('name') || 'Sheet' + (sheets.length + 1), rows: guard(Array.from(rows, (r) => r || [])) });
  }
  if (!sheets.length) throw new Error('No sheets found in this file.');
  return { sheets };
}

// Excel stores dates as day counts; the cell style says whether a number is a
// date. Built-in formats 14-22 and 45-47 are dates or times, and a custom
// format is one if it uses d, y, h or s outside quotes and [colour] tags.
async function xlsxDateStyles(styles) {
  const kinds = new Map();
  if (!styles) return kinds;
  const custom = new Map(byLocal(styles, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') || '']));
  const kindOf = (id) => {
    if (id >= 14 && id <= 17 || id === 22) return id === 22 ? 'datetime' : 'date';
    if (id >= 18 && id <= 21 || id >= 45 && id <= 47) return 'time';
    const code = (custom.get(id) || '').replace(/\[([hms])+\]/gi, '$1').replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, '').toLowerCase();
    if (!code || /^general$/.test(code)) return null;
    const date = /[dy]/.test(code) || /m/.test(code) && !/[hs]/.test(code), time = /[hs]/.test(code);
    return date && time ? 'datetime' : date ? 'date' : time ? 'time' : null;
  };
  const xfs = byLocal(styles, 'cellXfs')[0];
  if (xfs) childrenNamed(xfs, 'xf').forEach((xf, i) => { const kind = kindOf(Number(xf.getAttribute('numFmtId') || 0)); if (kind) kinds.set(i, kind); });
  return kinds;
}
function serialDate(serial, epoch, kind) {
  if (!Number.isFinite(serial)) return String(serial);
  const iso = new Date(epoch + Math.round(serial * 86_400_000)).toISOString();
  const day = iso.slice(0, 10), time = iso.slice(11, 19);
  return kind === 'time' ? time : kind === 'date' && time === '00:00:00' ? day : day + ' ' + time;
}

async function zipFrom(files) {
  const entries = new Map();
  for (const [name, text] of files) await deflateEntry(entries, name, typeof text === 'string' ? encoder.encode(text) : text);
  return writeZip(entries);
}

const isNumber = (v) => /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(String(v).trim()) && String(v).trim().length < 16 && !/^0\d/.test(String(v).trim());
const safeSheetName = (name, i, used) => {
  let base = String(name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet' + (i + 1);
  let candidate = base, n = 2;
  while (used.has(candidate.toLowerCase())) candidate = base.slice(0, 28) + ' ' + n++;
  used.add(candidate.toLowerCase());
  return candidate;
};

export async function writeXlsx(table) {
  const used = new Set();
  const names = table.sheets.map((s, i) => safeSheetName(s.name, i, used));
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + names.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + names.map((name, i) => '<sheet name="' + escapeXml(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + names.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '</Relationships>'],
    ...table.sheets.map((sheet, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + sheet.rows.map((row, r) => '<row r="' + (r + 1) + '">' + row.map((value, c) => {
        if (value === '' || value === null || value === undefined) return '';
        const ref = columnName(c) + (r + 1);
        return isNumber(value) ? '<c r="' + ref + '"><v>' + String(value).trim() + '</v></c>' : '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
      }).join('') + '</row>').join('') + '</sheetData></worksheet>']),
  ];
  return zipFrom(files);
}

export async function readOds(bytes) {
  const entries = await readZip(bytes, BIG);
  if (!entries.has('content.xml')) throw new Error('This isn’t a readable .ods file.');
  const doc = xml(await unpack(entries.get('content.xml')));
  const sheets = byLocal(doc, 'table').map((table, i) => {
    const rows = [];
    for (const row of byLocal(table, 'table-row')) {
      const values = [];
      for (const cell of Array.from(row.childNodes).filter((n) => n.nodeType === 1 && /table-cell$/.test(n.localName))) {
        const repeat = Math.min(Number(cell.getAttribute('table:number-columns-repeated') || 1), 1024);
        const text = byLocal(cell, 'p').map((p) => p.textContent).join('\n') || cell.getAttribute('office:value') || '';
        for (let n = 0; n < repeat; n++) values.push(text);
      }
      while (values.length && values[values.length - 1] === '') values.pop();
      const repeatRows = Math.min(Number(row.getAttribute('table:number-rows-repeated') || 1), 1024);
      for (let n = 0; n < repeatRows; n++) rows.push(values.slice());
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    return { name: table.getAttribute('table:name') || 'Sheet' + (i + 1), rows: guard(rows) };
  });
  if (!sheets.length) throw new Error('No sheets found in this file.');
  return { sheets };
}

export async function writeOds(table) {
  const body = table.sheets.map((sheet, i) => '<table:table table:name="' + escapeXml(sheet.name || 'Sheet' + (i + 1)) + '">'
    + sheet.rows.map((row) => '<table:table-row>' + (row.length ? row : ['']).map((value) => isNumber(value)
      ? '<table:table-cell office:value-type="float" office:value="' + String(value).trim() + '"><text:p>' + escapeXml(value) + '</text:p></table:table-cell>'
      : '<table:table-cell office:value-type="string"><text:p>' + escapeXml(value) + '</text:p></table:table-cell>').join('') + '</table:table-row>').join('')
    + '</table:table>').join('');
  return zipFrom([
    ['mimetype', 'application/vnd.oasis.opendocument.spreadsheet'],
    ['META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'],
    ['content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:spreadsheet>' + body + '</office:spreadsheet></office:body></office:document-content>'],
  ]);
}

export function tableFromHtml(doc) {
  const sheets = Array.from(doc.querySelectorAll('table')).map((table, i) => ({
    name: 'Table ' + (i + 1),
    rows: guard(Array.from(table.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('th,td')).map((cell) => cell.textContent.trim()))),
  }));
  if (!sheets.length) throw new Error('No table found in this page.');
  return { sheets };
}

export function tableFromMarkdown(text) {
  const lines = text.split(/\r?\n/);
  const sheets = []; let current = null;
  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line)) continue;
      const cells = line.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, '\n'));
      if (!current) { current = { name: 'Table ' + (sheets.length + 1), rows: [] }; sheets.push(current); }
      current.rows.push(cells);
    } else current = null;
  }
  if (!sheets.length) throw new Error('No Markdown table found.');
  return { sheets };
}
