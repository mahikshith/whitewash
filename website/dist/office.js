import { proposeEdits, applyEdits, quotationRanges, MAX_CHARACTERS } from './engine.js';
import { readZip, unpack, replaceEntry, writeZip } from './office-zip.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const elements = (node, ns, name) => Array.from(node.getElementsByTagNameNS(ns, name));
const childElements = (node) => Array.from(node.childNodes).filter((n) => n.nodeType === 1);
const xmlError = () => { throw new Error('Unsupported or malformed document XML. Your original is unchanged.'); };

function parseXml(bytes) {
  if (bytes.length > 5_000_000) throw new Error('An XML part exceeds the 5 MB limit.');
  const text = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) xmlError();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) xmlError();
  return doc;
}
const serialize = (doc) => encoder.encode(new XMLSerializer().serializeToString(doc));

function skeleton(node, textNamespace) {
  if (node.nodeType === 1) {
    const attrs = Array.from(node.attributes).filter((a) => !(node.namespaceURI === textNamespace && node.localName === 't' && a.name === 'xml:space')).map((a) => [a.name, a.value]).sort((a, b) => a[0].localeCompare(b[0]));
    const contents = node.namespaceURI === textNamespace && node.localName === 't' ? [] : Array.from(node.childNodes).map((n) => skeleton(n, textNamespace));
    return [node.nodeName, attrs, contents];
  }
  return [node.nodeType, node.nodeValue];
}

function splitGroups(paragraph, ns) {
  const groups = [[]];
  const walk = (node) => {
    for (const child of childElements(node)) {
      if (child.namespaceURI === ns && ['br', 'tab', 'cr'].includes(child.localName)) groups.push([]);
      else if (child.namespaceURI === ns && child.localName === 't') groups.at(-1).push(child);
      else walk(child);
    }
  };
  walk(paragraph);
  return groups.filter((group) => group.length);
}

function textGroups(doc, type, eligibleShared) {
  if (type === 'docx') {
    if (doc.documentElement.namespaceURI !== W) xmlError();
    let fieldDepth = 0;
    return elements(doc, W, 'p').flatMap((p) => {
      const fields = elements(p, W, 'fldChar');
      const inField = fieldDepth > 0 || fields.length > 0;
      for (const field of fields) {
        const kind = field.getAttributeNS(W, 'fldCharType');
        if (kind === 'begin') fieldDepth++;
        else if (kind === 'end') fieldDepth = Math.max(0, fieldDepth - 1);
      }
      if (inField) return [];
      for (let parent = p.parentNode; parent; parent = parent.parentNode) if (parent.namespaceURI === W && ['ins', 'del', 'moveTo', 'moveFrom'].includes(parent.localName)) return [];
      // Fields, tracked revisions, drawings, links, references and code retain their text.
      if (['fldChar', 'fldSimple', 'instrText', 'ins', 'del', 'drawing', 'hyperlink', 'footnoteReference', 'endnoteReference'].some((tag) => elements(p, W, tag).length)) return [];
      if (elements(p, W, 'rFonts').some((n) => /courier|consolas|mono/i.test(n.getAttributeNS(W, 'ascii') || ''))) return [];
      if (elements(p, W, 'rStyle').some((n) => /code|verbatim/i.test(n.getAttributeNS(W, 'val') || ''))) return [];
      if (elements(p, W, 'pStyle').some((n) => /heading|title|caption|code|verbatim|bibliography/i.test(n.getAttributeNS(W, 'val') || ''))) return [];
      return splitGroups(p, W);
    });
  }
  if (type === 'pptx') return elements(doc, A, 'p').flatMap((p) => ['fld', 'hlinkClick', 'hlinkMouseOver'].some((tag) => elements(p, A, tag).length) ? [] : splitGroups(p, A));
  if (doc.documentElement.namespaceURI !== S) xmlError();
  if (doc.documentElement.localName === 'sst') return elements(doc, S, 'si').filter((si, i) => eligibleShared.has(i) && !elements(si, S, 'rPh').length).map((si) => elements(si, S, 't'));
  return elements(doc, S, 'c').filter((c) => !elements(c, S, 'f').length && c.getAttribute('t') === 'inlineStr' && !/^[A-Z]+1$/.test(c.getAttribute('r'))).map((c) => elements(c, S, 't'));
}

function editGroup(nodes, options, report, part, quotedNodes) {
  const text = nodes.map((n) => n.textContent).join('');
  report.characters += text.length;
  if (report.characters > MAX_CHARACTERS) throw new Error('The editable text exceeds 100,000 characters.');
  // Spreadsheet labels/identifiers and short cells are deliberately left alone.
  if (options.type === 'xlsx' && (text.length < 20 || !/\s/u.test(text))) return;
  let offset = 0;
  const protectedSpans = [];
  for (const node of nodes) {
    for (const [start, end] of quotedNodes.get(node) || []) protectedSpans.push([offset + start, offset + end]);
    offset += node.textContent.length;
  }
  const edits = proposeEdits(text, { ...options, format: 'txt', protectedSpans });
  if (report.edits.length + edits.length > 500) throw new Error('More than 500 edits. Use a smaller document; the original is unchanged.');
  let start = 0;
  const runs = nodes.map((node) => { const run = { node, start, end: start + node.textContent.length, text: node.textContent }; start = run.end; return run; });
  for (const edit of [...edits].reverse()) {
    for (const run of runs) {
      if (edit.start >= run.end || edit.end <= run.start) continue;
      const from = Math.max(0, edit.start - run.start), to = Math.min(run.end - run.start, edit.end - run.start);
      run.text = run.text.slice(0, from) + (edit.start >= run.start ? edit.after : '') + run.text.slice(to);
    }
  }
  for (const run of runs) if (run.text !== run.node.textContent) {
    run.node.textContent = run.text;
    if (/^\s|\s$/u.test(run.text)) run.node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  }
  if (nodes.map((n) => n.textContent).join('') !== applyEdits(text, edits)) throw new Error('Document text verification failed. Your original is unchanged.');
  report.edits.push(...edits.map((edit) => ({ ...edit, part })));
}

