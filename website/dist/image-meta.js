// Metadata wiper: lists and losslessly removes location, camera, software and
// AI-provenance data from JPEG, PNG, WebP and GIF files by rewriting the
// container only. Pixel data (JPEG scans, PNG IDAT, WebP VP8/VP8L, GIF image
// blocks) is copied byte for byte and never decoded or re-encoded.

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');
const NOT_IMAGE = "This doesn't look like a JPEG, PNG, WebP or GIF file.";
const damaged = (fmt) => new Error(`This ${fmt} file looks damaged or cut short.`);

const str = (b, s = 0, e = b.length) => latin1.decode(b.subarray(s, e));
const be16 = (b, o) => (b[o] << 8) | b[o + 1];
const be32 = (b, o) => b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const le32 = (b, o) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + b[o + 3] * 0x1000000;
const has = (b, o, s) => { for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false; return true; };
const clip = (s, n = 90) => { s = String(s ?? '').replace(/[\0-\x08\x0b-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const item = (block, label, detail, risk) => ({ block, label, detail: clip(detail), risk });
const nonZero = (b) => b.some((x) => x !== 0);

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(b) { let c = ~0; for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; }

// ---------- AI / provenance markers (searched in XMP, comments, text chunks) ----------
const AI_MARKERS = [
  [/compositeWithTrainedAlgorithmicMedia/, 'composite with AI-generated media (IPTC)'],
  [/trainedAlgorithmicMedia/, 'AI-generated media (IPTC)'],
  [/DigitalSourceType/, 'IPTC digital source type'],
  [/Made with Google AI/i, 'Made with Google AI'],
  [/c2pa/i, 'C2PA Content Credentials'],
  [/Firefly/i, 'Adobe Firefly'],
  [/DALL[\s·.\-‑]?E/i, 'DALL-E'],
  [/Midjourney/i, 'Midjourney'],
  [/Stable[\s_-]?Diffusion/i, 'Stable Diffusion'],
  [/Steps: ?\d+[\s\S]*Sampler: /, 'Stable Diffusion settings'],
  [/ComfyUI/i, 'ComfyUI'],
  [/NovelAI/i, 'NovelAI'],
  [/\bImagen\b|\bGemini\b/, 'Google Imagen / Gemini'],
  [/gpt-image|ChatGPT|OpenAI/i, 'OpenAI'],
  [/\bAI[\s-]generated\b|generated (?:by|with) AI/i, '"AI generated"'],
];
function aiItem(block, text) {
  const found = AI_MARKERS.filter(([re]) => re.test(text)).map(([, name]) => name);
  return found.length ? item(block, 'AI / provenance marker', found.join(', '), 'high') : null;
}

// ---------- XMP ----------
function xmpField(x, name) {
  const m = x.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`)) || x.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/<[^>]*>/g, ' ') : '';
}
function xmpItems(x, block = 'XMP', label = 'XMP metadata') {
  const out = [item(block, label, 'editing history, app and document IDs', 'medium')];
  const add = (l, d, r) => clip(d) && out.push(item(block, l, d, r));
  add('Creator tool', xmpField(x, 'xmp:CreatorTool'), 'medium');
  add('Author', xmpField(x, 'dc:creator'), 'high');
  add('Copyright', xmpField(x, 'dc:rights'), 'high');
  if (/exif:GPSLatitude|exif:GPSLongitude/.test(x)) add('GPS location', 'coordinates stored in XMP', 'high');
  if (/photoshop:City|Iptc4xmpCore:Location/.test(x)) add('Place name', xmpField(x, 'photoshop:City') || 'location fields', 'high');
  const ai = aiItem(block, x);
  if (ai) out.push(ai);
  return out;
}

// ---------- Exif (TIFF structure, shared by JPEG APP1, PNG eXIf and WebP EXIF) ----------
function readTiff(b) {
  try {
    const le = b[0] === 0x49;
    if (!((le && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d))) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
    if (u16(2) !== 42) return null;
    const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
    const seen = new Set();
    const ifd = (off) => {
      const tags = new Map();
      if (!off || seen.has(off) || off + 2 > b.length) return { tags, next: 0 };
      seen.add(off);
      const n = u16(off);
      for (let i = 0; i < n && off + 14 + i * 12 <= b.length; i++) {
        const e = off + 2 + i * 12, type = u16(e + 2), count = u32(e + 4), size = (SIZE[type] || 1) * count;
        const at = size <= 4 ? e + 8 : u32(e + 8); // values of 4 bytes or less are stored inline
        if (at + size <= b.length) tags.set(u16(e), { type, count, at, size });
      }
      const nx = off + 2 + n * 12;
      return { tags, next: nx + 4 <= b.length ? u32(nx) : 0 };
    };
    const text = (tags, id) => { const t = tags.get(id); return t ? utf8.decode(b.subarray(t.at, t.at + t.size)).replace(/\0[\s\S]*$/, '').trim() : ''; };
    const ifd0 = ifd(u32(4)), T = ifd0.tags;
    const sub = (id) => (T.has(id) ? ifd(u32(T.get(id).at)).tags : new Map());
    const E = sub(0x8769), G = sub(0x8825), ifd1 = ifd(ifd0.next).tags;

    let gps = null;
    if ([...G.keys()].some((k) => k !== 0)) { // a GPS IFD with only GPSVersionID carries no location
      gps = {};
      const lat = G.get(2), lon = G.get(4);
      const dms = (t) => { let v = 0; for (let i = 0; i < 3 && i < t.count; i++) { const d = u32(t.at + i * 8 + 4); v += (d ? u32(t.at + i * 8) / d : 0) / 60 ** i; } return v; };
      if (lat?.type === 5 && lon?.type === 5) {
        gps.lat = dms(lat) * (text(G, 1) === 'S' ? -1 : 1);
        gps.lon = dms(lon) * (text(G, 3) === 'W' ? -1 : 1);
      }
    }
    let userComment = '';
    const uc = E.get(0x9286);
    if (uc && uc.size > 8) { // 8-byte charset prefix, then the text
      const body = b.subarray(uc.at + 8, uc.at + uc.size);
      userComment = (has(b, uc.at, 'UNICODE') ? new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body) : utf8.decode(body)).replace(/\0+/g, '').trim();
    }
    const xp = T.get(0x9c9d); // Windows XPAuthor, UCS-2 little-endian
    return {
      orientation: T.has(0x112) ? u16(T.get(0x112).at) : 1,
      tagCount: T.size + E.size + G.size + ifd1.size,
      gps,
      make: text(T, 0x10f), model: text(T, 0x110), software: text(T, 0x131), dateTime: text(T, 0x132),
      description: text(T, 0x10e), artist: text(T, 0x13b), copyright: text(T, 0x8298),
      xpAuthor: xp ? new TextDecoder('utf-16le').decode(b.subarray(xp.at, xp.at + xp.size)).replace(/\0+$/, '') : '',
      dateOriginal: text(E, 0x9003), lens: text(E, 0xa434), serial: text(E, 0xa431), lensSerial: text(E, 0xa435),
      owner: text(E, 0xa430), uniqueId: text(E, 0xa420), userComment, makerNote: E.has(0x927c),
      thumbnail: ifd1.size > 0, // IFD1 holds the embedded preview image
    };
  } catch { return null; }
}

function exifItems(t, block = 'Exif') {
  if (!t) return [item(block, 'Exif data', 'present but unreadable', 'medium')];
  const out = [];
  const add = (label, detail, risk) => detail && out.push(item(block, label, detail, risk));
  if (t.gps) add('GPS location', t.gps.lat != null ? `${t.gps.lat.toFixed(3)}, ${t.gps.lon.toFixed(3)}` : 'location fields present', 'high');
  add('Camera serial number', t.serial, 'high');
  add('Lens serial number', t.lensSerial, 'high');
  add('Camera owner', t.owner, 'high');
  add('Artist / author', t.artist, 'high');
  add('Author (Windows)', t.xpAuthor, 'high');
  add('Copyright', t.copyright, 'high');
  add('Camera maker', t.make, 'medium');
  add('Camera model', t.model, 'medium');
  add('Lens', t.lens, 'medium');
  add('Software', t.software, 'medium');
  add('Date taken', t.dateOriginal, 'medium');
  add('Date modified', t.dateTime, 'medium');
  add('Description', t.description, 'medium');
  add('User comment', t.userComment, 'medium');
  add('Unique image ID', t.uniqueId, 'medium');
  if (t.makerNote) add('Maker notes', 'hidden manufacturer data (can include serial numbers)', 'medium');
  if (t.thumbnail) add('Embedded thumbnail', 'a small preview that can show the uncropped original', 'medium');
  const ai = aiItem(block, [t.software, t.description, t.userComment, t.artist].join('\n'));
  if (ai) out.push(ai);
  if (!out.length && t.tagCount > 1) out.push(item(block, 'Exif data', `${t.tagCount} technical tags (exposure, size, rotation)`, 'low'));
  return out;
}

// Dropping Exif would also drop the rotation flag and show photos sideways,
// so a non-default orientation is kept in a minimal 26-byte TIFF.
function orientationTiff(t) {
  if (!t || !(t.orientation >= 2 && t.orientation <= 8)) return null;
  return new Uint8Array([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, t.orientation, 0, 0, 0, 0, 0, 0, 0]);
}

// ---------- JPEG ----------
const isRst = (m) => m >= 0xd0 && m <= 0xd7;
const appId = (d) => clip(str(d, 0, Math.min(d.length, 32)).split('\0')[0].replace(/[^\x20-\x7e]/g, ''), 24);

function jpegSegment(b, p, end, m) {
  const d = b.subarray(p + 4, end);
  const seg = (name, kind, items = [], replace = null) => ({ start: p, end, name, kind, items, replace });
  const other = (n) => seg(`Other app data (APP${n})`, 'drop', [item(`APP${n}`, 'Other app data', appId(d) || `APP${n} segment`, 'medium')]);
  if (m === 0xe0) return has(d, 0, 'JFIF\0') ? seg(null, 'keep') : other(0);
  if (m === 0xe1) {
    if (has(d, 0, 'Exif\0')) {
      const t = readTiff(d.subarray(6)), o = orientationTiff(t);
      let rep = null;
      if (o) { rep = concat([new Uint8Array([0xff, 0xe1, 0, 8 + o.length]), new TextEncoder().encode('Exif\0\0'), o]); }
      return seg('Exif data (camera, GPS, dates)', 'drop', exifItems(t), rep);
    }
    if (has(d, 0, 'http://ns.adobe.com/xap/1.0/\0')) return seg('XMP metadata', 'drop', xmpItems(str(d)));
    if (has(d, 0, 'http://ns.adobe.com/xmp/extension/')) return seg('Extended XMP metadata', 'drop', xmpItems(str(d), 'XMP', 'Extended XMP metadata'));
    return other(1);
  }
  if (m === 0xe2) {
    if (has(d, 0, 'ICC_PROFILE\0')) return seg('Colour profile', 'icc', [item('ICC', 'Colour profile', 'ICC profile, kept by default for accurate colours', 'low')]);
    if (has(d, 0, 'MPF\0')) return seg('Multi-picture index', 'drop', [item('MPF', 'Multi-picture index', 'points to extra embedded images (depth map, HDR gain map)', 'medium')]);
    return other(2);
  }
  if (m === 0xeb) {
    const c2pa = /c2pa/i.test(str(d, 0, Math.min(d.length, 4096)));
    return seg(c2pa ? 'Content Credentials (C2PA)' : 'JUMBF data', 'drop', [c2pa
      ? item('C2PA', 'Content Credentials (C2PA)', 'signed provenance record: can name the app, AI tool or creator', 'high')
      : item('JUMBF', 'JUMBF data box', appId(d.subarray(8)) || 'APP11 segment', 'medium')]);
  }
  if (m === 0xed) return seg('Photoshop / IPTC data', 'drop', iptcItems(d));
  if (m === 0xee) return seg(null, 'keep'); // Adobe APP14: colour transform needed to decode some CMYK/YCCK files
  if (m >= 0xe3 && m <= 0xef) return other(m - 0xe0);
  if (m === 0xfe) {
    const text = utf8.decode(d), ai = aiItem('Comment', text);
    return seg('Comment', 'drop', [item('Comment', 'Comment', text || '(empty)', 'medium'), ...(ai ? [ai] : [])]);
  }
  return seg(null, 'keep'); // DQT, SOFn, DHT, DRI, ...: needed to decode
}

// Photoshop "8BIM" resources; resource 0x0404 holds IPTC-IIM datasets (1C rr dd len data).
const IPTC = { 5: ['Title', 'medium'], 25: ['Keywords', 'medium'], 80: ['Author (by-line)', 'high'], 90: ['City', 'high'], 92: ['Location', 'high'], 95: ['State / province', 'high'], 101: ['Country', 'high'], 105: ['Headline', 'medium'], 110: ['Credit', 'high'], 115: ['Source', 'medium'], 116: ['Copyright', 'high'], 120: ['Caption', 'medium'], 122: ['Caption writer', 'high'] };
function iptcItems(d) {
  const out = [], found = new Map();
  try {
    let p = 14; // after 'Photoshop 3.0\0'
    while (p + 12 <= d.length && has(d, p, '8BIM')) {
      const id = be16(d, p + 4), nameLen = d[p + 6], q = p + 6 + ((nameLen + 2) & ~1), size = be32(d, q), data = q + 4;
      if (id === 0x0404) {
        for (let r = data; r + 5 <= data + size && d[r] === 0x1c;) {
          const ds = d[r + 2], len = be16(d, r + 3), v = utf8.decode(d.subarray(r + 5, r + 5 + len));
          if (d[r + 1] === 2 && IPTC[ds]) found.set(ds, [...(found.get(ds) || []), v]);
          r += 5 + len;
        }
      }
      p = data + size + (size & 1);
    }
  } catch { /* fall through with what was read */ }
  for (const [ds, vals] of found) out.push(item('IPTC', IPTC[ds][0], vals.join(', '), IPTC[ds][1]));
  const ai = aiItem('IPTC', str(d));
  if (ai) out.push(ai);
  out.push(item('IPTC', 'Photoshop / IPTC data', 'captions, names, places and editing settings', out.some((i) => i.risk === 'high') ? 'high' : 'medium'));
  return out;
}

function trailing(b, p) {
  const tail = b.subarray(p);
  if (!nonZero(tail)) return { start: p, end: b.length, name: null, kind: 'drop', items: [] };
  const s = str(tail, 0, Math.min(tail.length, 1 << 20));
  const what = s.includes('\xff\xd8\xff') ? 'extra embedded image (preview, depth map or original)' : /ftyp(mp4|isom|qt)/.test(s) ? 'embedded video (motion photo)' : `${tail.length} bytes of unknown data`;
  return { start: p, end: b.length, name: 'Data after the end of the image', kind: 'drop', items: [item('Trailer', 'Data after the end of the image', what, /image|video/.test(what) ? 'high' : 'medium')] };
}

function parseJPEG(b) {
  const n = b.length, blocks = [{ start: 0, end: 2, kind: 'keep' }];
  let p = 2;
  while (p < n) {
    if (b[p] !== 0xff) throw damaged('JPEG');
    while (b[p + 1] === 0xff) p++; // fill bytes
    const m = b[p + 1];
    if (m === 0xd9) { blocks.push({ start: p, end: p + 2, kind: 'keep' }); p += 2; break; }
    if (m === 0x01 || isRst(m)) { blocks.push({ start: p, end: p + 2, kind: 'keep' }); p += 2; continue; }
    if (p + 4 > n) throw damaged('JPEG');
    const end = p + 2 + be16(b, p + 2);
    if (end > n) throw damaged('JPEG');
    if (m === 0xda) {
      // Scan header + entropy-coded data, kept verbatim up to the next real marker
      // (inside the data, 0xFF is always followed by 00 stuffing or an RSTn marker).
      let q = end;
      while (q < n - 1 && !(b[q] === 0xff && b[q + 1] !== 0 && b[q + 1] !== 0xff && !isRst(b[q + 1]))) q++;
      if (q >= n - 1) q = n;
      blocks.push({ start: p, end: q, kind: 'keep' });
      p = q;
      continue;
    }
    blocks.push(jpegSegment(b, p, end, m));
    p = end;
  }
  if (p < n) blocks.push(trailing(b, p));
  return blocks;
}

// ---------- PNG ----------
const PNG_KEEP_PRIVATE = new Set(['acTL', 'fcTL', 'fdAT', 'orNT']); // APNG animation + orientation
function pngChunk(type, data) {
  const drop = (name, items, replace = null) => ({ name, kind: 'drop', items, replace });
  if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') return pngText(type, data);
  if (type === 'eXIf') {
    const t = readTiff(data), o = orientationTiff(t);
    return drop('Exif data (camera, GPS, dates)', exifItems(t), o && pngChunkBytes('eXIf', o));
  }
  if (type === 'caBX') return drop('Content Credentials (C2PA)', [item('C2PA', 'Content Credentials (C2PA)', 'signed provenance record: can name the app, AI tool or creator', 'high')]);
  if (type === 'iCCP') return { name: 'Colour profile', kind: 'icc', items: [item('ICC', 'Colour profile', `ICC profile "${str(data, 0, Math.max(0, data.indexOf(0)))}"`, 'low')] };
  if (type === 'tIME') {
    const pad = (x) => String(x).padStart(2, '0');
    return drop('Last-modified time', [item('tIME', 'Last-modified time', `${be16(data, 0)}-${pad(data[2])}-${pad(data[3])} ${pad(data[4])}:${pad(data[5])}`, 'medium')]);
  }
  if (type === 'dSIG') return drop('Digital signature', [item('dSIG', 'Digital signature', 'may identify the signer', 'medium')]);
  // Ancillary (lower-case 1st letter) + private (lower-case 2nd letter): app-specific extras.
  if (/^[a-z][a-z]/.test(type) && !PNG_KEEP_PRIVATE.has(type)) return drop(`Private app data "${type}"`, [item('PNG', 'Private app data', `"${type}" chunk`, 'medium')]);
  return { name: null, kind: 'keep', items: [] };
}

const PNG_KEYS = {
  parameters: ['AI prompt and settings (Stable Diffusion)', 'high'],
  prompt: ['AI prompt (ComfyUI)', 'high'], workflow: ['AI workflow (ComfyUI)', 'high'],
  author: ['Author', 'high'], artist: ['Author', 'high'], copyright: ['Copyright', 'high'], owner: ['Owner', 'high'],
  software: ['Software', 'medium'], comment: ['Comment', 'medium'], description: ['Description', 'medium'],
  title: ['Title', 'medium'], source: ['Source device', 'medium'], 'creation time': ['Creation time', 'medium'],
};
function pngText(type, data) {
  const nul = data.indexOf(0), key = str(data, 0, nul < 0 ? data.length : nul);
  let value = '', compressed = type === 'zTXt';
  if (type === 'tEXt') value = str(data, nul + 1);
  else if (type === 'iTXt' && nul >= 0) { // key\0 flag method lang\0 translatedKey\0 text
    const lang = data.indexOf(0, nul + 3), tk = lang < 0 ? -1 : data.indexOf(0, lang + 1);
    if (data[nul + 1]) compressed = true; else if (tk >= 0) value = utf8.decode(data.subarray(tk + 1));
  }
  const name = `Text "${key}"`;
  if (key === 'XML:com.adobe.xmp') return { name: 'XMP metadata', kind: 'drop', items: compressed ? [item('XMP', 'XMP metadata', '(compressed)', 'medium')] : xmpItems(value) };
  const [label, risk] = PNG_KEYS[key.toLowerCase()] || [`Text "${key}"`, 'medium'];
  const items = [item('PNG text', label, compressed ? '(compressed text)' : value || '(empty)', risk)];
  const ai = risk === 'high' ? null : aiItem('PNG text', `${key}\n${value}`);
  if (ai) items.push(ai);
  return { name, kind: 'drop', items };
}

function pngChunkBytes(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function parsePNG(b) {
  const blocks = [{ start: 0, end: 8, kind: 'keep' }];
  let p = 8;
  while (p < b.length) {
    if (p + 12 > b.length) throw damaged('PNG');
    const len = be32(b, p), type = str(b, p + 4, p + 8), end = p + 12 + len;
    if (end > b.length || !/^[A-Za-z]{4}$/.test(type)) throw damaged('PNG');
    blocks.push({ start: p, end, ...pngChunk(type, b.subarray(p + 8, p + 8 + len)) });
    p = end;
    if (type === 'IEND') break;
  }
  if (p < b.length) blocks.push(trailing(b, p));
  return blocks;
}

// ---------- WebP (RIFF) ----------
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF']);
function webpChunkBytes(id, data) {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}
function webpChunk(id, data) {
  if (id === 'EXIF') {
    const t = readTiff(has(data, 0, 'Exif\0') ? data.subarray(6) : data), o = orientationTiff(t);
    return { name: 'Exif data (camera, GPS, dates)', kind: 'drop', items: exifItems(t), replace: o && webpChunkBytes('EXIF', o) };
  }
  if (id === 'XMP ') return { name: 'XMP metadata', kind: 'drop', items: xmpItems(str(data)) };
  if (id === 'ICCP') return { name: 'Colour profile', kind: 'icc', items: [item('ICC', 'Colour profile', 'ICC profile, kept by default for accurate colours', 'low')] };
  if (id === 'C2PA') return { name: 'Content Credentials (C2PA)', kind: 'drop', items: [item('C2PA', 'Content Credentials (C2PA)', 'signed provenance record: can name the app, AI tool or creator', 'high')] };
  if (WEBP_KEEP.has(id)) return { name: null, kind: 'keep', items: [] };
  return { name: `Unknown chunk "${id.trim()}"`, kind: 'drop', items: [item('WebP', 'Other app data', `"${id.trim()}" chunk`, 'medium')] };
}
function parseWebP(b) {
  const riffEnd = le32(b, 4) + 8;
  if (riffEnd > b.length || riffEnd < 20) throw damaged('WebP');
  const blocks = [{ start: 0, end: 12, kind: 'keep' }];
  let p = 12;
  while (p + 8 <= riffEnd) {
    const id = str(b, p, p + 4), size = le32(b, p + 4), end = Math.min(p + 8 + size + (size & 1), riffEnd);
    if (p + 8 + size > riffEnd) throw damaged('WebP');
    blocks.push({ start: p, end, ...webpChunk(id, b.subarray(p + 8, p + 8 + size)) });
    p = end;
  }
  if (p < b.length) blocks.push(trailing(b, p));
  return blocks;
}
// After rewriting: VP8X flags must match the chunks that remain, and the RIFF size must be exact.
function fixWebP(out) {
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let vp8x = -1, flags = 0;
  for (let p = 12; p + 8 <= out.length;) {
    const id = str(out, p, p + 4), size = dv.getUint32(p + 4, true);
    if (id === 'VP8X') vp8x = p + 8;
    if (id === 'ICCP') flags |= 0x20;
    if (id === 'EXIF') flags |= 0x08;
    if (id === 'XMP ') flags |= 0x04;
    p += 8 + size + (size & 1);
  }
  if (vp8x >= 0) out[vp8x] = (out[vp8x] & ~0x2c) | flags;
  dv.setUint32(4, out.length - 8, true);
  return out;
}

// ---------- GIF ----------
function parseGIF(b) {
  const n = b.length;
  if (n < 14) throw damaged('GIF');
  const table = (f) => (f & 0x80 ? 3 * (1 << ((f & 7) + 1)) : 0);
  const skipSub = (q) => { for (;;) { if (q >= n) throw damaged('GIF'); const s = b[q]; q += 1 + s; if (!s) return q; } };
  const subData = (q, end) => { const parts = []; while (q < end && b[q]) { parts.push(b.subarray(q + 1, q + 1 + b[q])); q += 1 + b[q]; } return concat(parts); };
  let p = 13 + table(b[10]);
  const blocks = [{ start: 0, end: p, kind: 'keep' }];
  while (p < n) {
    const t = b[p];
    if (t === 0x3b) { blocks.push({ start: p, end: p + 1, kind: 'keep' }); p++; break; }
    if (t === 0x2c) { // image descriptor, optional local colour table, LZW min code size, image sub-blocks
      if (p + 11 > n) throw damaged('GIF');
      const end = skipSub(p + 10 + table(b[p + 9]) + 1);
      blocks.push({ start: p, end, kind: 'keep' });
      p = end;
      continue;
    }
    if (t !== 0x21) throw damaged('GIF');
    const label = b[p + 1], end = skipSub(p + 2), bl = { start: p, end, name: null, kind: 'keep', items: [] };
    if (label === 0xfe) {
      const text = utf8.decode(subData(p + 2, end)), ai = aiItem('Comment', text);
      Object.assign(bl, { name: 'Comment', kind: 'drop', items: [item('Comment', 'Comment', text || '(empty)', 'medium'), ...(ai ? [ai] : [])] });
    } else if (label === 0xff) {
      const id = b[p + 2] === 11 ? str(b, p + 3, p + 14) : '';
      if (id === 'XMP DataXMP') Object.assign(bl, { name: 'XMP metadata', kind: 'drop', items: xmpItems(str(b, p + 14, end)) });
      else if (id === 'ICCRGBG1012') Object.assign(bl, { name: 'Colour profile', kind: 'icc', items: [item('ICC', 'Colour profile', 'ICC profile, kept by default for accurate colours', 'low')] });
      else if (id !== 'NETSCAPE2.0' && id !== 'ANIMEXTS1.0') // animation loop count stays
        Object.assign(bl, { name: 'Other app data', kind: 'drop', items: [item('GIF', 'Other app data', id.replace(/[^\x20-\x7e]/g, '') || 'application extension', 'medium')] });
    }
    blocks.push(bl); // graphic control (F9) and plain text (01) are image content: kept
    p = end;
  }
  if (p < n) blocks.push(trailing(b, p));
  return blocks;
}

// ---------- public API ----------
const PARSERS = { jpeg: parseJPEG, png: parsePNG, webp: parseWebP, gif: parseGIF };
function detect(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 8 && has(b, 0, '\x89PNG\r\n\x1a\n')) return 'png';
  if (b.length > 12 && has(b, 0, 'RIFF') && has(b, 8, 'WEBP')) return 'webp';
  if (b.length > 6 && (has(b, 0, 'GIF87a') || has(b, 0, 'GIF89a'))) return 'gif';
  return 'unknown';
}
function open(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const format = detect(b);
  if (format === 'unknown') throw new Error(NOT_IMAGE);
  return { b, format, blocks: PARSERS[format](b) };
}

export function scanImage(bytes) {
  const { format, blocks } = open(bytes);
  return { format, items: blocks.flatMap((bl) => bl.items || []) };
}

export function wipeImage(bytes, { keepColorProfile = true } = {}) {
  const { b, format, blocks } = open(bytes);
  const parts = [], removed = [];
  for (const bl of blocks) {
    if (bl.kind === 'keep' || (bl.kind === 'icc' && keepColorProfile)) { parts.push(b.subarray(bl.start, bl.end)); continue; }
    if (bl.replace) parts.push(bl.replace);
    if (bl.name && !removed.includes(bl.name)) removed.push(bl.name);
  }
  const out = concat(parts);
  return { bytes: format === 'webp' ? fixWebP(out) : out, removed };
}

export function verifyWiped(bytes) {
  return scanImage(bytes).items.filter((i) => i.risk !== 'low');
}
