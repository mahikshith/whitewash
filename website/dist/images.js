// Image conversion with the browser's own canvas. Re-encoding writes fresh pixels
// only, so EXIF data (location, camera, dates) never reaches the copy.
import { fileKind } from './actions.js';

export const MAX_IMAGE_BYTES = 40_000_000;
export const MAX_PIXELS = 100_000_000;
const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const ENCODABLE = Object.keys(EXTENSION);

// Canvas can save JPG, PNG and WebP. Anything else becomes PNG when "keep" is asked.
export function outputType(inputType, requested) {
  if (requested !== 'keep') return requested;
  return ENCODABLE.includes(inputType) ? inputType : 'image/png';
}

export function outputName(name, type, suffix = '') {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return base + suffix + '.' + EXTENSION[type];
}

export function fitWithin(width, height, longest) {
  if (!longest || Math.max(width, height) <= longest) return { width, height };
  const scale = longest / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function checkImage(file) {
  if (fileKind(file) !== 'image') throw new Error(file.name + ': use JPG, PNG, WebP, GIF, BMP or AVIF.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error(file.name + ' is over 40 MB.');
}

export async function convertImage(file, { type = 'keep', quality = 0.9, longest = 0, suffix = '' } = {}) {
  checkImage(file);
  const target = outputType(file.type, type);
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Couldn’t read ' + file.name + '. The file may be damaged.'); }
  if (bitmap.width * bitmap.height > MAX_PIXELS) { bitmap.close(); throw new Error(file.name + ' is over 100 megapixels.'); }
  const size = fitWithin(bitmap.width, bitmap.height, longest);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (target === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height); }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, target, target === 'image/png' ? undefined : quality));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('Couldn’t save ' + file.name + '.');
  if (blob.type !== target) throw new Error('This browser can’t save ' + EXTENSION[target].toUpperCase() + ' files. Try JPG or PNG.');
  return { blob, name: outputName(file.name, target, suffix), width: size.width, height: size.height, before: file.size };
}

export function formatBytes(bytes) {
  if (bytes < 1000) return bytes + ' B';
  if (bytes < 1_000_000) return Math.round(bytes / 1000) + ' KB';
  return (bytes / 1_000_000).toFixed(1) + ' MB';
}

// Avoid two downloads called photo.jpg in one batch.
export function uniqueNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = seen.get(name.toLowerCase()) || 0;
    seen.set(name.toLowerCase(), count + 1);
    return count ? name.replace(/(\.[^.]+)$/, ' ' + (count + 1) + '$1') : name;
  });
}
