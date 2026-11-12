// Draws PowerPoint slides as PDF pages: one page per slide, at the slide's size.
// parsePptx turns the package into plain shapes in points with y pointing down;
// pptxToPdf lays the text out with the embedded fonts and paints everything.
import { readZip, unpack } from './office-zip.js';
import { fontTracker } from './font-trim.js';

const BIG = { maxBytes: 60_000_000, maxEntries: 5000, maxExpanded: 200_000_000, maxPart: 60_000_000 };
const PT = 12700;
const decoder = new TextDecoder();
const unreadable = () => { throw new Error('This isn’t a readable .pptx file.'); };

// xmldom has no querySelector or .children, so everything walks childNodes.
const els = (node) => node ? Array.from(node.childNodes).filter((c) => c.nodeType === 1) : [];
const kids = (node, name) => els(node).filter((c) => c.localName === name);
const kid = (node, ...path) => { for (const name of path) node = node && els(node).find((c) => c.localName === name); return node || null; };
const at = (node, name) => { const v = node?.getAttribute?.(name); return v == null || v === '' ? undefined : v; };
const num = (node, name, fallback) => { const v = Number(at(node, name)); return Number.isFinite(v) ? v : fallback; };
const emu = (node, name, fallback) => { const v = num(node, name); return v === undefined ? fallback : v / PT; };
const on = (v) => v === '1' || v === 'true' || v === 'on';
const rAttr = (node, name) => node && Array.from(node.attributes).find((a) => a.localName === name && (a.prefix === 'r' || String(a.namespaceURI).includes('relationships')))?.value;
const deep = (node, name, found = []) => { for (const c of els(node)) { if (c.localName === name) found.push(c); deep(c, name, found); } return found; };

// ---------- colours ----------

const PRESET = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF', gray: '808080', grey: '808080', ltGray: 'D3D3D3', dkGray: 'A9A9A9', orange: 'FFA500', purple: '800080', navy: '000080', teal: '008080', maroon: '800000', olive: '808000', silver: 'C0C0C0', lime: '00FF00', pink: 'FFC0CB', brown: 'A52A2A', gold: 'FFD700', dkBlue: '00008B', dkGreen: '006400', dkRed: '8B0000' };
const DEFAULT_MAP = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
const clamp = (v) => Math.min(1, Math.max(0, v));
const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const rgbToHex = (rgb) => rgb.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const toLinear = (v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const fromLinear = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return s ? [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)] : [l, l, l];
}

// One colour element (a:srgbClr, a:schemeClr and friends) with its modifiers.
// ph stands in for "phClr" inside theme styles.
function colorOf(el, ctx, ph) {
  const v = at(el, 'val');
  let hex, alpha = 1;
  switch (el.localName) {
    case 'srgbClr': hex = v; break;
    case 'sysClr': hex = at(el, 'lastClr') || (/window$|^btnFace|^menu$/.test(v) ? 'FFFFFF' : '000000'); break;
    case 'prstClr': hex = PRESET[v]; break;
    case 'scrgbClr': hex = rgbToHex(['r', 'g', 'b'].map((k) => fromLinear(num(el, k, 0) / 1e5))); break;
    case 'hslClr': hex = rgbToHex(hslToRgb([num(el, 'hue', 0) / 21600000, num(el, 'sat', 0) / 1e5, num(el, 'lum', 0) / 1e5])); break;
    case 'schemeClr':
      if (v === 'phClr') { if (!ph) return null; hex = ph.color; alpha = ph.alpha ?? 1; }
      else hex = ctx.theme.colors[ctx.map[v] || v];
      break;
    default: return null;
  }
  if (!/^[0-9a-f]{6}$/i.test(hex || '')) hex = '000000';
  let rgb = hexToRgb(hex);
  for (const mod of els(el)) {
    const f = num(mod, 'val', 1e5) / 1e5;
    const hsl = (change) => { const c = rgbToHsl(rgb); change(c); rgb = hslToRgb([c[0], clamp(c[1]), clamp(c[2])]); };
    if (mod.localName === 'alpha') alpha = f;
    else if (mod.localName === 'lumMod') hsl((c) => { c[2] *= f; });
    else if (mod.localName === 'lumOff') hsl((c) => { c[2] += f; });
    else if (mod.localName === 'satMod') hsl((c) => { c[1] *= f; });
    else if (mod.localName === 'tint') rgb = rgb.map((c) => fromLinear(toLinear(c) * f + 1 - f));
    else if (mod.localName === 'shade') rgb = rgb.map((c) => fromLinear(toLinear(c) * f));
  }
  return { color: rgbToHex(rgb), alpha: clamp(alpha) };
}
const firstColor = (parent, ctx, ph) => { for (const c of els(parent)) { const found = colorOf(c, ctx, ph); if (found) return found; } return null; };

// One fill element. null means "no fill", undefined means "not a fill".
function fillOf(el, ctx, ph) {
  switch (el.localName) {
    case 'noFill': return null;
    case 'solidFill': { const c = firstColor(el, ctx, ph); return c ? { type: 'solid', ...c } : undefined; }
    case 'pattFill': { const c = firstColor(kid(el, 'bgClr'), ctx, ph) || firstColor(kid(el, 'fgClr'), ctx, ph); return c ? { type: 'solid', ...c } : undefined; }
    case 'gradFill': {
      const stops = kids(kid(el, 'gsLst'), 'gs').map((gs) => ({ pos: clamp(num(gs, 'pos', 0) / 1e5), ...(firstColor(gs, ctx, ph) || { color: '000000', alpha: 1 }) })).sort((a, b) => a.pos - b.pos);
      if (!stops.length) return undefined;
      // Radial and shaped gradients are drawn as a plain top-to-bottom blend.
      return { type: 'gradient', stops, angle: kid(el, 'lin') ? num(kid(el, 'lin'), 'ang', 0) / 60000 : 90 };
    }
    case 'blipFill': {
      const blip = kid(el, 'blip'), rel = ctx.rels.get(rAttr(blip, 'embed'));
      if (!blip) return undefined;
      const src = kid(el, 'srcRect'), side = (name) => num(src, name, 0) / 1e5;
      if (rel && !rel.external) ctx.media.add(rel.target);
      return { type: 'image', media: rel && !rel.external ? rel.target : null, crop: { l: side('l'), t: side('t'), r: side('r'), b: side('b') }, alpha: num(kid(blip, 'alphaModFix'), 'amt', 1e5) / 1e5 };
    }
    default: return undefined;
  }
}
const readFill = (parent, ctx, ph) => { for (const c of els(parent)) { const fill = fillOf(c, ctx, ph); if (fill !== undefined) return fill; } return undefined; };
// A single colour to stand in for any fill, for text and lines.
const flat = (fill) => !fill ? null : fill.type === 'solid' ? { color: fill.color, alpha: fill.alpha } : fill.type === 'gradient' ? { color: fill.stops[fill.stops.length >> 1].color, alpha: fill.stops[0].alpha } : null;

function readLine(ln, ctx, style) {
  if (!ln) return style || null;
  const fill = readFill(ln, ctx);
  if (fill === null) return null;
  const color = flat(fill) || style;
  if (!color) return null;
  const end = (name) => { const type = at(kid(ln, name), 'type'); return type && type !== 'none' ? type : undefined; };
  return { color: color.color, alpha: color.alpha, width: emu(ln, 'w', style?.width ?? 0.75), dash: at(kid(ln, 'prstDash'), 'val') || style?.dash, head: end('headEnd'), tail: end('tailEnd') };
}

// ---------- the package ----------

const resolvePath = (dir, target) => {
  const parts = target.startsWith('/') ? [] : dir.split('/').filter(Boolean);
  for (const piece of target.split('/')) { if (piece === '..') parts.pop(); else if (piece && piece !== '.') parts.push(piece); }
  return parts.join('/');
};
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf', tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp' };

async function openPackage(bytes) {
  const entries = await readZip(bytes, BIG);
  const docs = new Map();
  const xml = async (path) => {
    if (!docs.has(path)) {
      let root = null;
      if (entries.has(path)) {
        const text = decoder.decode(await unpack(entries.get(path)));
        if (/<!ENTITY/i.test(text)) throw new Error('This file has an unsupported structure.');
        try { root = new DOMParser().parseFromString(text, 'application/xml').documentElement; } catch { root = null; }
        if (root && (root.localName === 'parsererror' || root.getElementsByTagName('parsererror').length)) root = null;
      }
      docs.set(path, root);
    }
    return docs.get(path);
  };
  const rels = async (path) => {
    const cut = path.lastIndexOf('/') + 1, map = new Map();
    for (const r of kids(await xml(path.slice(0, cut) + '_rels/' + path.slice(cut) + '.rels'), 'Relationship')) {
      const external = at(r, 'TargetMode') === 'External', target = at(r, 'Target') || '';
      map.set(at(r, 'Id'), { target: external ? target : resolvePath(path.slice(0, cut), target), type: (at(r, 'Type') || '').split('/').pop(), external });
    }
    return map;
  };
  return { entries, xml, rels };
}

function readTheme(root) {
  const base = kid(root, 'themeElements'), colors = {};
  for (const c of els(kid(base, 'clrScheme'))) { const v = els(c)[0]; colors[c.localName] = at(v, 'lastClr') || at(v, 'val') || '000000'; }
  const font = (which) => at(kid(base, 'fontScheme', which, 'latin'), 'typeface') || 'Calibri';
  const fmt = kid(base, 'fmtScheme');
  return { colors, major: font('majorFont'), minor: font('minorFont'), lines: kids(kid(fmt, 'lnStyleLst'), 'ln'), fills: els(kid(fmt, 'fillStyleLst')), bgFills: els(kid(fmt, 'bgFillStyleLst')) };
}
const NO_THEME = { colors: { dk1: '000000', lt1: 'FFFFFF', dk2: '1F497D', lt2: 'EEECE1', accent1: '4F81BD', accent2: 'C0504D', accent3: '9BBB59', accent4: '8064A2', accent5: '4BACC6', accent6: 'F79646', hlink: '0000FF', folHlink: '800080' }, major: 'Calibri', minor: 'Calibri', lines: [], fills: [], bgFills: [] };