const APP_FIELDS = new Set(['Application', 'AppVersion', 'Company', 'Manager', 'Template', 'TotalTime', 'HyperlinkBase']);
function cleanProperties(doc, part, report) {
  const root = doc.documentElement;
  for (const child of childElements(root)) {
    if (part !== 'docProps/app.xml' || APP_FIELDS.has(child.localName)) {
      report.properties.push({ part, name: child.getAttribute('name') || child.localName, before: child.textContent.slice(0, 500) });
      root.removeChild(child);
    }
  }
}

export async function processOffice(bytes, name, options = {}) {
  const type = name.match(/\.(docx|pptx|xlsx)$/i)?.[1].toLowerCase();
  if (!type) throw new Error('Choose a .docx, .pptx or .xlsx file. Macro-enabled and older Office formats are not supported.');
  const entries = await readZip(bytes);
  if (!entries.has('[Content_Types].xml') || !entries.has('_rels/.rels')) xmlError();
  if ([...entries.keys()].some((path) => /vbaProject|_xmlsignatures|encryptedpackage/i.test(path))) throw new Error('Macro-enabled, encrypted or digitally signed files are not supported.');
  const contentTypes = decoder.decode(await unpack(entries.get('[Content_Types].xml')));
  if (/macroEnabled|vbaProject|digital-signature/i.test(contentTypes)) throw new Error('Macro-enabled or digitally signed files are not supported.');
  parseXml(encoder.encode(contentTypes));
  const required = { docx: 'word/document.xml', pptx: 'ppt/presentation.xml', xlsx: 'xl/workbook.xml' }[type];
  if (!entries.has(required)) throw new Error('The file contents do not match its Office extension.');
  const root = parseXml(await unpack(entries.get(required))).documentElement;
  if (root.namespaceURI !== { docx: W, pptx: P, xlsx: S }[type] || root.localName !== { docx: 'document', pptx: 'presentation', xlsx: 'workbook' }[type]) xmlError();
  const report = { edits: [], properties: [], parts: [], characters: 0, type, metadata: !!options.metadata };
  const eligibleShared = new Set(), blockedShared = new Set();
  const sheets = new Map();
  if (type === 'xlsx' && !options.metadata) {
    for (const [path, entry] of entries) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) {
      const doc = parseXml(await unpack(entry)); sheets.set(path, doc);
      for (const cell of elements(doc, S, 'c')) if (cell.getAttribute('t') === 's') {
        const index = Number(elements(cell, S, 'v')[0]?.textContent);
        if (!Number.isSafeInteger(index) || index < 0) xmlError();
        (elements(cell, S, 'f').length || /^[A-Z]+1$/.test(cell.getAttribute('r')) ? blockedShared : eligibleShared).add(index);
      }
    }
    for (const index of blockedShared) eligibleShared.delete(index);
  }
  for (const [part, entry] of entries) {
    const metadataPart = options.metadata && /^docProps\/(core|app|custom)\.xml$/.test(part);
    const prosePart = !options.metadata && (type === 'docx' ? part === required : type === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/.test(part) : part === 'xl/sharedStrings.xml' || sheets.has(part));
    if (!metadataPart && !prosePart) continue;
    const source = await unpack(entry), doc = sheets.get(part) || parseXml(source);
    if (metadataPart) {
      const count = report.properties.length;
      cleanProperties(doc, part, report);
      if (report.properties.length === count) continue;
    } else {
      const before = JSON.stringify(skeleton(doc.documentElement, type === 'docx' ? W : type === 'pptx' ? A : S));
      const count = report.edits.length;
      const ns = type === 'docx' ? W : type === 'pptx' ? A : S;
      const allNodes = elements(doc, ns, 't'), quotedNodes = new Map();
      const ranges = quotationRanges(allNodes.map((node) => node.textContent).join('\n'));
      let offset = 0;
      for (const node of allNodes) {
        const length = node.textContent.length;
        quotedNodes.set(node, ranges.filter(([start, end]) => start < offset + length && end > offset).map(([start, end]) => [Math.max(0, start - offset), Math.min(length, end - offset)]));
        offset += length + 1;
      }
      for (const group of textGroups(doc, type, eligibleShared)) editGroup(group, { ...options, type, mode: options.mode || 'polish' }, report, part, quotedNodes);
      if (report.edits.length === count) continue;
      const checked = parseXml(serialize(doc));
      if (JSON.stringify(skeleton(checked.documentElement, type === 'docx' ? W : type === 'pptx' ? A : S)) !== before) throw new Error('Document structure verification failed. Your original is unchanged.');
    }
    replaceEntry(entries, part, serialize(doc)); report.parts.push(part);
  }
  if (!report.parts.length && !options.metadata) return { bytes, report };
  const output = writeZip(entries, !!options.metadata);
  if (output.length > 10_000_000) throw new Error('The edited copy exceeds 10 MB. Use a smaller document; your original is unchanged.');
  // Read the actual exported copy, including its checksums, before offering a download.
  const checkedEntries = await readZip(output);
  for (const part of report.parts) {
    const doc = parseXml(await unpack(checkedEntries.get(part)));
    if (options.metadata) {
      const remaining = { properties: [] }; cleanProperties(doc, part, remaining);
      if (remaining.properties.length) throw new Error('Property verification failed. Your original is unchanged.');
    }
  }
  return { bytes: output, report };
}
