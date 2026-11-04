// Archives: open ZIP, 7Z, RAR and TAR (plain, .gz, .bz2, .xz) with libarchive
// and a lone .gz with fflate. libarchive.js can't read a bare .bz2 or .xz
// stream (no raw format), so those aren't offered. libarchive runs as WASM in
// a worker. Write ZIP, TAR and TAR.GZ with fflate and our own TAR writer. libarchive's writer sizes its
// output buffer too tightly and fails on small files, so it isn't used.
import * as libs from './libs.js';

export const ARCHIVE_IN = ['zip', '7z', 'rar', 'tar', 'tgz', 'tbz2', 'txz', 'gz'];
export const ARCHIVE_OUT = ['zip', 'tar', 'tgz'];
export const EXTENSION = { tgz: 'tar.gz', tbz2: 'tar.bz2', txz: 'tar.xz' };
export const MAX_ARCHIVE = 300_000_000;
const MAX_FILES = 10_000;

// Compound extensions come first so "a.tar.gz" isn't read as a plain .gz.
export function archiveFormat(name = '') {
  const lower = name.toLowerCase();
  if (/\.(tar\.gz|tgz)$/.test(lower)) return 'tgz';
  if (/\.(tar\.bz2|tbz2?)$/.test(lower)) return 'tbz2';
  if (/\.(tar\.xz|txz)$/.test(lower)) return 'txz';
  const extension = lower.includes('.') ? lower.split('.').pop() : '';
  return ARCHIVE_IN.includes(extension) ? extension : null;
}

export const stripArchiveExtension = (name) => name.replace(/\.(tar\.gz|tar\.bz2|tar\.xz|tgz|tbz2?|txz|zip|7z|rar|tar|gz|bz2|xz)$/i, '') || 'archive';

// Path-safe names: no absolute paths, no "..", no empty parts.
export function safePath(path) {
  const parts = String(path).replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..');
  return parts.join('/') || 'file';
}

async function readSingle(file, format) {
  // A lone .gz holds one file.
  const inner = file.name.replace(/\.gz$/i, '') || 'file';
  if (format === 'gz') {
    const { gunzipSync } = await libs.fflate();
    try { return [{ path: safePath(inner), file: new File([gunzipSync(new Uint8Array(await file.arrayBuffer()))], inner.split('/').pop()) }]; }
    catch { throw new Error('This .gz file looks damaged.'); }
  }
  return null;
}

// Returns [{ path, file }] for every file inside, folders flattened into paths.
export async function readArchive(file, onFile) {
  if (file.size > MAX_ARCHIVE) throw new Error('Archives up to 300 MB only.');
  const format = archiveFormat(file.name);
  if (!format) throw new Error('That isn’t an archive Whitewash can open.');
  const single = await readSingle(file, format);
  if (single) return single;
  const { Archive } = await libs.archive();
  let reader;
  try { reader = await Archive.open(file); }
  catch { throw new Error('This archive looks damaged or uses a format that isn’t supported.'); }
  try {
    if (await reader.hasEncryptedData()) throw new Error('This archive is password-protected. Unpack it with its own app first.');
    const listed = await reader.getFilesArray();
    if (listed.length > MAX_FILES) throw new Error('This archive holds more than 10,000 files.');
    await reader.extractFiles();
    const out = (await reader.getFilesArray()).filter((entry) => entry.file instanceof Blob).map((entry) => ({ path: safePath((entry.path || '') + entry.file.name), file: entry.file }));
    onFile?.(out.length);
    if (!out.length) throw new Error('This archive is empty, or Whitewash couldn’t read what’s inside.');
    return out;
  } catch (error) {
    if (/password|10,000|empty/.test(error.message)) throw error;
    throw new Error('This archive looks damaged or uses a format that isn’t supported.');
  } finally { reader.close?.().catch?.(() => {}); }
}