const readXfrm = (x) => x && kid(x, 'off') && kid(x, 'ext') ? {
  x: emu(kid(x, 'off'), 'x', 0), y: emu(kid(x, 'off'), 'y', 0), w: emu(kid(x, 'ext'), 'cx', 0), h: emu(kid(x, 'ext'), 'cy', 0),
  rot: num(x, 'rot', 0) / 60000, flipH: on(at(x, 'flipH')), flipV: on(at(x, 'flipV')),
} : null;

// Children of a group live in the group's own coordinate box (chOff/chExt).
const inGroup = (outer, g, ch) => (r) => {
  const sx = ch.w ? g.w / ch.w : 1, sy = ch.h ? g.h / ch.h : 1;
  const w = r.w * sx, h = r.h * sy, gx = g.x + g.w / 2, gy = g.y + g.h / 2;
  let cx = g.x + (r.x - ch.x) * sx + w / 2, cy = g.y + (r.y - ch.y) * sy + h / 2, { rot, flipH, flipV } = r;
  if (g.flipH) { cx = 2 * gx - cx; flipH = !flipH; rot = -rot; }
  if (g.flipV) { cy = 2 * gy - cy; flipV = !flipV; rot = -rot; }
  if (g.rot) {
    const a = g.rot * Math.PI / 180, dx = cx - gx, dy = cy - gy;
    cx = gx + dx * Math.cos(a) - dy * Math.sin(a); cy = gy + dx * Math.sin(a) + dy * Math.cos(a); rot += g.rot;
  }
  return outer({ x: cx - w / 2, y: cy - h / 2, w, h, rot, flipH, flipV });
};

const phOf = (el) => kid(els(el).find((c) => c.localName.startsWith('nv')), 'nvPr', 'ph');
const placeholders = (root, ctx) => els(kid(root, 'cSld', 'spTree')).map((sp) => ({ sp, ph: phOf(sp), ctx })).filter((p) => p.ph).map((p) => ({ ...p, type: at(p.ph, 'type') || 'obj', idx: at(p.ph, 'idx') }));
const bodyLike = (type) => type === 'ctrTitle' ? 'title' : ['title', 'dt', 'ftr', 'sldNum'].includes(type) ? type : 'body';

// ---------- text ----------

const spacing = (el) => { const pct = kid(el, 'spcPct'), pts = kid(el, 'spcPts'); return pts ? { pts: num(pts, 'val', 0) / 100 } : pct ? { pct: num(pct, 'val', 1e5) / 1e5 } : undefined; };
const roman = (n) => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [v, t]) => { while (n >= v) { s += t; n -= v; } return s; }, '');
const alpha = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
function numberLabel(type, n) {
  const [, kind, tail] = /^(arabic|alphaLc|alphaUc|romanLc|romanUc)(.*)$/.exec(type) || [null, 'arabic', 'Period'];
  const core = kind === 'arabic' ? String(n) : kind === 'alphaLc' ? alpha(n).toLowerCase() : kind === 'alphaUc' ? alpha(n) : kind === 'romanLc' ? roman(n).toLowerCase() : roman(n);
  return tail === 'ParenBoth' ? '(' + core + ')' : tail === 'ParenR' ? core + ')' : tail === 'Plain' ? core : tail === 'Minus' ? core + '-' : core + '.';
}

// lists runs from the most specific list style to the least. A plain object in
// the list (not an element) carries a shape or table style: { color, bold, font }.
function readText(txBody, bodyPrs, lists, ctx, defaults = {}) {
  const bAttr = (name) => { for (const b of bodyPrs) { const v = at(b, name); if (v !== undefined) return v; } };
  const ins = (name, fallback) => { const v = Number(bAttr(name)); return Number.isFinite(v) ? v / PT : fallback; };
  const fitOwner = bodyPrs.find((b) => kid(b, 'normAutofit') || kid(b, 'spAutoFit') || kid(b, 'noAutofit'));
  const norm = kid(fitOwner, 'normAutofit');
  const body = {
    insets: defaults.insets || [ins('lIns', 7.2), ins('tIns', 3.6), ins('rIns', 7.2), ins('bIns', 3.6)],
    anchor: defaults.anchor || bAttr('anchor') || 't', wrap: bAttr('wrap') !== 'none', vert: bAttr('vert') || 'horz',
    fit: norm ? 'shrink' : kid(fitOwner, 'spAutoFit') ? 'resize' : 'none',
    fontScale: num(norm, 'fontScale', 1e5) / 1e5, spacingCut: num(norm, 'lnSpcReduction', 0) / 1e5, paragraphs: [],
  };
  const themeFont = (name) => name === '+mj-lt' ? ctx.theme.major : name === '+mn-lt' ? ctx.theme.minor : name;
  const counters = [];
  for (const p of kids(txBody, 'p')) {
    const pPr = kid(p, 'pPr'), level = Math.min(8, Math.max(0, num(pPr, 'lvl', 0)));
    const inherited = lists.map((l) => {
      if (!l.nodeType) return { style: l };
      const lvl = kid(l, 'lvl' + (level + 1) + 'pPr');
      return { pPr: lvl, rPr: kid(lvl, 'defRPr') };
    });
    const levels = [pPr, ...inherited.map((l) => l.pPr)].filter(Boolean);
    const pAttr = (name) => { for (const l of levels) { const v = at(l, name); if (v !== undefined) return v; } };
    const pKid = (name) => { for (const l of levels) { const k = kid(l, name); if (k) return k; } return null; };
    const style = (rPr) => {
      const chain = [rPr, ...inherited.map((l) => l.rPr || l.style)].filter(Boolean);
      const get = (name) => { for (const c of chain) { const v = c.nodeType ? at(c, name) : undefined; if (v !== undefined) return v; } };
      let color, bold, font;
      for (const c of chain) {
        if (!c.nodeType) { color ||= c.color; bold ??= c.bold; font ||= c.font; continue; }
        if (!color) { const fill = readFill(c, ctx); if (fill) color = flat(fill); }
        bold ??= at(c, 'b') === undefined ? undefined : on(at(c, 'b'));
        font ||= at(kid(c, 'latin'), 'typeface');
      }
      color ||= { color: ctx.theme.colors[ctx.map.tx1 || 'dk1'] || '000000', alpha: 1 };
      font = themeFont(font || '+mn-lt');
      const link = kid(rPr, 'hlinkClick'), rel = link && ctx.rels.get(rAttr(link, 'id'));
      if (link) color = { color: ctx.theme.colors.hlink || '0000FF', alpha: 1 };
      const out = { size: num({ getAttribute: get }, 'sz', 1800) / 100, bold: !!bold, italic: on(get('i')), underline: !!link || (get('u') || 'none') !== 'none', strike: (get('strike') || 'noStrike') !== 'noStrike', color: color.color, font, mono: /mono|courier|consolas|menlo/i.test(font) };
      if (color.alpha < 1) out.alpha = color.alpha;
      if (rel?.external) out.link = rel.target;
      if (num({ getAttribute: get }, 'baseline', 0)) out.baseline = num({ getAttribute: get }, 'baseline', 0) / 1e5;
      if (get('cap') === 'all') out.caps = true;
      return out;
    };
    const runs = [];
    for (const r of els(p)) {
      if (r.localName === 'r' || r.localName === 'fld') {
        const st = style(kid(r, 'rPr'));
        let text = kids(r, 't').map((t) => t.textContent).join('');
        if (st.caps) text = text.toUpperCase();
        delete st.caps;
        // A vertical tab inside a run is PowerPoint's soft line break.
        for (const [i, piece] of text.split(/[\n\v]/).entries()) { if (i) runs.push({ br: true, ...st }); if (piece) runs.push({ text: piece, ...st }); }
      } else if (r.localName === 'br') { const st = style(kid(r, 'rPr')); delete st.caps; runs.push({ br: true, ...st }); }
    }
    const end = style(kid(p, 'endParaRPr'));
    let bullet = null;
    scan: for (const l of levels) for (const c of els(l)) {
      if (c.localName === 'buNone') break scan;
      if (c.localName === 'buChar' || c.localName === 'buBlip') { bullet = { text: at(c, 'char') || '•' }; break scan; }
      if (c.localName === 'buAutoNum') { bullet = { auto: at(c, 'type') || 'arabicPeriod', start: num(c, 'startAt', 1) }; break scan; }
    }
    if (!runs.some((r) => r.text)) bullet = null;
    counters.length = Math.min(counters.length, level + 1);
    if (bullet?.auto) {
      const prev = counters[level];
      counters[level] = { type: bullet.auto, n: prev?.type === bullet.auto ? prev.n + 1 : bullet.start };
      bullet = { text: numberLabel(bullet.auto, counters[level].n) };
    } else if (runs.some((r) => r.text)) counters[level] = null;
    if (bullet) {
      const clr = pKid('buClr'), font = at(pKid('buFont'), 'typeface');
      if (clr) bullet.color = firstColor(clr, ctx)?.color;
      if (pKid('buSzPct')) bullet.scale = num(pKid('buSzPct'), 'val', 1e5) / 1e5;
      if (pKid('buSzPts')) bullet.size = num(pKid('buSzPts'), 'val', 1800) / 100;
      if (font && !font.startsWith('+')) bullet.font = font;
    }
    body.paragraphs.push({
      align: pAttr('algn') || 'l', level, marL: (Number(pAttr('marL')) || 0) / PT, indent: (Number(pAttr('indent')) || 0) / PT,
      lineSpacing: spacing(pKid('lnSpc')) || { pct: 1 }, before: spacing(pKid('spcBef')) || { pts: 0 }, after: spacing(pKid('spcAft')) || { pts: 0 },
      bullet, runs, size: end.size,
    });
  }
  return body.paragraphs.some((p) => p.runs.some((r) => r.text)) ? body : null;
}

// ---------- shapes ----------

