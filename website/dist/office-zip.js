// Small ZIP32 reader/writer for Office packages; payloads never reach the network.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_EXPANDED = 30_000_000;
const fail = () => { throw new Error('Unsupported or damaged Office package. Your original is unchanged.'); };
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export async function readZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 10_000_000 || bytes.length < 22) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at) => view.getUint16(at, true);
  const u32 = (at) => view.getUint32(at, true);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break;
  }
  if (end < 0 || u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6)) fail();
  const count = u16(end + 10);
  let cursor = u32(end + 16);
  if (!count || count > 1000 || u16(end + 8) !== count || cursor + u32(end + 12) !== end) fail();
  const entries = new Map();
  const spans = [];
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) fail();
    const flags = u16(cursor + 8), method = u16(cursor + 10);
    const crc = u32(cursor + 16), packed = u32(cursor + 20), size = u32(cursor + 24);
    const nameSize = u16(cursor + 28), extraSize = u16(cursor + 30), commentSize = u16(cursor + 32);
    const offset = u32(cursor + 42);
    if (flags & ~0x808 || ![0, 8].includes(method) || u16(cursor + 34) || size === 0xffffffff || packed === 0xffffffff) fail();
    if (cursor + 46 + nameSize + extraSize + commentSize > end || offset + 30 > u32(end + 16)) fail();
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameSize);
    const name = decoder.decode(nameBytes);
    if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').includes('..') || entries.has(name)) fail();
    if (u32(offset) !== 0x04034b50 || u16(offset + 6) !== flags || u16(offset + 8) !== method) fail();
    const localName = u16(offset + 26), localExtra = u16(offset + 28);
    const start = offset + 30 + localName + localExtra;
    if (start + packed > u32(end + 16) || localName !== nameSize || decoder.decode(bytes.subarray(offset + 30, offset + 30 + localName)) !== name) fail();
    if (!(flags & 8) && (u32(offset + 14) !== crc || u32(offset + 18) !== packed || u32(offset + 22) !== size)) fail();
    expanded += size;
    if (expanded > MAX_EXPANDED || size > 10_000_000) throw new Error('This package is too large when expanded (30 MB total, 10 MB per part).');
    spans.push([offset, start + packed]);
    entries.set(name, { name, method, crc, size, packed: bytes.slice(start, start + packed), time: u16(cursor + 12), date: u16(cursor + 14), attributes: u32(cursor + 38) });
    cursor += 46 + nameSize + extraSize + commentSize;
  }
  if (cursor !== end) fail();
  spans.sort((a, b) => a[0] - b[0]);
  if (spans.some((span, i) => i && span[0] < spans[i - 1][1])) fail();
  // Validate bounded decompression and checksums before accepting any package.
  for (const entry of entries.values()) await unpack(entry);
  return entries;
}

export async function unpack(entry) {
  let bytes;
  if (entry.method === 0) bytes = entry.packed;
  else {
    let stream;
    try { stream = new Blob([entry.packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
    catch { throw new Error('This browser cannot read compressed Office files. Try a current Chrome, Edge, Firefox or Safari.'); }
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > entry.size) { await reader.cancel(); fail(); }
        chunks.push(value);
      }
    } catch { fail(); }
    bytes = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  }
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) fail();
  return bytes;
}

export function replaceEntry(entries, name, bytes) {
  const previous = entries.get(name);
  entries.set(name, { ...previous, name, method: 0, crc: crc32(bytes), size: bytes.length, packed: bytes, time: previous?.time || 0, date: previous?.date || 33, attributes: previous?.attributes || 0 });
}

export function writeZip(entries, clearDates = false) {
  const parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const entry of entries.values()) {
    const name = encoder.encode(entry.name);
    const header = new Uint8Array(30 + name.length), record = new Uint8Array(46 + name.length);
    const local = new DataView(header.buffer), central = new DataView(record.buffer);
    const date = clearDates ? 33 : entry.date, time = clearDates ? 0 : entry.time;
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true);
    for (const [view, shift] of [[local, 0], [central, 2]]) {
      view.setUint16(6 + shift, 0x800, true); view.setUint16(8 + shift, entry.method, true);
      view.setUint16(10 + shift, time, true); view.setUint16(12 + shift, date, true);
      view.setUint32(14 + shift, entry.crc, true); view.setUint32(18 + shift, entry.packed.length, true);
      view.setUint32(22 + shift, entry.size, true); view.setUint16(26 + shift, name.length, true);
    }
    central.setUint32(38, entry.attributes, true); central.setUint32(42, offset, true);
    header.set(name, 30); record.set(name, 46);
    parts.push(header, entry.packed); directory.push(record);
    offset += header.length + entry.packed.length; directorySize += record.length;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.size, true); view.setUint16(10, entries.size, true);
  view.setUint32(12, directorySize, true); view.setUint32(16, offset, true);
  const output = new Uint8Array(offset + directorySize + 22);
  let at = 0;
  for (const part of [...parts, ...directory, end]) { output.set(part, at); at += part.length; }
  return output;
}
