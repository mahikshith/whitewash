// Small helpers shared by the file tools: zipping outputs and saving them.
import { replaceEntry, writeZip } from './office-zip.js';
import { saveBlob } from './island.js';
import { uniqueNames, formatBytes } from './images.js';

export { formatBytes };

export async function bundle(items, zipName) {
  if (items.length === 1) return { blob: items[0].blob, name: items[0].name };
  const names = uniqueNames(items.map((item) => item.name));
  const entries = new Map();
  for (const [i, item] of items.entries()) replaceEntry(entries, names[i], new Uint8Array(await item.blob.arrayBuffer()));
  return { blob: new Blob([writeZip(entries)], { type: 'application/zip' }), name: zipName };
}

export async function saveAll(items, zipName) {
  const file = await bundle(items, zipName);
  saveBlob(file.blob, file.name);
  return file;
}

export const readBytes = async (file) => new Uint8Array(await file.arrayBuffer());

export function listRow(title, detail, extra) {
  const row = document.createElement('li');
  const name = document.createElement('strong'); name.textContent = title;
  const info = document.createElement('span'); info.textContent = detail;
  row.append(name, info);
  if (extra) row.append(extra);
  return row;
}

export function dropZone(element, onFiles) {
  element.addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); element.classList.add('drop-active'); } });
  element.addEventListener('dragleave', (event) => { if (!element.contains(event.relatedTarget)) element.classList.remove('drop-active'); });
  element.addEventListener('drop', (event) => { event.preventDefault(); element.classList.remove('drop-active'); if (event.dataTransfer.files.length) onFiles([...event.dataTransfer.files]); });
}
