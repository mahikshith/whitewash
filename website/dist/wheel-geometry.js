// Geometry for the radial picker. Segment 0 is centred at 12 o'clock and the rest
// follow clockwise. Angles are in radians, measured clockwise from 3 o'clock
// (screen coordinates, y pointing down).
export const WHEEL = { inner: 62, outer: 150, gap: 6, corner: 12, reach: 28 };

export function segmentAngles(count) {
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, i) => {
    const middle = -Math.PI / 2 + i * step;
    return { start: middle - step / 2, end: middle + step / 2, middle };
  });
}

// Index of the segment under (dx, dy) from the wheel centre, -1 for the hub,
// or null when the point is outside the wheel.
export function hitTest(dx, dy, count, geometry = WHEEL) {
  const distance = Math.hypot(dx, dy);
  if (distance < geometry.inner) return -1;
  if (distance > geometry.outer + geometry.reach || !count) return null;
  const step = (2 * Math.PI) / count;
  const angle = Math.atan2(dy, dx) + Math.PI / 2 + step / 2;
  return Math.floor((((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / step) % count;
}

const point = (cx, cy, radius, angle) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)].map((n) => +n.toFixed(2)).join(' ');

// A ring segment shrunk by `corner` on every side. Drawn with a stroke of width
// 2 * corner and round joins, it fills back out to the full size with rounded
// corners, which keeps the path maths simple.
export function segmentPath(cx, cy, start, end, geometry = WHEEL) {
  const inset = geometry.corner;
  const offset = geometry.gap / 2 + inset;
  const r0 = geometry.inner + inset, r1 = geometry.outer - inset;
  const outerShift = Math.asin(Math.min(1, offset / r1));
  const innerShift = Math.asin(Math.min(1, offset / r0));
  const a0 = start + outerShift, a1 = end - outerShift;
  const b0 = start + innerShift, b1 = end - innerShift;
  const outerLarge = a1 - a0 > Math.PI ? 1 : 0, innerLarge = b1 - b0 > Math.PI ? 1 : 0;
  return 'M ' + point(cx, cy, r1, a0) + ' A ' + r1 + ' ' + r1 + ' 0 ' + outerLarge + ' 1 ' + point(cx, cy, r1, a1)
    + ' L ' + point(cx, cy, r0, b1) + ' A ' + r0 + ' ' + r0 + ' 0 ' + innerLarge + ' 0 ' + point(cx, cy, r0, b0) + ' Z';
}

export function labelPoint(cx, cy, middle, geometry = WHEEL) {
  const radius = geometry.inner + (geometry.outer - geometry.inner) * 0.54;
  return { x: cx + radius * Math.cos(middle), y: cy + radius * Math.sin(middle) };
}

// Keep the whole wheel on screen.
export function clampCentre(x, y, width, height, geometry = WHEEL) {
  const margin = geometry.outer + 16;
  return {
    x: Math.min(Math.max(x, margin), Math.max(margin, width - margin)),
    y: Math.min(Math.max(y, margin), Math.max(margin, height - margin)),
  };
}