// Arc as cubic curves. Angles in radians, measured the way slides do (y down).
function arcCurves(cx, cy, rx, ry, start, sweep) {
  const out = [], n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9)), step = sweep / n, k = 4 / 3 * Math.tan(step / 4);
  for (let i = 0; i < n; i++) {
    const a = start + i * step, b = a + step;
    out.push(['C', cx + rx * (Math.cos(a) - k * Math.sin(a)), cy + ry * (Math.sin(a) + k * Math.cos(a)), cx + rx * (Math.cos(b) + k * Math.sin(b)), cy + ry * (Math.sin(b) - k * Math.cos(b)), cx + rx * Math.cos(b), cy + ry * Math.sin(b)]);
  }
  return out;
}

// Custom geometry, stored as fractions of the shape's box so it scales with it.
function readCustom(geom, ext) {
  const paths = [];
  for (const path of kids(kid(geom, 'pathLst'), 'path')) {
    const pw = num(path, 'w', 0) || ext.w * PT || 1, ph = num(path, 'h', 0) || ext.h * PT || 1;
    const cmds = [];
    let x = 0, y = 0;
    const pts = (c) => kids(c, 'pt').map((p) => [num(p, 'x', 0), num(p, 'y', 0)]);
    const put = (op, ...xy) => { cmds.push([op, ...xy.map((v, i) => v / (i % 2 ? ph : pw))]); if (xy.length) [x, y] = xy.slice(-2); };
    for (const c of els(path)) {
      const p = pts(c);
      if (c.localName === 'moveTo' && p[0]) put('M', ...p[0]);
      else if (c.localName === 'lnTo' && p[0]) put('L', ...p[0]);
      else if (c.localName === 'cubicBezTo' && p.length === 3) put('C', ...p.flat());
      else if (c.localName === 'quadBezTo' && p.length === 2) put('C', x + 2 / 3 * (p[0][0] - x), y + 2 / 3 * (p[0][1] - y), p[1][0] + 2 / 3 * (p[0][0] - p[1][0]), p[1][1] + 2 / 3 * (p[0][1] - p[1][1]), ...p[1]);
      else if (c.localName === 'arcTo') {
        const wR = num(c, 'wR', 0), hR = num(c, 'hR', 0), st = num(c, 'stAng', 0) * Math.PI / 108e5, sw = num(c, 'swAng', 0) * Math.PI / 108e5;
        for (const curve of arcCurves(x - wR * Math.cos(st), y - hR * Math.sin(st), wR, hR, st, sw)) put(...curve);
      } else if (c.localName === 'close') put('Z');
    }
    if (cmds.length) paths.push({ cmds, fill: at(path, 'fill') !== 'none', stroke: at(path, 'stroke') !== '0' && at(path, 'stroke') !== 'false' });
  }
  return paths;
}

// Table style "Medium Style 2", the one PowerPoint and python-pptx use when
// nothing else is chosen. Files don't carry built-in styles, only their ids.
const MEDIUM_2 = { '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': 'accent1', '{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}': 'accent2', '{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}': 'accent3', '{00A15C55-8517-42AA-B614-E9B94910E393}': 'accent4', '{7DF18680-E054-41AD-8BC1-D1AEF772440D}': 'accent5', '{93296810-A885-4BE3-A3E7-6D5BEEA58F35}': 'accent6' };
const GRID_STYLE = '{5940675A-B579-460E-94D1-54222C63F5DA}';
function builtinTableStyle(id, ctx) {
  const scheme = (name) => ctx.theme.colors[ctx.map[name] || name] || '000000';
  const edge = (color, width) => ({ color, alpha: 1, width });
  if (MEDIUM_2[id]) {
    const accent = scheme(MEDIUM_2[id]), light = scheme('lt1'), white = edge(light, 1);
    const tint = (f) => ({ type: 'solid', color: rgbToHex(hexToRgb(accent).map((c) => fromLinear(toLinear(c) * f + 1 - f))), alpha: 1 });
    const strong = { bold: true, color: { color: light, alpha: 1 }, fill: { type: 'solid', color: accent, alpha: 1 } };
    return {
      wholeTbl: { color: { color: scheme('dk1'), alpha: 1 }, fill: tint(0.2), borders: { left: white, right: white, top: white, bottom: white, insideH: white, insideV: white } },
      band1H: { fill: tint(0.4) }, band1V: { fill: tint(0.4) },
      firstRow: { ...strong, borders: { bottom: edge(light, 3) } }, lastRow: { ...strong, borders: { top: edge(light, 3) } }, firstCol: strong, lastCol: strong,
    };
  }
  if (id === GRID_STYLE) { const line = edge(scheme('tx1'), 1); return { wholeTbl: { borders: { left: line, right: line, top: line, bottom: line, insideH: line, insideV: line } } }; }
  return null;
}
function readTableStyle(el, ctx) {
  const style = {};
  for (const part of els(el)) {
    const tx = kid(part, 'tcTxStyle'), tc = kid(part, 'tcStyle'), out = {};
    if (tx) { if (at(tx, 'b')) out.bold = on(at(tx, 'b')); const c = firstColor(tx, ctx) || firstColor(kid(tx, 'fontRef'), ctx); if (c) out.color = c; }
    const fill = readFill(kid(tc, 'fill'), ctx);
    if (fill !== undefined) out.fill = fill;
    for (const side of els(kid(tc, 'tcBdr'))) (out.borders ||= {})[side.localName] = readLine(kid(side, 'ln'), ctx);
    style[part.localName] = out;
  }
  return style;
}

