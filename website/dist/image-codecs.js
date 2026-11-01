// Extra output encoders the canvas cannot produce: BMP, TIFF and ICO.
// Inputs are ImageData-like { width, height, data: RGBA Uint8ClampedArray }.

const opaque = (data) => { for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false; return true; };
const check = ({ width, height, data }) => {
  if (!(width > 0 && height > 0) || data.length < width * height * 4) throw new Error('The image data is empty or the wrong size.');
};

// BMP: 24-bit BGR when fully opaque, otherwise 32-bit BGRA with BI_BITFIELDS
// masks in a BITMAPV4HEADER so readers honour the alpha channel. Rows run bottom-up.
export function encodeBMP(img) {
  check(img);
  const { width: w, height: h, data } = img;
  const alpha = !opaque(data), bpp = alpha ? 4 : 3;
  const stride = (w * bpp + 3) & ~3; // rows padded to 4 bytes
  const header = 14 + (alpha ? 108 : 40), size = header + stride * h;
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d; // 'BM'
  dv.setUint32(2, size, true);
  dv.setUint32(10, header, true);
  dv.setUint32(14, alpha ? 108 : 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true); // positive height = bottom-up
  dv.setUint16(26, 1, true);
  dv.setUint16(28, bpp * 8, true);
  dv.setUint32(30, alpha ? 3 : 0, true); // BI_BITFIELDS : BI_RGB
  dv.setUint32(34, stride * h, true);
  dv.setInt32(38, 2835, true); // 72 dpi
  dv.setInt32(42, 2835, true);
  if (alpha) {
    dv.setUint32(54, 0x00ff0000, true); // R, G, B, A masks
    dv.setUint32(58, 0x0000ff00, true);
    dv.setUint32(62, 0x000000ff, true);
    dv.setUint32(66, 0xff000000, true);
    dv.setUint32(70, 0x73524742, true); // 'sRGB' colour space
  }
  for (let y = 0; y < h; y++) {
    let o = header + (h - 1 - y) * stride;
    for (let x = 0, i = y * w * 4; x < w; x++, i += 4) {
      out[o++] = data[i + 2]; out[o++] = data[i + 1]; out[o++] = data[i];
      if (alpha) out[o++] = data[i + 3];
    }
  }
  return out;
}

// TIFF: baseline, little-endian, uncompressed, one strip. RGBA uses
// ExtraSamples = 2 (unassociated alpha); fully opaque images are written as RGB.
export function encodeTIFF(img) {
  check(img);
  const { width: w, height: h, data } = img;
  const spp = opaque(data) ? 3 : 4, pixels = w * h * spp;
  const tags = [
    [256, 4, 1, w], [257, 4, 1, h], [258, 3, spp, null], [259, 3, 1, 1], [262, 3, 1, 2],
    [273, 4, 1, 8], [277, 3, 1, spp], [278, 4, 1, h], [279, 4, 1, pixels],
    [282, 5, 1, null], [283, 5, 1, null], [284, 3, 1, 1], [296, 3, 1, 2],
    ...(spp === 4 ? [[338, 3, 1, 2]] : []),
  ];
  const ifd = 8 + pixels + (pixels & 1); // IFD must start on a word boundary
  const extra = ifd + 2 + tags.length * 12 + 4; // BitsPerSample array, then X/Y resolution
  const out = new Uint8Array(extra + spp * 2 + 16), dv = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]);
  dv.setUint32(4, ifd, true);
  for (let i = 0, o = 8; i < w * h * 4; i += 4) {
    out[o++] = data[i]; out[o++] = data[i + 1]; out[o++] = data[i + 2];
    if (spp === 4) out[o++] = data[i + 3];
  }
  dv.setUint16(ifd, tags.length, true);
  tags.forEach(([tag, type, count, value], k) => {
    const e = ifd + 2 + k * 12;
    dv.setUint16(e, tag, true); dv.setUint16(e + 2, type, true); dv.setUint32(e + 4, count, true);
    if (tag === 258) dv.setUint32(e + 8, extra, true);
    else if (tag === 282 || tag === 283) dv.setUint32(e + 8, extra + spp * 2 + (tag === 283 ? 8 : 0), true);
    else if (type === 3) dv.setUint16(e + 8, value, true);
    else dv.setUint32(e + 8, value, true);
  });
  for (let s = 0; s < spp; s++) dv.setUint16(extra + s * 2, 8, true);
  for (const r of [0, 8]) { dv.setUint32(extra + spp * 2 + r, 72, true); dv.setUint32(extra + spp * 2 + r + 4, 1, true); }
  return out;
}

// ICO with PNG-compressed entries (Vista+). Width/height 256 are stored as 0.
export function encodeICO(pngs) {
  if (!pngs?.length) throw new Error('An icon needs at least one image.');
  const head = 6 + 16 * pngs.length;
  const out = new Uint8Array(head + pngs.reduce((n, p) => n + p.bytes.length, 0)), dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true); // type: icon
  dv.setUint16(4, pngs.length, true);
  let offset = head;
  pngs.forEach(({ width, height, bytes }, i) => {
    if (!(width >= 1 && width <= 256 && height >= 1 && height <= 256)) throw new Error('Icon sizes must be between 1 and 256 pixels.');
    const e = 6 + i * 16;
    out[e] = width & 255; out[e + 1] = height & 255;
    dv.setUint16(e + 4, 1, true); // colour planes
    dv.setUint16(e + 6, 32, true); // bits per pixel
    dv.setUint32(e + 8, bytes.length, true);
    dv.setUint32(e + 12, offset, true);
    out.set(bytes, offset);
    offset += bytes.length;
  });
  return out;
}
