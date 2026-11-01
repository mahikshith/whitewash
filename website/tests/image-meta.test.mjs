import test from 'node:test';
import assert from 'node:assert/strict';
import { scanImage, wipeImage, verifyWiped } from '../dist/image-meta.js';
import { encodeBMP, encodeTIFF, encodeICO } from '../dist/image-codecs.js';

// ---------- byte helpers ----------
const enc = new TextEncoder();
const bytes = (...parts) => {
  const arrs = parts.map((p) => (typeof p === 'string' ? Uint8Array.from(p, (c) => c.charCodeAt(0)) : p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
const u16le = (v) => [v & 255, v >> 8];
const u32le = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24];
const u32be = (v) => [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
const ascii = (s) => bytes(s, [0]);
const rats = (...vals) => bytes(...vals.flatMap((v) => [u32le(v), u32le(1)]));
const indexOf = (hay, needle) => { outer: for (let i = 0; i <= hay.length - needle.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i; } return -1; };
const contains = (hay, s) => indexOf(hay, bytes(s)) >= 0;

const CRC = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = (b) => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };

// Little-endian TIFF builder. ifds[i] = [[tag, type, count, Uint8Array | { ptr: ifdIndex }]].
function tiff(ifds, next0) {
  const dataLen = (es) => es.reduce((s, e) => s + (e[3].length > 4 ? e[3].length + (e[3].length & 1) : 0), 0);
  const offs = [];
  let o = 8;
  for (const es of ifds) { offs.push(o); o += 2 + es.length * 12 + 4 + dataLen(es); }
  const out = new Uint8Array(o), dv = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  ifds.forEach((es, i) => {
    const p = offs[i];
    let d = p + 2 + es.length * 12 + 4;
    dv.setUint16(p, es.length, true);
    es.forEach(([tag, type, count, val], j) => {
      const e = p + 2 + j * 12;
      dv.setUint16(e, tag, true); dv.setUint16(e + 2, type, true); dv.setUint32(e + 4, count, true);
      if (val.ptr !== undefined) dv.setUint32(e + 8, offs[val.ptr], true);
      else if (val.length <= 4) out.set(val, e + 8);
      else { dv.setUint32(e + 8, d, true); out.set(val, d); d += val.length + (val.length & 1); }
    });
    if (i === 0 && next0 != null) dv.setUint32(p + 2 + es.length * 12, offs[next0], true);
  });
  return out;
}
const str = (t, s) => [t, 2, s.length + 1, ascii(s)];
// IFD0 (Make, Model, Orientation, Software, ExifIFD, GPSIFD) -> Exif IFD -> GPS IFD, IFD1 thumbnail
const cameraTiff = (orientation = 1) => tiff([
  [str(0x10f, 'Canon'), str(0x110, 'EOS R5'), [0x112, 3, 1, bytes(u16le(orientation), [0, 0])], str(0x131, 'Adobe Firefly'), [0x8769, 4, 1, { ptr: 1 }], [0x8825, 4, 1, { ptr: 2 }]],
  [str(0x9003, '2024:05:01 10:00:00'), str(0xa431, 'SN123456')],
  [[1, 2, 2, ascii('N')], [2, 5, 3, rats(51, 30, 36)], [3, 2, 2, ascii('W')], [4, 5, 3, rats(0, 7, 12)]],
  [[0x201, 4, 1, bytes(u32le(0))], [0x202, 4, 1, bytes(u32le(0))]],
], 3);

const XMP = '<x:xmpmeta><rdf:Description xmp:CreatorTool="Midjourney v6" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>';
const seg = (m, ...payload) => { const p = bytes(...payload); return bytes([0xff, m, (p.length + 2) >> 8, (p.length + 2) & 255], p); };

// SOI, APP0 JFIF, APP1 Exif, APP1 XMP, APP2 ICC, APP11 JUMBF/C2PA, APP12 Ducky, APP14 Adobe, COM, DQT, SOF0, SOS + entropy, EOI, trailer
function makeJPEG(orientation) {
  const head = bytes(
    [0xff, 0xd8],
    seg(0xe0, 'JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0]),
    seg(0xe1, 'Exif\0\0', cameraTiff(orientation)),
    seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0', XMP),
    seg(0xe2, 'ICC_PROFILE\0', [1, 1], 'fakeprofile'),
    seg(0xeb, 'JP', [0, 1, 0, 0, 0, 1], u32be(20), 'jumb', u32be(12), 'jumdc2pa'),
    seg(0xec, 'Ducky', [0, 1, 0, 4, 0, 0, 0, 80]),
    seg(0xee, 'Adobe', [0, 100, 0, 0, 0, 0, 1]),
    seg(0xfe, 'shot by Jane at home'),
  );
  const body = bytes(
    seg(0xdb, [0], new Array(64).fill(1)),
    seg(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
    seg(0xda, [1, 1, 0, 0, 63, 0]),
    [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xff, 0xd9], // stuffed FF00, RST0, fill byte, EOI
  );
  return { file: bytes(head, body, [0xff, 0xd8, 0xff, 0xe1, 0, 4, 9, 9]), body };
}

test('JPEG: scan finds GPS, camera, serial, AI tags, C2PA, comment and thumbnail', () => {
  const { format, items } = scanImage(makeJPEG().file);
  assert.equal(format, 'jpeg');
  const find = (label) => items.find((i) => i.label === label);
  assert.equal(find('GPS location').detail, '51.510, -0.120');
  assert.equal(find('GPS location').risk, 'high');
  assert.equal(find('Camera maker').detail, 'Canon');
  assert.equal(find('Camera model').detail, 'EOS R5');
  assert.equal(find('Camera serial number').risk, 'high');
  assert.equal(find('Date taken').risk, 'medium');
  assert.equal(find('Creator tool').detail, 'Midjourney v6');
  assert.ok(items.some((i) => i.label === 'AI / provenance marker' && /AI-generated media/.test(i.detail) && /Midjourney/.test(i.detail)));
  assert.ok(items.some((i) => i.block === 'Exif' && i.label === 'AI / provenance marker' && /Firefly/.test(i.detail)));
  assert.equal(find('Content Credentials (C2PA)').risk, 'high');
  assert.equal(find('Comment').detail, 'shot by Jane at home');
  assert.ok(find('Embedded thumbnail'));
  assert.equal(find('Colour profile').risk, 'low');
  assert.equal(find('Other app data').detail, 'Ducky');
  assert.equal(find('Data after the end of the image').risk, 'high');
});

test('JPEG: wipe drops metadata, keeps JFIF/ICC/Adobe and scan data byte-identical', () => {
  const { file, body } = makeJPEG();
  const { bytes: out, removed } = wipeImage(file);
  assert.deepEqual(verifyWiped(out), []);
  assert.ok(removed.includes('Exif data (camera, GPS, dates)') && removed.includes('Content Credentials (C2PA)') && removed.includes('Comment'));
  assert.deepEqual([...out.subarray(out.length - body.length)], [...body]); // DQT..EOI untouched, trailer gone
  assert.ok(contains(out, 'JFIF') && contains(out, 'ICC_PROFILE') && contains(out, 'Adobe'));
  assert.ok(!contains(out, 'Exif') && !contains(out, 'xmpmeta') && !contains(out, 'Ducky') && !contains(out, 'Jane'));
  assert.ok(!contains(wipeImage(file, { keepColorProfile: false }).bytes, 'ICC_PROFILE'));
  assert.deepEqual(wipeImage(out).removed, []); // idempotent
});

test('JPEG: a rotated photo keeps only its orientation flag', () => {
  const { bytes: out } = wipeImage(makeJPEG(6).file);
  assert.deepEqual(verifyWiped(out), []);
  const at = indexOf(out, bytes('Exif\0\0'));
  assert.ok(at > 0);
  assert.equal(out[at - 2] * 256 + out[at - 1], 34); // APP1 length: 2 + 6 + 26-byte TIFF
  assert.equal(out[at + 6 + 18], 6);
  assert.ok(!contains(out, 'Canon'));
});

// ---------- PNG ----------
const chunk = (type, ...data) => { const d = bytes(...data); const td = bytes(type, d); return bytes(u32be(d.length), td, u32be(crc32(td))); };
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x00, 0x01, 0xff]);
const makePNG = () => bytes(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  chunk('IHDR', u32be(1), u32be(1), [8, 6, 0, 0, 0]),
  chunk('iCCP', 'sRGB IEC\0', [0], [1, 2, 3]),
  chunk('tEXt', 'parameters\0', 'a cat, Steps: 20, Sampler: Euler a'),
  chunk('tEXt', 'Software\0', 'NovelAI'),
  chunk('iTXt', 'XML:com.adobe.xmp\0', [0, 0], '\0\0', XMP),
  chunk('tIME', [0x07, 0xe8, 5, 1, 12, 30, 0]),
  chunk('eXIf', cameraTiff()),
  IDAT,
  chunk('IEND'),
);
function pngChunks(b) {
  const out = [];
  for (let p = 8; p < b.length;) {
    const len = new DataView(b.buffer, b.byteOffset).getUint32(p);
    const type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    out.push({ type, ok: crc32(b.subarray(p + 4, p + 8 + len)) === new DataView(b.buffer, b.byteOffset).getUint32(p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

test('PNG: scan reports AI prompt, software, XMP, Exif, time and colour profile', () => {
  const { format, items } = scanImage(makePNG());
  assert.equal(format, 'png');
  assert.equal(items.find((i) => i.label.startsWith('AI prompt')).risk, 'high');
  assert.ok(items.some((i) => i.label === 'Software' && i.detail === 'NovelAI'));
  assert.ok(items.some((i) => i.block === 'PNG text' && i.label === 'AI / provenance marker' && /NovelAI/.test(i.detail)));
  assert.ok(items.some((i) => i.label === 'Creator tool' && i.detail === 'Midjourney v6'));
  assert.ok(items.some((i) => i.label === 'GPS location'));
  assert.ok(items.some((i) => i.label === 'Last-modified time' && i.detail === '2024-05-01 12:30'));
  assert.ok(items.some((i) => i.label === 'Colour profile' && /sRGB IEC/.test(i.detail)));
});

test('PNG: wipe leaves valid chunks, identical IDAT and optional iCCP', () => {
  const { bytes: out, removed } = wipeImage(makePNG());
  assert.deepEqual(pngChunks(out).map((c) => c.type), ['IHDR', 'iCCP', 'IDAT', 'IEND']);
  assert.ok(pngChunks(out).every((c) => c.ok));
  assert.ok(indexOf(out, IDAT) > 0);
  assert.deepEqual(verifyWiped(out), []);
  assert.ok(removed.includes('Text "parameters"') && removed.includes('XMP metadata'));
  assert.deepEqual(pngChunks(wipeImage(makePNG(), { keepColorProfile: false }).bytes).map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
});

// ---------- WebP ----------
const riffChunk = (id, ...data) => { const d = bytes(...data); return bytes(id, u32le(d.length), d, d.length & 1 ? [0] : []); };
const VP8L = riffChunk('VP8L', [0x2f, 0, 0, 0, 0, 0x07, 0x10, 0x11, 0xff]);
function makeWebP() {
  const body = bytes(
    'WEBP',
    riffChunk('VP8X', [0x2c, 0, 0, 0], [0, 0, 0], [0, 0, 0]),
    riffChunk('ICCP', 'fakeprofile'),
    VP8L,
    riffChunk('EXIF', cameraTiff()),
    riffChunk('XMP ', XMP + ' '), // odd length, needs a pad byte
  );
  return bytes('RIFF', u32le(body.length), body);
}

test('WebP: wipe drops EXIF/XMP, fixes VP8X flags and RIFF size, keeps VP8L', () => {
  const file = makeWebP();
  const { format, items } = scanImage(file);
  assert.equal(format, 'webp');
  assert.ok(items.some((i) => i.label === 'GPS location') && items.some((i) => i.label === 'XMP metadata'));
  const { bytes: out } = wipeImage(file);
  const dv = new DataView(out.buffer, out.byteOffset);
  assert.equal(dv.getUint32(4, true), out.length - 8);
  assert.equal(out[20], 0x20); // only the ICC flag remains
  assert.ok(indexOf(out, VP8L) > 0 && !contains(out, 'EXIF') && !contains(out, 'XMP '));
  assert.deepEqual(verifyWiped(out), []);
  const noIcc = wipeImage(file, { keepColorProfile: false }).bytes;
  assert.equal(noIcc[20], 0);
  assert.equal(new DataView(noIcc.buffer).getUint32(4, true), noIcc.length - 8);
});

// ---------- GIF ----------
const IMAGE = bytes([0x21, 0xf9, 4, 0, 0, 0, 0, 0], [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0], [2, 2, 0x44, 0x01, 0]);
// XMP in GIF is raw text followed by a 258-byte "magic trailer" (01 FF FE .. 01 00 00)
// that makes any sub-block walk land on the terminator.
const XMP_TRAILER = bytes([1], Array.from({ length: 256 }, (_, i) => 255 - i), [0]);
const makeGIF = () => bytes(
  'GIF89a', u16le(1), u16le(1), [0x80, 0, 0], [0, 0, 0, 255, 255, 255],
  [0x21, 0xff, 11], 'NETSCAPE2.0', [3, 1, 0, 0, 0],
  [0x21, 0xfe, 9], 'Made with', [10], ' Google AI', [0],
  [0x21, 0xff, 11], 'XMP DataXMP', XMP, XMP_TRAILER,
  IMAGE, [0x3b],
);

test('GIF: comment and XMP removed, loop extension and image kept', () => {
  const file = makeGIF();
  const { format, items } = scanImage(file);
  assert.equal(format, 'gif');
  assert.ok(items.some((i) => i.label === 'Comment' && i.detail === 'Made with Google AI'));
  assert.ok(items.some((i) => i.label === 'AI / provenance marker' && /Google AI/.test(i.detail)));
  const { bytes: out, removed } = wipeImage(file);
  assert.deepEqual(removed, ['Comment', 'XMP metadata']);
  assert.ok(contains(out, 'NETSCAPE2.0') && indexOf(out, IMAGE) > 0 && out.at(-1) === 0x3b);
  assert.deepEqual(verifyWiped(out), []);
});

test('unknown and damaged files give a short human error', () => {
  assert.throws(() => scanImage(enc.encode('hello world, not an image')), /doesn't look like a JPEG, PNG, WebP or GIF/);
  assert.throws(() => wipeImage(new Uint8Array(0)), /doesn't look like/);
  assert.throws(() => scanImage(makePNG().subarray(0, 60)), /PNG file looks damaged/);
  assert.throws(() => wipeImage(makeJPEG().file.subarray(0, 30)), /JPEG file looks damaged/);
});

// ---------- encoders ----------
const img = (w, h, a = 255) => ({ width: w, height: h, data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? a : i)) });

test('BMP: 24-bit padded rows when opaque, 32-bit bitfields with alpha', () => {
  const b24 = encodeBMP(img(3, 2)), d24 = new DataView(b24.buffer);
  assert.equal(String.fromCharCode(b24[0], b24[1]), 'BM');
  assert.equal(d24.getUint32(2, true), b24.length);
  assert.equal(b24.length, 54 + 12 * 2); // 9 bytes per row padded to 12
  assert.equal(d24.getUint16(28, true), 24);
  assert.deepEqual([...b24.subarray(54, 57)], [14, 13, 12]); // bottom row first, BGR
  const b32 = encodeBMP(img(3, 2, 128)), d32 = new DataView(b32.buffer);
  assert.equal(d32.getUint32(2, true), b32.length);
  assert.equal(b32.length, 122 + 24);
  assert.equal(d32.getUint16(28, true), 32);
  assert.equal(d32.getUint32(30, true), 3);
  assert.equal(d32.getUint32(66, true), 0xff000000);
  assert.deepEqual([...b32.subarray(122, 126)], [14, 13, 12, 128]);
});

test('TIFF: little-endian header, IFD tags and pixel strip', () => {
  const check = (t, spp) => {
    const dv = new DataView(t.buffer);
    assert.deepEqual([...t.subarray(0, 4)], [0x49, 0x49, 42, 0]);
    const ifd = dv.getUint32(4, true), n = dv.getUint16(ifd, true), tags = {};
    for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; tags[dv.getUint16(e, true)] = { count: dv.getUint32(e + 4, true), v16: dv.getUint16(e + 8, true), v32: dv.getUint32(e + 8, true) }; }
    assert.equal(tags[256].v32, 2); assert.equal(tags[257].v32, 2);
    assert.equal(tags[258].count, spp); assert.equal(dv.getUint16(tags[258].v32, true), 8);
    assert.equal(tags[259].v16, 1); assert.equal(tags[262].v16, 2); assert.equal(tags[277].v16, spp);
    assert.equal(tags[279].v32, 4 * spp); assert.equal(t[tags[273].v32 + 1], 1);
    assert.equal(dv.getUint32(tags[282].v32, true), 72);
    return tags;
  };
  assert.equal(check(encodeTIFF(img(2, 2, 7)), 4)[338].v16, 2);
  assert.equal(check(encodeTIFF(img(2, 2)), 3)[338], undefined);
});

test('ICO: directory entries, 256 stored as 0, offsets point at the PNGs', () => {
  const a = bytes([0x89], 'PNG-A'), b = bytes([0x89], 'PNG-BB');
  const ico = encodeICO([{ width: 16, height: 16, bytes: a }, { width: 256, height: 256, bytes: b }]), dv = new DataView(ico.buffer);
  assert.deepEqual([dv.getUint16(0, true), dv.getUint16(2, true), dv.getUint16(4, true)], [0, 1, 2]);
  assert.equal(ico[6], 16); assert.equal(ico[22], 0); assert.equal(ico[23], 0);
  assert.equal(dv.getUint32(14, true), a.length); assert.equal(dv.getUint32(18, true), 38);
  assert.equal(dv.getUint32(34, true), 44); assert.deepEqual([...ico.subarray(44)], [...b]);
  assert.throws(() => encodeICO([{ width: 512, height: 512, bytes: a }]), /between 1 and 256/);
});