async function loadDeck(bytes) {
  const pkg = await openPackage(bytes);
  const root = Array.from((await pkg.rels('')).values()).find((r) => r.type === 'officeDocument')?.target || 'ppt/presentation.xml';
  const presentation = await pkg.xml(root);
  if (!presentation || presentation.localName !== 'presentation') unreadable();
  const presRels = await pkg.rels(root);
  const size = kid(presentation, 'sldSz');
  const deck = { width: emu(size, 'cx', 720), height: emu(size, 'cy', 540), slides: [], media: new Map() };
  const media = new Set();
  const defaultText = kid(presentation, 'defaultTextStyle');
  const stylesPath = Array.from(presRels.values()).find((r) => r.type === 'tableStyles')?.target;
  const tableStyles = new Map(kids(stylesPath && await pkg.xml(stylesPath), 'tblStyle').map((s) => [at(s, 'styleId'), s]));

  for (const entry of kids(kid(presentation, 'sldIdLst'), 'sldId')) {
    const path = presRels.get(rAttr(entry, 'id'))?.target, slide = path && await pkg.xml(path);
    if (!slide || at(slide, 'show') === '0' || at(slide, 'show') === 'false') continue;
    const slideRels = await pkg.rels(path);
    const partOf = async (rels, type) => { const p = Array.from(rels.values()).find((r) => r.type === type)?.target; return p ? { path: p, root: await pkg.xml(p), rels: await pkg.rels(p) } : { rels: new Map() }; };
    const layout = await partOf(slideRels, 'slideLayout'), master = await partOf(layout.rels, 'slideMaster'), themePart = await partOf(master.rels, 'theme');
    const theme = themePart.root ? readTheme(themePart.root) : NO_THEME;
    const override = [slide, layout.root].map((r) => kid(r, 'clrMapOvr', 'overrideClrMapping')).find(Boolean) || kid(master.root, 'clrMap');
    const map = override ? Object.fromEntries(Array.from(override.attributes).map((a) => [a.localName, a.value])) : DEFAULT_MAP;
    const base = { theme, map, media };
    const ctxs = { slide: { ...base, rels: slideRels }, layout: { ...base, rels: layout.rels }, master: { ...base, rels: master.rels } };
    const drawings = [];
    for (const r of slideRels.values()) if (r.type === 'diagramDrawing') drawings.push({ path: r.target, root: await pkg.xml(r.target), ctx: { ...base, rels: await pkg.rels(r.target) } });
    const env = { ctxs, layoutPhs: placeholders(layout.root, ctxs.layout), masterPhs: placeholders(master.root, ctxs.master), txStyles: kid(master.root, 'txStyles'), defaultText, tableStyles, drawings };

    let background = { type: 'solid', color: 'FFFFFF', alpha: 1 };
    for (const [part, ctx] of [[slide, ctxs.slide], [layout.root, ctxs.layout], [master.root, ctxs.master]]) {
      const bg = kid(part, 'cSld', 'bg'), ref = kid(bg, 'bgRef');
      if (!bg) continue;
      let fill = readFill(kid(bg, 'bgPr'), ctx);
      if (ref) { const ph = firstColor(ref, ctx), themed = theme.bgFills[num(ref, 'idx', 0) - 1001]; fill = (themed && fillOf(themed, { ...ctx, rels: themePart.rels }, ph)) || (ph && { type: 'solid', ...ph }); }
      if (fill) { background = fill; break; }
    }
    const items = [], same = (r) => r, shown = (r) => at(r, 'showMasterSp') !== '0' && at(r, 'showMasterSp') !== 'false';
    if (shown(slide)) {
      if (shown(layout.root)) walk(kid(master.root, 'cSld', 'spTree'), { ...env, ctx: ctxs.master, level: 'master' }, same, items);
      walk(kid(layout.root, 'cSld', 'spTree'), { ...env, ctx: ctxs.layout, level: 'layout' }, same, items);
    }
    walk(kid(slide, 'cSld', 'spTree'), { ...env, ctx: ctxs.slide, level: 'slide' }, same, items);
    deck.slides.push({ background, items });
  }
  for (const path of media) {
    if (!pkg.entries.has(path)) continue;
    deck.media.set(path, { bytes: await unpack(pkg.entries.get(path)), mime: MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream' });
  }
  return deck;
}

function walk(tree, env, xf, out) {
  for (const el of els(tree)) {
    if (at(kid(els(el).find((c) => c.localName.startsWith('nv')), 'cNvPr'), 'hidden') === '1') continue;
    if (el.localName === 'sp' || el.localName === 'cxnSp') shape(el, env, xf, out);
    else if (el.localName === 'pic') picture(el, env, xf, out);
    else if (el.localName === 'graphicFrame') frame(el, env, xf, out);
    else if (el.localName === 'grpSp') {
      const x = kid(el, 'grpSpPr', 'xfrm'), g = readXfrm(x);
      if (!g) { walk(el, env, xf, out); continue; }
      const ch = { x: emu(kid(x, 'chOff'), 'x', g.x), y: emu(kid(x, 'chOff'), 'y', g.y), w: emu(kid(x, 'chExt'), 'cx', g.w), h: emu(kid(x, 'chExt'), 'cy', g.h) };
      walk(el, env, inGroup(xf, g, ch), out);
    } else if (el.localName === 'AlternateContent') walk(kid(el, 'Fallback') || kid(el, 'Choice'), env, xf, out);
  }
}

// A slide placeholder borrows what it doesn't say itself from the layout's
// matching placeholder, and that one from the master's.
function inherit(el, env) {
  const ph = phOf(el);
  if (!ph) return { chain: [] };
  if (env.level !== 'slide') return { skip: true };
  const type = at(ph, 'type') || 'obj', idx = at(ph, 'idx');
  const inLayout = (idx !== undefined && env.layoutPhs.find((p) => p.idx === idx)) || env.layoutPhs.find((p) => p.type === type) || env.layoutPhs.find((p) => bodyLike(p.type) === bodyLike(type) && bodyLike(type) !== 'body');
  const kind = bodyLike(inLayout?.type || type);
  const inMaster = env.masterPhs.find((p) => p.type === (inLayout?.type || type)) || env.masterPhs.find((p) => bodyLike(p.type) === kind);
  return { chain: [inLayout, inMaster].filter(Boolean), kind };
}

// Everything a text frame can inherit from, most specific first.
function textLists(el, env, chain, kind, styleText) {
  const lists = [kid(el, 'txBody', 'lstStyle'), ...chain.map((c) => kid(c.sp, 'txBody', 'lstStyle'))];
  if (styleText) lists.push(styleText);
  if (kind) lists.push(kid(env.txStyles, kind === 'title' ? 'titleStyle' : kind === 'body' ? 'bodyStyle' : 'otherStyle'));
  // Placeholders take the master's text styles; the deck-wide default is for plain text boxes.
  else lists.push(env.defaultText, kid(env.txStyles, 'otherStyle'));
  return lists.filter(Boolean);
}

function shape(el, env, xf, out) {
  const { chain, kind, skip } = inherit(el, env);
  if (skip) return;
  const ctx = env.ctx, sources = [{ pr: kid(el, 'spPr'), ctx }, ...chain.map((c) => ({ pr: kid(c.sp, 'spPr'), ctx: c.ctx }))];
  const raw = readXfrm(sources.map((s) => kid(s.pr, 'xfrm')).find(Boolean));
  if (!raw) return;
  const item = { type: 'shape', ...xf(raw), geom: 'rect' };
  const geomOwner = sources.find((s) => kid(s.pr, 'prstGeom') || kid(s.pr, 'custGeom'))?.pr;
  if (kid(geomOwner, 'custGeom')) { item.geom = 'custom'; item.paths = readCustom(kid(geomOwner, 'custGeom'), raw); }
  else if (geomOwner) {
    item.geom = at(kid(geomOwner, 'prstGeom'), 'prst') || 'rect';
    const adj = Object.fromEntries(kids(kid(geomOwner, 'prstGeom', 'avLst'), 'gd').map((g) => [at(g, 'name'), Number(/-?\d+/.exec(at(g, 'fmla') || '')?.[0])]));
    if (Object.keys(adj).length) item.adj = adj;
  }
  const style = kid(el, 'style'), ref = (name) => { const r = kid(style, name); return r && num(r, 'idx', 0) > 0 && num(r, 'idx', 0) !== 1000 ? firstColor(r, ctx) : null; };
  let fill;
  for (const s of sources) { fill = readFill(s.pr, s.ctx); if (fill !== undefined) break; }
  if (fill === undefined) { const c = ref('fillRef'), themed = c && ctx.theme.fills[num(kid(style, 'fillRef'), 'idx', 0) - 1]; fill = c ? (themed && fillOf(themed, ctx, c)) || { type: 'solid', ...c } : null; }
  const lnRef = ref('lnRef'), themeLn = lnRef && ctx.theme.lines[num(kid(style, 'lnRef'), 'idx', 1) - 1];
  const lnOwner = sources.find((s) => kid(s.pr, 'ln'));
  item.fill = el.localName === 'cxnSp' ? null : fill;
  item.line = readLine(kid(lnOwner?.pr, 'ln'), lnOwner?.ctx || ctx, lnRef && { ...lnRef, width: emu(themeLn, 'w', 0.75), dash: at(kid(themeLn, 'prstDash'), 'val') });
  if (item.line?.dash === 'solid') delete item.line.dash;
  const ph = phOf(el);
  if (ph) item.placeholder = { type: at(ph, 'type') || 'obj', ...(at(ph, 'idx') !== undefined && { idx: Number(at(ph, 'idx')) }) };
  const txBody = kid(el, 'txBody');
  if (txBody) {
    const fontRef = kid(style, 'fontRef'), fontColor = fontRef && firstColor(fontRef, ctx);
    const styleText = fontRef && { color: fontColor, font: at(fontRef, 'idx') === 'major' ? '+mj-lt' : '+mn-lt' };
    item.text = readText(txBody, [kid(txBody, 'bodyPr'), ...chain.map((c) => kid(c.sp, 'txBody', 'bodyPr'))].filter(Boolean), textLists(el, env, chain, kind, styleText), ctx);
  }
  if (item.fill || item.line || item.text) out.push(item);
}

function picture(el, env, xf, out, box) {
  const { chain, skip } = inherit(el, env);
  if (skip) return;
  const pr = kid(el, 'spPr'), raw = box || readXfrm([pr, ...chain.map((c) => kid(c.sp, 'spPr'))].map((p) => kid(p, 'xfrm')).find(Boolean));
  const image = kid(el, 'blipFill') && fillOf(kid(el, 'blipFill'), env.ctx);
  if (!raw || !image) return;
  const item = { type: 'picture', ...(box ? raw : xf(raw)), media: image.media, crop: image.crop, alpha: image.alpha, geom: at(kid(pr, 'prstGeom'), 'prst') || 'rect', line: readLine(kid(pr, 'ln'), env.ctx) };
  out.push(item);
}

function frame(el, env, xf, out) {
  const { chain, skip } = inherit(el, env);
  if (skip) return;
  const raw = readXfrm([kid(el, 'xfrm'), ...chain.map((c) => kid(c.sp, 'spPr', 'xfrm'))].find(Boolean));
  if (!raw) return;
  const box = xf(raw), data = kid(el, 'graphic', 'graphicData'), uri = at(data, 'uri') || '';
  if (kid(data, 'tbl')) { out.push(table(kid(data, 'tbl'), box, env)); return; }
  // Charts and embedded objects often carry a picture of themselves.
  const pic = deep(el, 'Fallback').flatMap((f) => deep(f, 'pic'))[0] || deep(el, 'pic')[0];
  if (pic && kid(pic, 'blipFill')) { picture(pic, { ...env, level: 'slide' }, xf, out, box); return; }
  if (uri.includes('diagram')) {
    const dm = env.ctx.rels.get(rAttr(kid(data, 'relIds'), 'dm'))?.target, n = /(\d+)\.xml$/.exec(dm || '')?.[1];
    const drawing = env.drawings.find((d) => /(\d+)\.xml$/.exec(d.path)?.[1] === n) || (env.drawings.length === 1 ? env.drawings[0] : null);
    const tree = kid(drawing?.root, 'spTree');
    if (tree) { walk(tree, { ...env, ctx: drawing.ctx, level: 'drawing' }, (r) => xf({ ...r, x: r.x + raw.x, y: r.y + raw.y }), out); return; }
  }
  out.push({ type: 'frame', ...box, label: uri.includes('chart') ? 'Chart' : uri.includes('diagram') ? 'Diagram' : 'Object' });
}

function table(tbl, box, env) {
  const ctx = env.ctx, pr = kid(tbl, 'tblPr'), id = kid(pr, 'tableStyleId')?.textContent.trim();
  const style = (env.tableStyles.has(id) ? readTableStyle(env.tableStyles.get(id), ctx) : builtinTableStyle(id, ctx)) || {};
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => emu(c, 'w', 0)), trs = kids(tbl, 'tr');
  const flag = (name) => on(at(pr, name));
  const rows = trs.map((tr, r) => {
    // PowerPoint keeps a covered cell for every grid column a merged cell
    // spans. Files that leave those out are counted by span instead.
    const cells = [], tcs = kids(tr, 'tc'), dense = tcs.length >= cols.length;
    let col = 0;
    for (const tc of tcs) {
      const span = num(tc, 'gridSpan', 1), rowSpan = num(tc, 'rowSpan', 1), tcPr = kid(tc, 'tcPr');
      const lastC = col + span >= cols.length, lastR = r + rowSpan >= trs.length;
      // Later entries win: whole table, bands, then the special rows and columns.
      const band = (r - (flag('firstRow') ? 1 : 0)) % 2 === 0, bandV = (col - (flag('firstCol') ? 1 : 0)) % 2 === 0;
      const parts = [style.wholeTbl, flag('bandRow') && (band ? style.band1H : style.band2H), flag('bandCol') && (bandV ? style.band1V : style.band2V),
        flag('lastCol') && lastC && style.lastCol, flag('firstCol') && col === 0 && style.firstCol, flag('lastRow') && lastR && style.lastRow, flag('firstRow') && r === 0 && style.firstRow].filter(Boolean).reverse();
      const pick = (key) => parts.find((p) => p[key] !== undefined)?.[key];
      const own = readFill(tcPr, ctx);
      const edge = (ln, outer, inner, atEdge) => {
        if (kid(tcPr, ln)) return readLine(kid(tcPr, ln), ctx);
        for (const p of parts) { const b = p.borders; if (b && b[outer] !== undefined && (atEdge || p !== style.wholeTbl)) return b[outer]; if (b && !atEdge && b[inner] !== undefined) return b[inner]; }
        return null;
      };
      const cell = {
        col, span, rowSpan, merged: on(at(tc, 'hMerge')) || on(at(tc, 'vMerge')), fill: own !== undefined ? own : pick('fill') || null,
        borders: { l: edge('lnL', 'left', 'insideV', col === 0), r: edge('lnR', 'right', 'insideV', lastC), t: edge('lnT', 'top', 'insideH', r === 0), b: edge('lnB', 'bottom', 'insideH', lastR) },
      };
      const txBody = kid(tc, 'txBody'), styleText = { color: pick('color'), bold: pick('bold') };
      cell.text = cell.merged || !txBody ? null : readText(txBody, [kid(txBody, 'bodyPr')].filter(Boolean), [kid(txBody, 'lstStyle'), styleText, env.defaultText].filter(Boolean), ctx,
        { insets: [emu(tcPr, 'marL', 7.2), emu(tcPr, 'marT', 3.6), emu(tcPr, 'marR', 7.2), emu(tcPr, 'marB', 3.6)], anchor: at(tcPr, 'anchor') || 't' });
      cells.push(cell);
      col += dense ? 1 : span;
    }
    return { h: emu(tr, 'h', 0), cells };
  });
  return { type: 'table', ...box, cols, rows };
}

export async function parsePptx(bytes) {
  return loadDeck(bytes);
}

// ---------- outlines ----------

const poly = (...p) => [['M', p[0], p[1]], ...Array.from({ length: p.length / 2 - 1 }, (_, i) => ['L', p[2 * i + 2], p[2 * i + 3]]), ['Z']];
const whole = (cmds, extra) => [{ cmds, fill: true, stroke: true, ...extra }];
const ALIAS = { flowChartProcess: 'rect', flowChartDecision: 'diamond', flowChartConnector: 'ellipse', flowChartAlternateProcess: 'roundRect', wedgeRoundRectCallout: 'roundRect', wedgeEllipseCallout: 'ellipse', straightConnector1: 'line', flowChartPreparation: 'hexagon', flowChartInputOutput: 'parallelogram', flowChartMerge: 'flipTriangle', actionButtonBlank: 'rect', snip2SameRect: 'rect', flowChartExtract: 'triangle', flowChartOffpageConnector: 'homePlate', frame: 'rect', bevel: 'rect', flowChartTerminator: 'pill' };

// The outline of a preset or custom shape in its own box, y down. Returns
// null for a preset this file doesn't know.
function outline(item) {
  const { w, h } = item, ss = Math.min(w, h), geom = ALIAS[item.geom] || item.geom;
  const adj = (name, fallback, max = 1e5) => Math.min(max, Math.max(0, item.adj?.[name] ?? fallback)) / 1e5;
  switch (geom) {
    case 'rect': return whole(poly(0, 0, w, 0, w, h, 0, h));
    case 'custom': return item.paths.map((p) => ({ ...p, cmds: p.cmds.map(([op, ...xy]) => [op, ...xy.map((v, i) => v * (i % 2 ? h : w))]) }));
    case 'ellipse': return whole([['M', w, h / 2], ...arcCurves(w / 2, h / 2, w / 2, h / 2, 0, 2 * Math.PI), ['Z']]);
    case 'pill': case 'roundRect': {
      const r = geom === 'pill' ? ss / 2 : ss * adj('adj', 16667, 5e4), q = Math.PI / 2;
      return whole([['M', r, 0], ['L', w - r, 0], ...arcCurves(w - r, r, r, r, -q, q), ['L', w, h - r], ...arcCurves(w - r, h - r, r, r, 0, q), ['L', r, h], ...arcCurves(r, h - r, r, r, q, q), ['L', 0, r], ...arcCurves(r, r, r, r, 2 * q, q), ['Z']]);
    }
    case 'wedgeRectCallout': {
      // A box with a pointer; the pointer leaves from the side its tip is nearest to.
      const tx = w / 2 + w * (item.adj?.adj1 ?? -20833) / 1e5, ty = h / 2 + h * (item.adj?.adj2 ?? 62500) / 1e5, a = tx < w / 2 ? 2 : 7, b = ty < h / 2 ? 2 : 7;
      const tail = ty > h ? [w * (a + 3) / 12, h, tx, ty, w * a / 12, h] : ty < 0 ? [w * a / 12, 0, tx, ty, w * (a + 3) / 12, 0] : tx < 0 ? [0, h * (b + 3) / 12, tx, ty, 0, h * b / 12] : tx > w ? [w, h * b / 12, tx, ty, w, h * (b + 3) / 12] : [];
      return whole(poly(0, 0, ...(ty < 0 ? tail : []), w, 0, ...(tx > w ? tail : []), w, h, ...(ty > h ? tail : []), 0, h, ...(tx < 0 && ty >= 0 && ty <= h ? tail : [])));
    }
    case 'line': return [{ cmds: [['M', 0, 0], ['L', w, h]], fill: false, stroke: true }];
    case 'bentConnector2': return [{ cmds: [['M', 0, 0], ['L', w, 0], ['L', w, h]], fill: false, stroke: true }];
    case 'bentConnector3': case 'bentConnector4': case 'bentConnector5': { const a = w * (item.adj?.adj1 ?? 5e4) / 1e5; return [{ cmds: [['M', 0, 0], ['L', a, 0], ['L', a, h], ['L', w, h]], fill: false, stroke: true }]; }
    case 'curvedConnector2': case 'curvedConnector3': case 'curvedConnector4': case 'curvedConnector5': { const a = w * (item.adj?.adj1 ?? 5e4) / 1e5; return [{ cmds: [['M', 0, 0], ['C', a, 0, a, h, w, h]], fill: false, stroke: true }]; }
    case 'triangle': return whole(poly(w * adj('adj', 5e4), 0, w, h, 0, h));
    case 'flipTriangle': return whole(poly(0, 0, w, 0, w / 2, h));
    case 'rtTriangle': return whole(poly(0, 0, w, h, 0, h));
    case 'diamond': return whole(poly(w / 2, 0, w, h / 2, w / 2, h, 0, h / 2));
    case 'parallelogram': { const a = Math.min(w, ss * adj('adj', 25e3, 1e7)); return whole(poly(a, 0, w, 0, w - a, h, 0, h)); }
    case 'trapezoid': { const a = Math.min(w / 2, ss * adj('adj', 25e3, 1e7)); return whole(poly(a, 0, w - a, 0, w, h, 0, h)); }
    case 'hexagon': { const a = Math.min(w / 2, ss * adj('adj', 25e3, 1e7)); return whole(poly(a, 0, w - a, 0, w, h / 2, w - a, h, a, h, 0, h / 2)); }
    case 'octagon': { const a = ss * adj('adj', 29289, 5e4); return whole(poly(a, 0, w - a, 0, w, a, w, h - a, w - a, h, a, h, 0, h - a, 0, a)); }
    case 'pentagon': return whole(poly(w / 2, 0, w, h * 0.382, w * 0.809, h, w * 0.191, h, 0, h * 0.382));
    case 'homePlate': { const a = Math.min(w, ss * adj('adj', 5e4, 1e7)); return whole(poly(0, 0, w - a, 0, w, h / 2, w - a, h, 0, h)); }
    case 'chevron': { const a = Math.min(w, ss * adj('adj', 5e4, 1e7)); return whole(poly(0, 0, w - a, 0, w, h / 2, w - a, h, 0, h, a, h / 2)); }
    case 'rightArrow': case 'leftArrow': {
      const t = h * adj('adj1', 5e4) / 2, a = Math.min(w, ss * adj('adj2', 5e4, 1e7)), m = (x) => geom === 'leftArrow' ? w - x : x;
      return whole(poly(m(0), h / 2 - t, m(w - a), h / 2 - t, m(w - a), 0, m(w), h / 2, m(w - a), h, m(w - a), h / 2 + t, m(0), h / 2 + t));
    }
    case 'downArrow': case 'upArrow': {
      const t = w * adj('adj1', 5e4) / 2, a = Math.min(h, ss * adj('adj2', 5e4, 1e7)), m = (y) => geom === 'upArrow' ? h - y : y;
      return whole(poly(w / 2 - t, m(0), w / 2 - t, m(h - a), 0, m(h - a), w / 2, m(h), w, m(h - a), w / 2 + t, m(h - a), w / 2 + t, m(0)));
    }
    case 'leftRightArrow': {
      const t = h * adj('adj1', 5e4) / 2, a = Math.min(w / 2, ss * adj('adj2', 5e4, 1e7));
      return whole(poly(0, h / 2, a, 0, a, h / 2 - t, w - a, h / 2 - t, w - a, 0, w, h / 2, w - a, h, w - a, h / 2 + t, a, h / 2 + t, a, h));
    }
    case 'plus': case 'mathPlus': { const a = ss * adj('adj', 25e3, 5e4); return whole(poly(a, 0, w - a, 0, w - a, a, w, a, w, h - a, w - a, h - a, w - a, h, a, h, a, h - a, 0, h - a, 0, a, a, a)); }
    case 'star5': {
      const pts = [];
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.382 : 1, a = -Math.PI / 2 + i * Math.PI / 5; pts.push(w / 2 + w / 2 * 1.0515 * r * Math.cos(a), h * 0.5528 + h / 2 * 1.1056 * r * Math.sin(a)); }
      return whole(poly(...pts));
    }
    case 'donut': {
      const d = Math.min(ss * adj('adj', 25e3, 5e4), w / 2 - 0.1, h / 2 - 0.1);
      return whole([['M', w, h / 2], ...arcCurves(w / 2, h / 2, w / 2, h / 2, 0, 2 * Math.PI), ['Z'], ['M', w - d, h / 2], ...arcCurves(w / 2, h / 2, w / 2 - d, h / 2 - d, 0, -2 * Math.PI), ['Z']]);
    }
    case 'pie': case 'arc': case 'chord': {
      // Angles are 60000ths of a degree, clockwise from three o'clock.
      const pie = geom !== 'arc', from = (item.adj?.adj1 ?? (pie ? 0 : 162e5)) / 6e4 * Math.PI / 180, to = (item.adj?.adj2 ?? (pie ? 162e5 : 0)) / 6e4 * Math.PI / 180;
      const sweep = ((to - from) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
      const curve = [['M', w / 2 + w / 2 * Math.cos(from), h / 2 + h / 2 * Math.sin(from)], ...arcCurves(w / 2, h / 2, w / 2, h / 2, from, sweep)];
      if (geom === 'arc') return [{ cmds: curve, fill: false, stroke: true }];
      return whole([...curve, ...(geom === 'pie' ? [['L', w / 2, h / 2]] : []), ['Z']]);
    }
    case 'round1Rect': case 'round2SameRect': case 'round2DiagRect': case 'snip1Rect': {
      // Corner sizes clockwise from top left: [top left, top right, bottom right, bottom left].
      const a = ss * adj(geom === 'round1Rect' || geom === 'snip1Rect' ? 'adj' : 'adj1', 16667, 5e4), b = ss * adj('adj2', 0, 5e4);
      if (geom === 'snip1Rect') return whole(poly(0, 0, w - a, 0, w, a, w, h, 0, h));
      const [tl, tr, br, bl] = geom === 'round1Rect' ? [0, a, 0, 0] : geom === 'round2SameRect' ? [a, a, b, b] : [a, b, a, b];
      const q = Math.PI / 2;
      return whole([['M', tl, 0], ['L', w - tr, 0], ...(tr ? arcCurves(w - tr, tr, tr, tr, -q, q) : []), ['L', w, h - br], ...(br ? arcCurves(w - br, h - br, br, br, 0, q) : []), ['L', bl, h], ...(bl ? arcCurves(bl, h - bl, bl, bl, q, q) : []), ['L', 0, tl], ...(tl ? arcCurves(tl, tl, tl, tl, 2 * q, q) : []), ['Z']]);
    }
    default: return null;
  }
}

// Where text sits inside a shape, before the body insets. Close to what
// PowerPoint uses, not exact.
function textRect(item) {
  const { w, h } = item, ss = Math.min(w, h), geom = ALIAS[item.geom] || item.geom;
  const adj = (name, fallback) => Math.max(0, item.adj?.[name] ?? fallback) / 1e5, box = (l, t, r, b) => ({ x: l, y: t, w: Math.max(1, r - l), h: Math.max(1, b - t) });
  const a = Math.min(w, ss * adj('adj', geom === 'chevron' || geom === 'homePlate' ? 0.5e5 : 25e3)), head = Math.min(geom === 'upArrow' || geom === 'downArrow' ? h : w, ss * adj('adj2', 5e4));
  switch (geom) {
    case 'ellipse': return box(w * 0.1464, h * 0.1464, w * 0.8536, h * 0.8536);
    case 'roundRect': { const d = ss * Math.min(0.5, adj('adj', 16667)) * 0.2929; return box(d, d, w - d, h - d); }
    case 'diamond': return box(w / 4, h / 4, w * 3 / 4, h * 3 / 4);
    case 'triangle': return box(w * adj('adj', 5e4) / 2, h / 2, w * adj('adj', 5e4) / 2 + w / 2, h);
    case 'rtTriangle': return box(w / 12, h * 7 / 12, w * 7 / 12, h * 11 / 12);
    case 'parallelogram': case 'hexagon': case 'trapezoid': return box(a * 0.6, h * 0.1, w - a * 0.6, h * 0.9);
    case 'octagon': { const d = ss * adj('adj', 29289) * 0.2929; return box(d, d, w - d, h - d); }
    case 'chevron': return box(a * 0.6, 0, w - a * 0.6, h);
    case 'homePlate': return box(0, 0, w - a / 2, h);
    case 'pentagon': return box(w * 0.19, h * 0.23, w * 0.81, h * 0.92);
    case 'star5': return box(w * 0.31, h * 0.38, w * 0.69, h * 0.76);
    case 'rightArrow': case 'leftArrow': { const t = h * adj('adj1', 5e4) / 2, tip = head * adj('adj1', 5e4); return geom === 'leftArrow' ? box(head - tip, h / 2 - t, w, h / 2 + t) : box(0, h / 2 - t, w - head + tip, h / 2 + t); }
    case 'upArrow': case 'downArrow': { const t = w * adj('adj1', 5e4) / 2, tip = head * adj('adj1', 5e4); return geom === 'upArrow' ? box(w / 2 - t, head - tip, w / 2 + t, h) : box(w / 2 - t, 0, w / 2 + t, h - head + tip); }
    default: return box(0, 0, w, h);
  }
}

// ---------- drawing ----------

// How wide the fonts slides usually ask for are next to Noto Sans, regular
// and bold. Text is squeezed by that much so lines break where they did in
// the original. Single line spacing is 1.2 em with the baseline 1 em down.
const FACES = [
  [/calibri|carlito|candara|corbel|gill sans/i, 0.864, 0.832],
  [/arial narrow/i, 0.78, 0.78],
  [/arial|helvetica|liberation sans|franklin/i, 0.948, 0.958],
  [/times|liberation serif|garamond/i, 0.862, 0.85],
  [/cambria|caladea|georgia|book antiqua|palatino/i, 0.9, 0.86],
  [/verdana|noto sans|open sans|century gothic/i, 1, 1],
  [/^/, 0.92, 0.9],
];
const LINE = 1.2, ASCENT = 1;
const WINGDINGS = { '§': '▪', 'l': '●', 'n': '■', 'q': '□', 'u': '◆', 'v': '◆', 'w': '◆', 'Ø': '►', 'ü': '✓', 'Ÿ': '•', '¡': '○', 'þ': '☑', 'à': '→', 'è': '→' };
const DASHES = { dash: [4, 3], sysDash: [3, 1], lgDash: [8, 3], dot: [1, 3], sysDot: [1, 1], dashDot: [4, 3, 1, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1] };

export async function pptxToPdf(bytes, libs, onSlide) {
  const deck = await parsePptx(bytes);
  if (!deck.slides.length) throw new Error('This presentation has no slides to show.');
  const L = await libs.pdfLib();
  const pdf = await L.PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(await libs.fontkit());
  // Subsetting these fonts loses letters in real viewers, so they go in whole,
  // and bold and mono only when a slide uses them.
  const bodies = deck.slides.flatMap((s) => s.items.flatMap((item) => item.type === 'table' ? item.rows.flatMap((row) => row.cells.map((c) => c.text)) : [item.text])).filter(Boolean);
  const allRuns = bodies.flatMap((body) => body.paragraphs.flatMap((p) => p.runs)).filter((r) => r.text);
  const tracker = fontTracker();
  const load = async (name) => pdf.embedFont(await libs.fontBytes(name), { subset: false });
  const regular = await load('NotoSans-Regular.ttf');
  const mono = allRuns.some((r) => r.mono) ? await load('NotoSansMono-Regular.ttf') : regular;
  const bold = allRuns.some((r) => r.bold && !r.mono) ? await load('NotoSans-Bold.ttf') : regular;
  const fontFor = (run) => run.mono ? mono : run.bold ? bold : regular;

  // Every "can this font draw this?" decision goes through cover().
  const charsets = new Map(), shapes = new Map();
  const has = (font, ch) => {
    if (!charsets.has(font)) charsets.set(font, new Set(font.getCharacterSet()));
    if (!charsets.get(font).has(ch.codePointAt(0))) return false;
    if (ch.codePointAt(0) < 0x250) return true;
    // Some scripts need shaping code this page can't run; treat those as missing.
    if (!shapes.has(font)) shapes.set(font, new Map());
    const seen = shapes.get(font);
    if (!seen.has(ch)) { try { font.widthOfTextAtSize(ch, 10); seen.set(ch, true); } catch { seen.set(ch, false); } }
    return seen.get(ch);
  };
  const INVISIBLE = /[\u0000-\u001f\u200b-\u200f\u2028-\u202e\u2060\ufe0e\ufe0f\ufeff]/;
  const cover = (font, text) => Array.from(text).map((ch) => has(font, ch) ? ch : /\s/.test(ch) ? ' ' : INVISIBLE.test(ch) ? '' : '?').join('');
  const covered = (font, text) => Array.from(text).every((ch) => has(font, ch) || /\s/.test(ch) || INVISIBLE.test(ch));
  // In the browser, a character the fonts lack (emoji, Chinese, Arabic) is
  // drawn into a small picture and set in the line. Without that it is "?".
  const glyphs = new Map(), glyphKey = (cluster, run) => cluster + '|' + (run.bold ? 'b' : '') + '|' + run.color;
  const clusters = (text) => typeof Intl !== 'undefined' && Intl.Segmenter ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment) : Array.from(text);
  if (libs.textImage) for (const run of allRuns) {
    if (covered(fontFor(run), run.text)) continue;
    for (const cluster of clusters(run.text)) {
      const key = glyphKey(cluster, run);
      if (covered(fontFor(run), cluster) || glyphs.has(key)) continue;
      try { const made = await libs.textImage(cluster, { bold: !!run.bold, color: run.color }); glyphs.set(key, made ? { ...made, image: await pdf.embedPng(made.bytes) } : null); }
      catch { glyphs.set(key, null); }
    }
  }

  // PNG and JPEG go in as they are. Anything else needs the browser's help.
  const images = new Map();
  for (const [path, { bytes: data, mime }] of deck.media) {
    let image = null;
    try {
      if (data[0] === 0x89 && data[1] === 0x50) image = await pdf.embedPng(data);
      else if (data[0] === 0xff && data[1] === 0xd8) image = await pdf.embedJpg(data);
      else { const png = await libs.rasterize?.(data, mime); if (png) image = await pdf.embedPng(png); }
    } catch { image = null; }
    images.set(path, image);
  }

  const W = deck.width, H = deck.height;
  const color = (hex) => L.rgb(...hexToRgb(hex));
  for (const [index, slide] of deck.slides.entries()) {
    const page = pdf.addPage([W, H]);
    const ops = (...list) => page.pushOperators(...list);
    const states = new Map();
    const opacity = (fill, stroke = fill) => {
      if (fill >= 1 && stroke >= 1) return;
      const key = fill + '/' + stroke;
      if (!states.has(key)) states.set(key, page.node.newExtGState('GS', pdf.context.obj({ Type: 'ExtGState', ca: fill, CA: stroke })));
      ops(L.setGraphicsState(states.get(key)));
    };
    // Inside enter()/leave() the origin is the box's top left corner and y
    // still points up, so a slide y is drawn at -y.
    let squeeze = 1;
    const enter = (r, flips = true) => {
      const a = -(r.rot || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), fx = flips && r.flipH ? -1 : 1, fy = flips && r.flipV ? -1 : 1;
      const m = [cos * fx, sin * fx, -sin * fy, cos * fy];
      ops(L.pushGraphicsState(), L.concatTransformationMatrix(...m, r.x + r.w / 2 - m[0] * r.w / 2 + m[2] * r.h / 2, H - r.y - r.h / 2 - m[1] * r.w / 2 + m[3] * r.h / 2));
    };
    const leave = () => { ops(L.popGraphicsState()); squeeze = 1; };
    const trace = (cmds) => { for (const [op, ...p] of cmds) ops(op === 'M' ? L.moveTo(p[0], -p[1]) : op === 'L' ? L.lineTo(p[0], -p[1]) : op === 'C' ? L.appendBezierCurve(p[0], -p[1], p[2], -p[3], p[4], -p[5]) : L.closePath()); };

    const drawImage = (fill, w, h) => {
      const image = images.get(fill.media), { l, t, r, b } = fill.crop || { l: 0, t: 0, r: 0, b: 0 };
      if (!image) {
        ops(L.setFillingColor(color('EEEEEE')), L.setStrokingColor(color('BBBBBB')), L.setLineWidth(0.5));
        trace(poly(0, 0, w, 0, w, h, 0, h)); ops(L.fillAndStroke());
        return;
      }
      const iw = w / Math.max(0.01, 1 - l - r), ih = h / Math.max(0.01, 1 - t - b);
      page.drawImage(image, { x: -l * iw, y: t * ih - ih, width: iw, height: ih, opacity: fill.alpha < 1 ? fill.alpha : undefined });
    };
    const gradient = (fill, w, h) => {
      const a = fill.angle * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const piece = (from, to) => ({ FunctionType: 2, Domain: [0, 1], C0: hexToRgb(from.color), C1: hexToRgb(to.color), N: 1 });
      const s = fill.stops.length === 1 ? [fill.stops[0], fill.stops[0]] : fill.stops;
      const fn = s.length === 2 ? piece(s[0], s[1]) : { FunctionType: 3, Domain: [0, 1], Functions: s.slice(1).map((stop, i) => piece(s[i], stop)), Bounds: s.slice(1, -1).map((stop) => stop.pos), Encode: s.slice(1).flatMap(() => [0, 1]) };
      const ref = pdf.context.register(pdf.context.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [w / 2 - dx * half, -(h / 2 - dy * half), w / 2 + dx * half, -(h / 2 + dy * half)], Function: fn, Extend: [true, true] }));
      const resources = page.node.normalizedEntries().Resources, key = L.PDFName.of('Shading');
      if (!resources.get(key)) resources.set(key, pdf.context.obj({}));
      const name = 'Sh' + ref.objectNumber;
      resources.lookup(key).set(L.PDFName.of(name), ref);
      ops(L.PDFOperator.of(L.PDFOperatorNames.ShadingFill, [L.PDFName.of(name)]));
    };
    const stroke = (line) => {
      ops(L.setStrokingColor(color(line.color)), L.setLineWidth(line.width));
      opacity(1, line.alpha ?? 1);
      const dash = DASHES[line.dash];
      if (dash) ops(L.setDashPattern(dash.map((d) => d * Math.max(line.width, 0.75)), 0));
    };
    // Fill and outline a set of subpaths in the current box.
    const paint = (paths, fill, line, w, h) => {
      for (const path of paths) {
        if (fill && path.fill) {
          ops(L.pushGraphicsState());
          if (fill.type === 'solid') { opacity(fill.alpha); ops(L.setFillingColor(color(fill.color))); trace(path.cmds); ops(L.fill()); }
          else { trace(path.cmds); ops(L.clip(), L.endPath()); if (fill.type === 'gradient') gradient(fill, w, h); else drawImage(fill, w, h); }
          ops(L.popGraphicsState());
        }
        if (line && path.stroke && line.width > 0) { ops(L.pushGraphicsState()); stroke(line); trace(path.cmds); ops(L.stroke(), L.popGraphicsState()); }
      }
    };
    const arrowHead = (line, tip, from) => {
      const len = Math.max(line.width, 2) * 3, d = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1, ux = (tip[0] - from[0]) / d, uy = (tip[1] - from[1]) / d;
      const bx = tip[0] - ux * len, by = tip[1] - uy * len, half = len / 2;
      ops(L.pushGraphicsState(), L.setFillingColor(color(line.color)));
      trace(poly(tip[0], tip[1], bx - uy * half, by + ux * half, bx + uy * half, by - ux * half)); ops(L.fill(), L.popGraphicsState());
    };

    // ----- text -----
    const face = (run) => { const f = FACES.find((row) => row[0].test(run.font || '')); return { font: fontFor(run), squeeze: run.mono ? 1 : run.bold ? f[2] : f[1] }; };
    const styleOf = (run, scale) => {
      const f = face(run), shift = run.baseline || 0, size = run.size * scale * (shift ? 0.66 : 1);
      return { ...f, size, bold: !!run.bold, full: run.size * scale, rise: shift * run.size * scale, color: run.color, alpha: run.alpha ?? 1, italic: run.italic, underline: run.underline, strike: run.strike };
    };
    const widthOf = (st, text) => st.font.widthOfTextAtSize(cover(st.font, text), st.size) * st.squeeze;
    // A word as pieces: text the font can draw, and pictures for the rest.
    const pieces = (st, text) => {
      if (!glyphs.size || covered(st.font, text)) return [{ text, st, w: widthOf(st, text) }];
      const out = [];
      for (const cluster of clusters(text)) {
        const glyph = covered(st.font, cluster) ? null : glyphs.get(glyphKey(cluster, st)), last = out[out.length - 1];
        if (glyph) out.push({ text: cluster, st, glyph, alone: true, w: glyph.width * st.size / glyph.em });
        else if (last && !last.glyph) last.text += cluster;
        else out.push({ text: cluster, st });
      }
      for (const piece of out) piece.w ??= widthOf(st, piece.text);
      return out;
    };
    const sameStyle = (a, b) => a.font === b.font && a.size === b.size && a.color === b.color && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike && a.rise === b.rise && a.squeeze === b.squeeze && a.alpha === b.alpha;

    // Break a text body into positioned lines for a box this wide.
    const layout = (body, width, scale, cut) => {
      const inner = body.wrap ? Math.max(1, width - body.insets[0] - body.insets[2]) : Infinity, out = [];
      let y = 0;
      for (const [pi, p] of body.paragraphs.entries()) {
        const firstRun = p.runs.find((r) => r.text) || { ...(p.runs[0] || {}), size: p.runs[0]?.size || p.size };
        const first = styleOf({ font: '', ...firstRun }, scale);
        let bullet = null, firstX = p.marL + p.indent;
        if (p.bullet) {
          const st = { ...first, font: regular, squeeze: 1, italic: false, underline: false, strike: false, rise: 0 };
          if (p.bullet.color) st.color = p.bullet.color;
          if (p.bullet.size) st.size = p.bullet.size * scale; else if (p.bullet.scale) st.size = first.full * p.bullet.scale;
          let text = /wingdings|symbol|webdings/i.test(p.bullet.font || '') ? WINGDINGS[p.bullet.text] || '•' : p.bullet.text;
          if (Array.from(text).some((ch) => !has(regular, ch))) text = '•';
          bullet = { text, st, x: firstX };
          firstX = p.indent < 0 ? Math.max(p.marL, firstX + widthOf(st, text) + st.size * 0.15) : firstX + widthOf(st, text) + st.size * 0.4;
        }
        const lines = [];
        let line = { atoms: [], w: 0, x: Math.max(0, firstX), fresh: true }, word = [], wordW = 0;
        const room = () => inner - line.x;
        const next = (forced) => { line.forced = forced; lines.push(line); line = { atoms: [], w: 0, x: Math.max(0, p.marL), fresh: forced }; };
        const flushWord = () => {
          if (!word.length) return;
          if (line.atoms.length && line.w + wordW > room() + 0.01) next(false);
          if (wordW > room()) {
            // Longer than a whole line: break it between characters.
            for (const atom of word) for (const ch of atom.glyph ? [atom.text] : Array.from(atom.text)) { const w = widthOf(atom.st, ch); if (line.atoms.length && line.w + w > room()) next(false); line.atoms.push({ ...atom, text: ch, w }); line.w += w; }
          } else { line.atoms.push(...word); line.w += wordW; }
          word = []; wordW = 0;
        };
        for (const run of p.runs) {
          const st = styleOf(run, scale);
          if (run.br) { flushWord(); line.st ||= st; next(true); continue; }
          for (const piece of run.text.split(/(\t| +|[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef])/)) {
            if (!piece) continue;
            if (piece === '\t') { flushWord(); const w = 72 - ((line.x + line.w) % 72); line.atoms.push({ text: ' ', st, w, space: true, alone: true }); line.w += w; }
            else if (piece[0] === ' ') { flushWord(); if (line.atoms.length || line.fresh) { const w = widthOf(st, piece); line.atoms.push({ text: piece, st, w, space: true }); line.w += w; } }
            else for (const part of pieces(st, piece)) { word.push(part); wordW += part.w; if (part.glyph || piece.codePointAt(0) >= 0x2e80) flushWord(); }
          }
        }
        flushWord(); line.forced = true; lines.push(line);

        const gap = (s, size) => s.pts !== undefined ? s.pts * scale : s.pct * size;
        if (pi) y += gap(p.before, first.full);
        for (const [li, ln] of lines.entries()) {
          if (ln.atoms.some((a) => !a.space)) while (ln.atoms[ln.atoms.length - 1].space) ln.w -= ln.atoms.pop().w;
          const styles = ln.atoms.length ? ln.atoms.map((a) => a.st) : [ln.st || first];
          const tallest = Math.max(...styles.map((s) => s.full)), natural = tallest * LINE, ascent = tallest * ASCENT;
          const height = p.lineSpacing.pts !== undefined ? p.lineSpacing.pts * scale : natural * Math.max(0.1, p.lineSpacing.pct - cut);
          const space = (body.wrap ? inner : Math.max(1, width - body.insets[0] - body.insets[2])) - ln.x, spaces = ln.atoms.filter((a) => a.space).length;
          let x = body.insets[0] + ln.x + (p.align === 'ctr' ? (space - ln.w) / 2 : p.align === 'r' ? space - ln.w : 0);
          const stretch = (p.align === 'just' || p.align === 'dist') && !ln.forced && spaces ? (space - ln.w) / spaces : 0;
          const segs = [];
          for (const atom of ln.atoms) {
            const w = atom.w + (atom.space ? stretch : 0), last = segs[segs.length - 1];
            if (last && !atom.alone && !last.alone && sameStyle(last.st, atom.st) && !(stretch && (atom.space || last.gap))) { last.text += atom.text; last.w += w; }
            else segs.push({ st: atom.st, text: atom.text, x, w, gap: atom.space, glyph: atom.glyph, alone: atom.alone });
            x += w;
          }
          const entry = { base: y + height - (natural - ascent), segs: segs.filter((s) => !(stretch && s.gap)) };
          if (!li && bullet) entry.bullet = { ...bullet, x: body.insets[0] + bullet.x + (p.align === 'ctr' ? (space - ln.w) / 2 : p.align === 'r' ? space - ln.w : 0) };
          out.push(entry);
          y += height;
        }
        if (pi < body.paragraphs.length - 1) y += gap(p.after, first.full);
      }
      return { lines: out, height: y };
    };
    // Lay the text out, shrinking it when the slide asks for text to fit.
    const fitText = (body, w, h) => {
      const room = h - body.insets[1] - body.insets[3];
      let scale = body.fontScale, cut = body.spacingCut, result = layout(body, w, scale, cut);
      for (let step = 1; body.fit === 'shrink' && result.height > room * 1.08 && scale > 0.3; step++) {
        scale -= 0.075 * body.fontScale; cut = Math.max(cut, Math.min(0.2, step * 0.1));
        result = layout(body, w, scale, cut);
      }
      return result;
    };
    const drawLines = ({ lines, height }, body, h) => {
      const room = h - body.insets[1] - body.insets[3], top = body.insets[1] + (body.anchor === 'ctr' ? (room - height) / 2 : body.anchor === 'b' ? room - height : 0);
      const put = (st, text, x, y) => {
        const shown = cover(st.font, text);
        if (!shown.trim()) return;
        if (st.squeeze !== squeeze) { squeeze = st.squeeze; ops(L.setCharacterSqueeze(squeeze * 100)); }
        tracker.use(st.font, shown);
        page.drawText(shown, { x, y: -(y - st.rise), size: st.size, font: st.font, color: color(st.color), opacity: st.alpha < 1 ? st.alpha : undefined, ySkew: st.italic ? L.degrees(12) : undefined });
      };
      for (const ln of lines) {
        const y = top + ln.base;
        if (ln.bullet) put(ln.bullet.st, ln.bullet.text, ln.bullet.x, y);
        for (const seg of ln.segs) {
          if (seg.glyph) { const k = seg.st.size / seg.glyph.em; page.drawImage(seg.glyph.image, { x: seg.x - 2 * k, y: -(y - seg.st.rise) - (seg.glyph.height - seg.glyph.baseline) * k, width: seg.glyph.canvasWidth * k, height: seg.glyph.height * k }); }
          else put(seg.st, seg.text, seg.x, y);
          for (const [flag, dy] of [[seg.st.underline, 0.12], [seg.st.strike, -0.27]]) if (flag) ops(L.pushGraphicsState(), L.setStrokingColor(color(seg.st.color)), L.setLineWidth(seg.st.size / 16), L.moveTo(seg.x, -(y + seg.st.size * dy)), L.lineTo(seg.x + seg.w, -(y + seg.st.size * dy)), L.stroke(), L.popGraphicsState());
        }
      }
    };
    const drawBody = (body, box) => {
      // Text never mirrors. A vertical flip turns it upside down instead.
      let r = { ...box, rot: (box.rot || 0) + (box.flipV ? 180 : 0) };
      if (/^(vert|eaVert|wordArtVert|vert270)/.test(body.vert)) r = { x: r.x + r.w / 2 - r.h / 2, y: r.y + r.h / 2 - r.w / 2, w: r.h, h: r.w, rot: r.rot + (body.vert === 'vert270' ? 270 : 90) };
      enter(r, false);
      drawLines(fitText(body, r.w, r.h), body, r.h);
      leave();
    };

    // ----- items -----
    const drawShape = (item) => {
      const paths = outline(item) || (item.fill ? whole(poly(0, 0, item.w, 0, item.w, item.h, 0, item.h), { stroke: !!item.fill }) : []);
      enter(item);
      paint(paths, item.fill, item.line, item.w, item.h);
      const open = paths[0]?.cmds, line = item.line;
      if (line && (line.head || line.tail) && open && open[open.length - 1][0] !== 'Z') {
        const pt = (c) => c.slice(-2), near = (c) => c.length > 3 ? c.slice(-4, -2) : null;
        if (line.head && open[1]) arrowHead(line, pt(open[0]), open[1].length > 3 ? open[1].slice(1, 3) : pt(open[1]));
        if (line.tail && open[1]) arrowHead(line, pt(open[open.length - 1]), near(open[open.length - 1]) || pt(open[open.length - 2]));
      }
      leave();
      if (item.text && item.geom !== 'line') {
        const t = textRect(item), a = (item.rot || 0) * Math.PI / 180;
        // The text rect may sit off-centre in the shape, so turn it about the shape's centre.
        const dx = t.x + t.w / 2 - item.w / 2, dy = t.y + t.h / 2 - item.h / 2;
        drawBody(item.text, { ...item, x: item.x + item.w / 2 + dx * Math.cos(a) - dy * Math.sin(a) - t.w / 2, y: item.y + item.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) - t.h / 2, w: t.w, h: t.h });
      }
    };
    const drawPicture = (item) => {
      const paths = outline(item) || whole(poly(0, 0, item.w, 0, item.w, item.h, 0, item.h));
      enter(item);
      paint(paths, { type: 'image', media: item.media, crop: item.crop, alpha: item.alpha }, item.line, item.w, item.h);
      leave();
    };
    const drawFrame = (item) => {
      enter(item);
      paint(whole(poly(0, 0, item.w, 0, item.w, item.h, 0, item.h)), { type: 'solid', color: 'F2F2F2', alpha: 1 }, { color: 'BBBBBB', width: 0.5 }, item.w, item.h);
      leave();
      const run = { text: item.label, size: Math.max(8, Math.min(18, item.h / 4)), color: '888888', font: '' };
      drawBody({ insets: [4, 4, 4, 4], anchor: 'ctr', wrap: true, vert: 'horz', fit: 'none', fontScale: 1, spacingCut: 0, paragraphs: [{ align: 'ctr', marL: 0, indent: 0, lineSpacing: { pct: 1 }, before: { pts: 0 }, after: { pts: 0 }, bullet: null, runs: [run], size: run.size }] }, item);
    };
    const drawTable = (item) => {
      // Rows grow to hold their text, like they do in PowerPoint.
      const total = item.cols.reduce((a, b) => a + b, 0) || 1, cols = item.cols.map((c) => c * (item.w / total > 1.001 || item.w / total < 0.999 ? item.w / total : 1));
      const xs = cols.reduce((list, c) => [...list, list[list.length - 1] + c], [0]);
      const span = (cell) => xs[Math.min(cols.length, cell.col + cell.span)] - xs[cell.col];
      const laid = new Map(), heights = item.rows.map((row) => row.h);
      for (const [r, row] of item.rows.entries()) for (const cell of row.cells) {
        if (!cell.text) continue;
        const result = layout(cell.text, span(cell), 1, 0);
        laid.set(cell, result);
        if (cell.rowSpan === 1) heights[r] = Math.max(heights[r], result.height + cell.text.insets[1] + cell.text.insets[3]);
      }
      const ys = heights.reduce((list, h) => [...list, list[list.length - 1] + h], [0]);
      const boxes = [];
      for (const [r, row] of item.rows.entries()) for (const cell of row.cells) if (!cell.merged) boxes.push({ cell, x: xs[cell.col], y: ys[r], w: span(cell), h: ys[Math.min(heights.length, r + cell.rowSpan)] - ys[r] });
      enter({ ...item, rot: 0, flipH: false, flipV: false });
      for (const b of boxes) if (b.cell.fill) paint(whole(poly(b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x, b.y + b.h)), b.cell.fill, null, b.w, b.h);
      for (const b of boxes) {
        const e = b.cell.borders, side = (line, x1, y1, x2, y2) => line && paint([{ cmds: [['M', x1, y1], ['L', x2, y2]], stroke: true }], null, line);
        side(e.t, b.x, b.y, b.x + b.w, b.y); side(e.b, b.x, b.y + b.h, b.x + b.w, b.y + b.h); side(e.l, b.x, b.y, b.x, b.y + b.h); side(e.r, b.x + b.w, b.y, b.x + b.w, b.y + b.h);
      }
      leave();
      for (const b of boxes) if (laid.has(b.cell)) { enter({ x: item.x + b.x, y: item.y + b.y, w: b.w, h: b.h }); drawLines(laid.get(b.cell), b.cell.text, b.h); leave(); }
    };

    enter({ x: 0, y: 0, w: W, h: H });
    paint(whole(poly(0, 0, W, 0, W, H, 0, H)), slide.background, null, W, H);
    leave();
    for (const item of slide.items) {
      if (item.type === 'shape') drawShape(item);
      else if (item.type === 'picture') drawPicture(item);
      else if (item.type === 'table') drawTable(item);
      else drawFrame(item);
    }
    onSlide?.(index + 1, deck.slides.length);
  }
  tracker.trim();
  return pdf.save();
}