// entries: [{ path, file }] → Blob of the archive. File dates are set to a
// fixed value so the archive doesn't record when you made it.
export async function writeArchive(entries, to) {
  if (!ARCHIVE_OUT.includes(to)) throw new Error('Can’t write ' + to + ' archives.');
  const files = await Promise.all(uniquePaths(entries).map(async ({ path, file }) => ({ path, bytes: new Uint8Array(await file.arrayBuffer()) })));
  const fflate = await libs.fflate();
  if (to === 'zip') {
    const tree = {};
    for (const { path, bytes } of files) tree[path] = [bytes, { mtime: DATE, level: STORED.test(path) ? 0 : 6 }];
    return new Blob([await new Promise((resolve, reject) => fflate.zip(tree, (error, data) => error ? reject(new Error('Couldn’t make the ZIP.')) : resolve(data)))], { type: TYPE.zip });
  }
  const tar = writeTar(files);
  if (to === 'tar') return new Blob([tar], { type: TYPE.tar });
  return new Blob([await new Promise((resolve, reject) => fflate.gzip(tar, { level: 6, mtime: DATE }, (error, data) => error ? reject(new Error('Couldn’t compress the archive.')) : resolve(data)))], { type: TYPE.tgz });
}

const DATE = new Date('1980-01-01T00:00:00Z');
// Already-compressed formats are stored as is; squeezing them again wastes time.
const STORED = /\.(jpe?g|png|webp|gif|avif|mp3|m4a|aac|ogg|opus|flac|mp4|mov|mkv|webm|zip|7z|rar|gz|bz2|xz|docx|xlsx|pptx|odt|ods|epub|pdf)$/i;

function uniquePaths(entries) {
  const seen = new Set();
  return entries.map(({ path, file }) => {
    let candidate = safePath(path), n = 1;
    while (seen.has(candidate)) candidate = safePath(path).replace(/(\.[^./]+)?$/, (ext) => '-' + (++n) + ext);
    seen.add(candidate);
    return { path: candidate, file };
  });
}

// POSIX ustar with PAX headers for long or non-ASCII names.
const encoder = new TextEncoder();
function header(name, size, type = '0') {
  const block = new Uint8Array(512);
  const put = (text, offset, length) => block.set(encoder.encode(text).subarray(0, length), offset);
  const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';
  put(name, 0, 100); put(octal(0o644, 8), 100, 8); put(octal(0, 8), 108, 8); put(octal(0, 8), 116, 8);
  put(octal(size, 12), 124, 12); put(octal(Math.floor(DATE / 1000), 12), 136, 12);
  block.fill(32, 148, 156); put(type, 156, 1); put('ustar\0' + '00', 257, 8);
  let sum = 0; for (const byte of block) sum += byte;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return block;
}
export function writeTar(files) {
  const parts = [];
  const pad = (size) => { const rest = size % 512; if (rest) parts.push(new Uint8Array(512 - rest)); };
  for (const { path, bytes } of files) {
    const encoded = encoder.encode(path);
    if (encoded.length > 100 || /[^\x20-\x7e]/.test(path)) {
      let record = ' path=' + path + '\n', length = encoder.encode(record).length;
      let total = length + String(length).length;
      while (String(total).length + length !== total) total = length + String(total).length;
      const pax = encoder.encode(total + record);
      parts.push(header('PaxHeader/' + path.replace(/[^\x20-\x7e]/g, '_').slice(-80), pax.length, 'x'), pax); pad(pax.length);
    }
    parts.push(header(path.replace(/[^\x20-\x7e]/g, '_').slice(-100), bytes.length), bytes); pad(bytes.length);
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export const TYPE = { zip: 'application/zip', '7z': 'application/x-7z-compressed', tar: 'application/x-tar', tgz: 'application/gzip', tbz2: 'application/x-bzip2', txz: 'application/x-xz', rar: 'application/vnd.rar', gz: 'application/gzip', bz2: 'application/x-bzip2', xz: 'application/x-xz' };
