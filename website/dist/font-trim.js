// Shrinks a TrueType font to the glyphs a PDF actually uses, keeping every
// glyph number where it was. pdf-lib's own subsetting renumbers glyphs and
// loses letters with the Noto fonts in most PDF viewers; this keeps a
// two-font PDF at tens of kilobytes instead of several hundred.
const KEEP = ['head', 'hhea', 'maxp', 'hmtx', 'loca', 'glyf', 'cvt ', 'fpgm', 'prep'];

// Returns the trimmed font, or the original bytes if the font isn't a plain
// TrueType file with outlines this can read.
export function trimFont(bytes, used) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0) !== 0x00010000 && view.getUint32(0) !== 0x74727565) return bytes;
    const tables = new Map();
    for (let i = 0, count = view.getUint16(4); i < count; i++) {
      const at = 12 + i * 16;
      tables.set(String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]), { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
    }
    const head = tables.get('head'), loca = tables.get('loca'), glyf = tables.get('glyf'), maxp = tables.get('maxp');
    if (!head || !loca || !glyf || !maxp) return bytes;
    const long = view.getInt16(head.offset + 50) === 1, count = view.getUint16(maxp.offset + 4);
    const start = (g) => long ? view.getUint32(loca.offset + g * 4) : view.getUint16(loca.offset + g * 2) * 2;
    // Accented letters are often built from other glyphs, so those come too.
    const keep = new Set([0]);
    const add = (g) => {
      if (g >= count || keep.has(g) && g !== 0) return;
      keep.add(g);
      const from = glyf.offset + start(g), length = start(g + 1) - start(g);
      if (length < 10 || view.getInt16(from) >= 0) return;
      for (let at = from + 10, flags = 0x20; flags & 0x20 && at + 4 <= from + length;) {
        flags = view.getUint16(at);
        add(view.getUint16(at + 2));
        at += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      }
    };
    for (const g of used) add(g);
    const sizes = Array.from({ length: count }, (_, g) => keep.has(g) ? (start(g + 1) - start(g) + 3) & ~3 : 0);
    const newGlyf = new Uint8Array(sizes.reduce((s, n) => s + n, 0)), newLoca = new Uint8Array((count + 1) * 4);
    const locaView = new DataView(newLoca.buffer);
    let at = 0;
    for (let g = 0; g < count; g++) {
      locaView.setUint32(g * 4, at);
      if (sizes[g]) { newGlyf.set(bytes.subarray(glyf.offset + start(g), glyf.offset + start(g + 1)), at); at += sizes[g]; }
    }
    locaView.setUint32(count * 4, at);
    const newHead = bytes.slice(head.offset, head.offset + head.length);
    new DataView(newHead.buffer).setInt16(50, 1);
    new DataView(newHead.buffer).setUint32(8, 0);
    const parts = KEEP.filter((tag) => tables.has(tag)).sort().map((tag) => [tag, tag === 'glyf' ? newGlyf : tag === 'loca' ? newLoca : tag === 'head' ? newHead : bytes.subarray(tables.get(tag).offset, tables.get(tag).offset + tables.get(tag).length)]);
    const headerSize = 12 + parts.length * 16;
    const out = new Uint8Array(headerSize + parts.reduce((s, [, data]) => s + ((data.length + 3) & ~3), 0)), outView = new DataView(out.buffer);
    const log = Math.floor(Math.log2(parts.length));
    outView.setUint32(0, 0x00010000); outView.setUint16(4, parts.length); outView.setUint16(6, 2 ** log * 16); outView.setUint16(8, log); outView.setUint16(10, parts.length * 16 - 2 ** log * 16);
    let offset = headerSize;
    parts.forEach(([tag, data], i) => {
      out.set(data, offset);
      const padded = (data.length + 3) & ~3;
      let sum = 0;
      for (let k = 0; k < padded; k += 4) sum = (sum + outView.getUint32(offset + k)) >>> 0;
      const record = 12 + i * 16;
      for (let k = 0; k < 4; k++) out[record + k] = tag.charCodeAt(k);
      outView.setUint32(record + 4, sum); outView.setUint32(record + 8, offset); outView.setUint32(record + 12, data.length);
      offset += padded;
    });
    return out;
  } catch { return bytes; }
}

// Remembers which glyphs each pdf-lib font drew, then swaps each font's file
// for a trimmed one just before the PDF is saved.
export function fontTracker() {
  const used = new Map();
  return {
    use(font, text) {
      const layout = font.embedder?.font?.layout;
      if (!layout) return;
      if (!used.has(font)) used.set(font, new Set());
      for (const glyph of font.embedder.font.layout(text, font.embedder.fontFeatures).glyphs) used.get(font).add(glyph.id);
    },
    trim() { for (const [font, glyphs] of used) if (font.embedder.fontData) font.embedder.fontData = trimFont(font.embedder.fontData instanceof Uint8Array ? font.embedder.fontData : new Uint8Array(font.embedder.fontData), glyphs); },
  };
}
