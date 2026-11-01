// Stronger image compression: MozJPEG for JPEGs and OxiPNG (lossless) for
// PNGs, both WASM from jSquash. Used by "Compress images" after the canvas has
// resized and re-encoded the picture.
const vendor = (path) => new URL('./vendor/jsquash/' + path, import.meta.url).href;
let jpeg = null, png = null;

async function pixels(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0); bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

// Returns a smaller Blob, or the input when the codec can't beat it.
export async function squeeze(blob, quality) {
  try {
    if (blob.type === 'image/jpeg') {
      jpeg ||= import(vendor('jpeg/encode.js')).then((m) => m.default);
      const encode = await jpeg;
      const out = new Blob([await encode(await pixels(blob), { quality: Math.round(quality * 100), progressive: true, optimize_coding: true })], { type: 'image/jpeg' });
      return out.size < blob.size ? out : blob;
    }
    if (blob.type === 'image/png') {
      png ||= import(vendor('oxipng/squoosh_oxipng.js')).then(async (m) => { await m.default(); return m.optimise; });
      const optimise = await png;
      const out = new Blob([optimise(new Uint8Array(await blob.arrayBuffer()), 2, false, true)], { type: 'image/png' });
      return out.size < blob.size ? out : blob;
    }
  } catch { /* codec failed to load: keep the canvas result */ }
  return blob;
}
