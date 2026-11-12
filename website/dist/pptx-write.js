// A small PowerPoint writer. writePptx takes slides made of text boxes,
// pictures, rectangles and tables, all placed in points. blocksToSlides lays a
// block list (docs/conversion-model.md) out as plain slides for it.
// The package carries no author, dates or app name.
import { deflateEntry, writeZip } from './office-zip.js';

const encoder = new TextEncoder();
const emu = (pt) => Math.round((Number(pt) || 0) * 12700);
// XML can't hold most control characters, and PDFs are full of them.
const esc = (value) => String(value ?? '').replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colour = (value) => /^[0-9a-f]{6}$/i.test(value || '') ? value.toUpperCase() : null;
const fill = (value) => colour(value) ? '<a:solidFill><a:srgbClr val="' + colour(value) + '"/></a:solidFill>' : '';
const safeLink = (href) => /^(https?:|mailto:)/i.test(href || '');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const rels = (list) => XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.map(([id, type, target, external]) => '<Relationship Id="' + id + '" Type="' + REL + type + '" Target="' + esc(target) + '"' + (external ? ' TargetMode="External"' : '') + '/>').join('') + '</Relationships>';

// Font names as a PDF spells them → the family name Office knows. Fonts that
// only exist on Linux map to the Windows and Mac fonts they were drawn to match.
const FAMILY = {
  arial: 'Arial', arialmt: 'Arial', helvetica: 'Arial', helveticaneue: 'Arial', liberationsans: 'Arial', nimbussans: 'Arial', nimbussanl: 'Arial', arimo: 'Arial',
  times: 'Times New Roman', timesnewroman: 'Times New Roman', timesnewromanps: 'Times New Roman', timesnewromanpsmt: 'Times New Roman', liberationserif: 'Times New Roman', nimbusroman: 'Times New Roman', nimbusromno9l: 'Times New Roman', tinos: 'Times New Roman',
  courier: 'Courier New', couriernew: 'Courier New', couriernewps: 'Courier New', couriernewpsmt: 'Courier New', liberationmono: 'Courier New', nimbusmono: 'Courier New', nimbusmonops: 'Courier New', nimbusmonl: 'Courier New', cousine: 'Courier New',
  carlito: 'Calibri', caladea: 'Cambria', dejavusans: 'DejaVu Sans', dejavuserif: 'DejaVu Serif', dejavusansmono: 'DejaVu Sans Mono', symbolmt: 'Symbol',
  serif: 'Times New Roman', monospace: 'Courier New', 'sans-serif': '', sansserif: '',
};
const KEEP = /^(Light|Thin|Medium|ExtraLight|Condensed|Narrow|Display|Caption|Text|SemiLight)/;
export function cleanFont(name) {
  let n = String(name || '').trim().replace(/^[A-Z]{6}\+/, '');
  if (Object.hasOwn(FAMILY, n.toLowerCase())) return FAMILY[n.toLowerCase()];
  // "Calibri-LightItalic" keeps "Light", which is its own family in Office.
  const cut = n.search(/[-,]/);
  let tail = '';
  if (cut > 0) { tail = (n.slice(cut + 1).match(KEEP) || [''])[0]; n = n.slice(0, cut); }
  const known = (name) => { const key = name.replace(/[\s_]/g, '').toLowerCase(); return Object.hasOwn(FAMILY, key) ? FAMILY[key] : undefined; };
  for (;;) {
    if (known(n) !== undefined) return known(n);
    const next = n.replace(/(PSMT|PS|MT|BoldItalic|BoldOblique|SemiBold|Semibold|DemiBold|Demibold|ExtraBold|Bold|Black|Heavy|Italic|Oblique|Regular|Roman|Book)$/, '').trim();
    if (!next || next === n) break;
    n = next;
  }
  return (n.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2') + (tail ? ' ' + tail.replace(/([a-z])([A-Z])/g, '$1 $2') : '')).trim();
}

function runProps(run, tag, link) {
  const size = Number(run.size) > 0 ? ' sz="' + Math.max(100, Math.min(400000, Math.round(run.size * 100))) + '"' : '';
  const font = cleanFont(run.font);
  const face = font ? '<a:latin typeface="' + esc(font) + '"/><a:ea typeface="' + esc(font) + '"/><a:cs typeface="' + esc(font) + '"/>' : '';
  return '<a:' + tag + size + (run.b ? ' b="1"' : '') + (run.i ? ' i="1"' : '') + (run.u || link ? ' u="sng"' : '') + (run.s ? ' strike="sngStrike"' : '')
    + (run.sup ? ' baseline="30000"' : run.sub ? ' baseline="-25000"' : '') + (Number(run.spc) ? ' spc="' + Math.max(-400000, Math.min(400000, Math.round(run.spc * 100))) + '"' : '') + ' dirty="0">' + fill(run.color) + face + (link ? '<a:hlinkClick r:id="' + link + '"/>' : '') + '</a:' + tag + '>';
}

function paragraph(p, part, base = {}) {
  const level = Math.max(0, Math.min(8, p.level || 0)), step = 18;
  const margin = p.bullet ? (level + 1) * step : level * step;
  let props = '<a:pPr' + (margin ? ' marL="' + emu(margin) + '"' : ' marL="0"') + ' indent="' + (p.bullet ? -emu(step) : 0) + '"' + (level ? ' lvl="' + level + '"' : '')
    + ({ center: ' algn="ctr"', right: ' algn="r"', justify: ' algn="just"', left: ' algn="l"' }[p.align] || '') + '>';
  if (p.spacing > 0) props += '<a:lnSpc><a:spcPts val="' + Math.round(p.spacing * 100) + '"/></a:lnSpc>';
  props += '<a:spcBef><a:spcPts val="' + Math.round((p.before || 0) * 100) + '"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>';
  if (p.bullet === 'char') props += '<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>';
  else if (p.bullet === 'number') props += '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"' + (p.start > 1 ? ' startAt="' + Math.min(32767, Math.round(p.start)) + '"' : '') + '/>';
  else props += '<a:buNone/>';
  props += '</a:pPr>';
  let body = '', last = base;
  for (const raw of p.runs || []) {
    const run = { ...base };
    for (const [key, value] of Object.entries(raw || {})) if (value !== undefined) run[key] = value;
    if (!run.text) continue;
    last = run;
    const link = safeLink(run.href) ? part.link(run.href) : '';
    String(run.text).split('\n').forEach((piece, n) => {
      if (n) body += '<a:br>' + runProps(run, 'rPr') + '</a:br>';
      if (piece) body += '<a:r>' + runProps(run, 'rPr', link) + '<a:t>' + esc(piece) + '</a:t></a:r>';
    });
  }
  return '<a:p>' + props + body + runProps({ size: last.size, font: last.font }, 'endParaRPr') + '</a:p>';
}

const frame = (item, tag = 'a:xfrm') => '<' + tag + (item.rot ? ' rot="' + Math.round(item.rot * 60000) + '"' : '') + '><a:off x="' + emu(item.x) + '" y="' + emu(item.y) + '"/><a:ext cx="' + Math.max(0, emu(item.w)) + '" cy="' + Math.max(0, emu(item.h)) + '"/></' + tag + '>';
const RECT = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

function textShape(item, id, part) {
  const ph = item.placeholder === 'title' ? '<p:ph type="title"/>' : item.placeholder === 'body' ? '<p:ph idx="1"/>' : '';
  const wrap = item.wrap === false ? 'none' : 'square';
  const fit = item.autofit ? (wrap === 'none' ? '<a:spAutoFit/>' : '<a:normAutofit/>') : '<a:noAutofit/>';
  const paragraphs = (item.paragraphs?.length ? item.paragraphs : [{ runs: [] }]).map((p) => paragraph(p, part)).join('');
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + (ph ? (item.placeholder === 'title' ? 'Title ' : 'Content ') : 'Text ') + id + '"/><p:cNvSpPr' + (ph ? '><a:spLocks noGrp="1"/></p:cNvSpPr>' : ' txBox="1"/>') + '<p:nvPr>' + ph + '</p:nvPr></p:nvSpPr>'
    + '<p:spPr>' + frame(item) + RECT + '<a:noFill/></p:spPr>'
    + '<p:txBody><a:bodyPr wrap="' + wrap + '" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="' + ({ ctr: 'ctr', b: 'b' }[item.anchor] || 't') + '">' + fit + '</a:bodyPr><a:lstStyle/>' + paragraphs + '</p:txBody></p:sp>';
}

function rectShape(item, id) {
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Shape ' + id + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>' + frame(item) + RECT + (fill(item.fill) || '<a:noFill/>')
    + '<a:ln' + (colour(item.line) ? ' w="9525">' + fill(item.line) : '><a:noFill/>') + '</a:ln></p:spPr></p:sp>';
}

function picture(item, id, part) {
  return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="Picture ' + id + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
    + '<p:blipFill><a:blip r:embed="' + part.image(item) + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' + frame(item) + RECT + '</p:spPr></p:pic>';
}

function tableFrame(item, id, part) {
  const rows = (item.rows || []).filter((r) => r?.length), count = Math.max(1, ...rows.map((r) => r.length)), head = item.head ?? 1;
  const widths = item.cols?.length === count ? item.cols : Array.from({ length: count }, () => item.w / count);
  const edge = (tag) => '<a:' + tag + ' w="6350">' + fill(item.line || 'BFBFBF') + '</a:' + tag + '>';
  const body = rows.map((row, r) => '<a:tr h="' + emu(item.heights?.[r] || item.h / Math.max(1, rows.length)) + '">' + Array.from({ length: count }, (_, c) => {
    const cell = row[c], runs = Array.isArray(cell) ? cell : cell?.runs || [];
    return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + paragraph({ runs }, part, { size: item.size || 14, b: r < head || undefined }) + '</a:txBody>'
      + '<a:tcPr marL="' + emu(5) + '" marR="' + emu(5) + '" marT="' + emu(3) + '" marB="' + emu(3) + '">' + edge('lnL') + edge('lnR') + edge('lnT') + edge('lnB') + (r < head ? fill(item.headFill || 'F2F2F2') : '<a:noFill/>') + '</a:tcPr></a:tc>';
  }).join('') + '</a:tr>').join('');
  return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Table ' + id + '"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>'
    + frame(item, 'p:xfrm') + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr' + (head ? ' firstRow="1"' : '') + '/><a:tblGrid>'
    + widths.map((w) => '<a:gridCol w="' + emu(w) + '"/>').join('') + '</a:tblGrid>' + body + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
}

const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const MAP = '<a:masterClrMapping/>';
const THEME = XML + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Plain"><a:themeElements><a:clrScheme name="Plain"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>'
  + ['2563EB', 'D97706', '6B7280', 'CA8A04', '0891B2', '16A34A'].map((c, n) => '<a:accent' + (n + 1) + '><a:srgbClr val="' + c + '"/></a:accent' + (n + 1) + '>').join('')
  + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
  + '<a:fontScheme name="Plain"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
  + '<a:fmtScheme name="Plain"><a:fillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + '</a:fillStyleLst><a:lnStyleLst>'
  + [6350, 12700, 19050].map((w) => '<a:ln w="' + w + '" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>').join('')
  + '</a:lnStyleLst><a:effectStyleLst>' + '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) + '</a:effectStyleLst><a:bgFillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)
  + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';

const placeholder = (id, name, ph, box, sample) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>' + ph + '</p:nvPr></p:nvSpPr><p:spPr>' + (box ? frame(box) + RECT : '') + '</p:spPr>'
  + '<p:txBody><a:bodyPr' + (box ? ' lIns="0" tIns="0" rIns="0" bIns="0" anchor="' + (box.anchor || 't') + '"><a:normAutofit/></a:bodyPr>' : '/>') + '<a:lstStyle/><a:p><a:r><a:rPr dirty="0"/><a:t>' + sample + '</a:t></a:r></a:p></p:txBody></p:sp>';

function master(width, height) {
  const side = width * 0.056, level = (n, size) => '<a:lvl' + n + 'pPr marL="' + emu((n - 1) * 18) + '" indent="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buNone/><a:defRPr sz="' + size + '" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl' + n + 'pPr>';
  const levels = (size) => Array.from({ length: 9 }, (_, n) => level(n + 1, size)).join('');
  return XML + '<p:sldMaster ' + NS + '><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>' + GROUP
    + placeholder(2, 'Title Placeholder 1', '<p:ph type="title"/>', { x: side, y: height * 0.067, w: width - side * 2, h: height * 0.104, anchor: 'b' }, 'Click to edit the title')
    + placeholder(3, 'Text Placeholder 2', '<p:ph type="body" idx="1"/>', { x: side, y: height * 0.222, w: width - side * 2, h: height * 0.711 }, 'Click to edit text')
    + '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst>'
    + '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="3000" b="1" kern="1200"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>'
    + '<p:bodyStyle>' + levels(1800) + '</p:bodyStyle><p:otherStyle>' + levels(1800) + '</p:otherStyle></p:txStyles></p:sldMaster>';
}

const layout = (name, shapes, type) => XML + '<p:sldLayout ' + NS + (type ? ' type="' + type + '"' : '') + ' preserve="1"><p:cSld name="' + name + '"><p:spTree>' + GROUP + shapes + '</p:spTree></p:cSld><p:clrMapOvr>' + MAP + '</p:clrMapOvr></p:sldLayout>';

const imageKind = (item) => {
  const b = item.bytes;
  if (b?.[0] === 0x89 && b[1] === 0x50) return ['png', 'image/png'];
  if (b?.[0] === 0xff && b[1] === 0xd8) return ['jpeg', 'image/jpeg'];
  return /jpe?g/i.test(item.mime || '') ? ['jpeg', 'image/jpeg'] : ['png', 'image/png'];
};

// width, height and every x, y, w, h are in points.
export async function writePptx({ width = 960, height = 540, slides = [] } = {}) {
  // PowerPoint takes slides from 1 to 56 inches a side.
  const clamp = (pt) => Math.max(72, Math.min(4032, Number(pt) || 0));
  width = clamp(width); height = clamp(height);
  const files = [], media = new Map(), kinds = new Set();
  const list = slides.length ? slides : [{ items: [] }];
  list.forEach((slide, n) => {
    const links = [[ 'rId1', 'slideLayout', '../slideLayouts/slideLayout' + ((slide.items || []).some((i) => i.placeholder) ? 2 : 1) + '.xml' ]];
    const part = {
      link(href) { links.push(['rId' + (links.length + 1), 'hyperlink', href, true]); return 'rId' + links.length; },
      image(item) {
        // The same picture on many slides is stored once.
        if (!media.has(item.bytes)) { const [ext] = imageKind(item); kinds.add(ext); media.set(item.bytes, 'image' + (media.size + 1) + '.' + ext); }
        links.push(['rId' + (links.length + 1), 'image', '../media/' + media.get(item.bytes)]);
        return 'rId' + links.length;
      },
    };
    let id = 1;
    const shapes = (slide.items || []).map((item) => {
      if (item.type === 'text') return textShape(item, ++id, part);
      if (item.type === 'image' && item.bytes?.length) return picture(item, ++id, part);
      if (item.type === 'rect') return rectShape(item, ++id);
      if (item.type === 'table' && item.rows?.length) return tableFrame(item, ++id, part);
      return '';
    }).join('');
    const bg = colour(slide.background) ? '<p:bg><p:bgPr>' + fill(slide.background) + '<a:effectLst/></p:bgPr></p:bg>' : '';
    files.push(['ppt/slides/slide' + (n + 1) + '.xml', XML + '<p:sld ' + NS + '><p:cSld>' + bg + '<p:spTree>' + GROUP + shapes + '</p:spTree></p:cSld><p:clrMapOvr>' + MAP + '</p:clrMapOvr></p:sld>']);
    files.push(['ppt/slides/_rels/slide' + (n + 1) + '.xml.rels', rels(links)]);
  });
  const type = (part, kind) => '<Override PartName="/ppt/' + part + '" ContentType="application/vnd.openxmlformats-officedocument.' + kind + '+xml"/>';
  const head = [
    ['[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + [...kinds].map((ext) => '<Default Extension="' + ext + '" ContentType="image/' + ext + '"/>').join('')
      + type('presentation.xml', 'presentationml.presentation.main') + type('slideMasters/slideMaster1.xml', 'presentationml.slideMaster') + type('slideLayouts/slideLayout1.xml', 'presentationml.slideLayout') + type('slideLayouts/slideLayout2.xml', 'presentationml.slideLayout')
      + type('theme/theme1.xml', 'theme') + list.map((_, n) => type('slides/slide' + (n + 1) + '.xml', 'presentationml.slide')).join('') + '</Types>'],
    ['_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']])],
    ['ppt/presentation.xml', XML + '<p:presentation ' + NS + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + list.map((_, n) => '<p:sldId id="' + (256 + n) + '" r:id="rId' + (n + 3) + '"/>').join('')
      + '</p:sldIdLst><p:sldSz cx="' + emu(width) + '" cy="' + emu(height) + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...list.map((_, n) => ['rId' + (n + 3), 'slide', 'slides/slide' + (n + 1) + '.xml'])])],
    ['ppt/slideMasters/slideMaster1.xml', master(width, height)],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'slideLayout', '../slideLayouts/slideLayout2.xml'], ['rId3', 'theme', '../theme/theme1.xml']])],
    ['ppt/slideLayouts/slideLayout1.xml', layout('Blank', '', 'blank')],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])],
    ['ppt/slideLayouts/slideLayout2.xml', layout('Title and Content', placeholder(2, 'Title 1', '<p:ph type="title"/>', null, 'Click to edit the title') + placeholder(3, 'Content Placeholder 2', '<p:ph idx="1"/>', null, 'Click to edit text'), 'obj')],
    ['ppt/slideLayouts/_rels/slideLayout2.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])],
    ['ppt/theme/theme1.xml', THEME],
  ];
  const entries = new Map();
  for (const [name, content] of [...head, ...files]) await deflateEntry(entries, name, encoder.encode(content));
  // Pictures are already compressed: store them as they are.
  for (const [bytes, name] of media) { await deflateEntry(entries, 'ppt/media/' + name, bytes); const e = entries.get('ppt/media/' + name); if (e.method === 8 && e.packed.length > bytes.length * 0.95) Object.assign(e, { method: 0, packed: bytes }); }
  return writeZip(entries, true);
}

// ---------- Block list → slides ----------

const W = 960, H = 540, SIDE = 54, TOP = 122, BOTTOM = 500, INK = '1F2937', ACCENT = '2563EB', BODY = 18;
const textOf = (runs) => (runs || []).map((r) => r.text || '').join('');
// A rough line count is all a slide needs: a little under half an em per letter.
const linesOf = (text, size, width) => String(text).split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length * size * 0.46 / width)), 0);

function splitRuns(runs, chars) {
  const head = [], tail = [];
  let left = chars;
  for (const run of runs) {
    if (left <= 0) { tail.push(run); continue; }
    if (run.text.length <= left) { head.push(run); left -= run.text.length; continue; }
    let cut = run.text.lastIndexOf(' ', left);
    if (cut < left * 0.5) cut = left;
    head.push({ ...run, text: run.text.slice(0, cut) }); tail.push({ ...run, text: run.text.slice(cut).replace(/^ /, '') });
    left = 0;
  }
  return [head, tail.filter((r) => r.text)];
}

export function blocksToSlides(doc) {
  const blocks = doc?.blocks || [], slides = [];
  const wide = W - SIDE * 2;
  let slide = null, box = null, y = TOP, title = '', numbering = [];
  const style = (run, extra = {}) => ({ text: run.text, size: BODY, color: run.color || INK, b: run.b, i: run.i, u: run.u, s: run.s, sup: run.sup, sub: run.sub, href: run.href, ...(run.code ? { font: 'Courier New' } : {}), ...extra });
  const start = (heading, more = false) => {
    title = heading;
    slide = { items: [] }; slides.push(slide); box = null; numbering = [];
    if (heading) {
      slide.items.push({ type: 'text', placeholder: 'title', x: SIDE, y: 36, w: wide, h: 56, anchor: 'b', wrap: true, paragraphs: [{ runs: [{ text: heading + (more ? ' (cont.)' : ''), size: 30, b: true, color: INK }] }] });
      slide.items.push({ type: 'rect', x: SIDE, y: 100, w: 72, h: 4, fill: ACCENT });
    }
    y = heading ? TOP : SIDE;
  };
  const room = () => BOTTOM - y;
  const used = () => !!slide && y > (title ? TOP : SIDE) + 1;
  // Makes sure `need` points are free, on a continuation slide if not.
  const fit = (need) => { if (!slide) start(title); else if (need > room() && used()) start(title, !!title); };
  const say = (para, height) => {
    fit(height);
    if (!box) {
      box = { type: 'text', x: SIDE, y, w: wide, h: 0, wrap: true, paragraphs: [] };
      if (!slide.items.some((i) => i.placeholder === 'body')) box.placeholder = 'body';
      slide.items.push(box);
    }
    box.paragraphs.push(para); box.h += height; y += height;
  };
  const text = (runs, { size = BODY, level = 0, bullet = null, extra = {}, align, startAt } = {}) => {
    runs = (runs || []).filter((r) => r?.text);
    if (!runs.length) return;
    const width = wide - (bullet ? level + 1 : level) * 18, line = size * 1.2, full = BOTTOM - (title ? TOP : SIDE);
    for (let guard = 0; runs.length && guard < 200; guard++) {
      let lines = linesOf(textOf(runs), size, width), rest = [];
      // A paragraph longer than a slide is cut at a word and carries on.
      if (lines * line + 6 > full) { [runs, rest] = splitRuns(runs, Math.floor((full - 6) / line) * Math.floor(width / (size * 0.46)) - 20); lines = linesOf(textOf(runs), size, width); }
      const para = { runs: runs.map((r) => style(r, { size, ...extra })), level, bullet, before: 6 };
      if (align === 'center' || align === 'right') para.align = align;
      if (startAt > 1) para.start = startAt;
      say(para, lines * line + 6);
      runs = rest; bullet = rest.length ? null : bullet;
    }
  };
  const close = () => { box = null; y += 8; };

  let from = 0;
  const lead = blocks[0]?.t === 'h' && blocks[0].level === 1 ? textOf(blocks[0].runs).trim() : String(doc?.title || '').trim();
  if (lead) {
    if (blocks[0]?.t === 'h' && blocks[0].level === 1) from = 1;
    slides.push({ items: [
      { type: 'text', placeholder: 'title', x: SIDE, y: 150, w: wide, h: 120, anchor: 'b', wrap: true, paragraphs: [{ runs: [{ text: lead, size: 40, b: true, color: INK }] }] },
      { type: 'rect', x: SIDE, y: 284, w: 96, h: 5, fill: ACCENT },
    ] });
    title = lead;
  }
  for (const b of blocks.slice(from)) {
    if (b.t !== 'li') numbering = [];
    if (b.t === 'h' && b.level <= 2) { start(textOf(b.runs).trim()); continue; }
    if (b.t === 'h') { text(b.runs, { size: b.level === 3 ? 22 : 20, extra: { b: true } }); continue; }
    if (b.t === 'break') { if (used()) start(title, !!title); continue; }
    if (b.t === 'hr') { if (slide) close(); continue; }
    if (b.t === 'li') {
      const depth = Math.max(0, Math.min(8, b.depth || 0)), runs = b.task === undefined ? b.runs : [{ text: b.task ? '\u2611 ' : '\u2610 ' }, ...(b.runs || [])];
      numbering.length = depth + 1;
      // PowerPoint counts on from the first number of a run by itself.
      if (b.ordered && numbering[depth] === undefined) numbering[depth] = b.n || 1;
      if (!b.ordered) numbering[depth] = undefined;
      const before = slide;
      text(runs, { level: depth, bullet: b.ordered ? 'number' : 'char', startAt: numbering[depth] });
      // An item pushed onto a new slide starts that slide's count.
      if (b.ordered && slide !== before) { numbering[depth] = b.n || 1; const last = box?.paragraphs[box.paragraphs.length - 1]; if (last?.bullet === 'number') last.start = numbering[depth]; }
      continue;
    }
    if (b.t === 'quote') { text(b.runs, { level: 1, extra: { i: true, color: '4B5563' } }); continue; }
    if (b.t === 'code') {
      let lines = String(b.text || '').replace(/\t/g, '    ').split('\n');
      const size = 13, line = size * 1.25;
      while (lines.length) {
        fit(Math.min(lines.length, 4) * line + 20);
        const take = Math.max(1, Math.min(lines.length, Math.floor((room() - 20) / line))), height = take * line + 16;
        box = null;
        slide.items.push({ type: 'rect', x: SIDE, y, w: wide, h: height, fill: 'F3F4F6' });
        slide.items.push({ type: 'text', x: SIDE + 10, y: y + 8, w: wide - 20, h: height - 16, wrap: true, paragraphs: lines.slice(0, take).map((t) => ({ runs: [{ text: t || ' ', size, font: 'Courier New', color: INK }], spacing: line })) });
        y += height + 10; lines = lines.slice(take);
        if (lines.length) start(title, !!title);
      }
      continue;
    }
    if (b.t === 'table') {
      const rows = (b.rows || []).filter((r) => r?.length);
      if (!rows.length) continue;
      const count = Math.max(...rows.map((r) => r.length)), size = count > 6 ? 11 : 14, col = wide / count, head = Math.min(b.head ?? 1, rows.length - 1);
      const tall = (row) => Math.max(...Array.from({ length: count }, (_, c) => linesOf(textOf(row[c]), size, col - 12))) * size * 1.2 + 8;
      const cell = (runs) => ({ runs: (runs || []).map((r) => style(r, { size })) });
      let rest = rows.slice(head);
      const top = rows.slice(0, head);
      do {
        fit(top.reduce((s, r) => s + tall(r), 0) + (rest[0] ? tall(rest[0]) : 0) + 4);
        const taken = [...top];
        let height = taken.reduce((s, r) => s + tall(r), 0);
        while (rest.length && (height + tall(rest[0]) <= room() || taken.length === top.length)) { height += tall(rest[0]); taken.push(rest.shift()); }
        box = null;
        slide.items.push({ type: 'table', x: SIDE, y, w: wide, h: height, head, size, heights: taken.map(tall), rows: taken.map((r) => Array.from({ length: count }, (_, c) => cell(r[c]))) });
        y += height + 12;
        if (rest.length) start(title, !!title);
      } while (rest.length);
      continue;
    }
    if (b.t === 'img') {
      if (!b.bytes?.length) continue;
      const w = (b.width || 400) * 0.75, h = (b.height || 300) * 0.75;
      fit(Math.min(h, 160));
      const scale = Math.min(1, wide / w, (room() - 4) / h);
      box = null;
      slide.items.push({ type: 'image', x: SIDE + (wide - w * scale) / 2, y, w: w * scale, h: h * scale, bytes: b.bytes, mime: b.mime });
      y += h * scale + 12;
      continue;
    }
    // Paragraphs, and anything this writer doesn't know that still has runs.
    if (b.runs) text(b.runs, { level: b.indent ? Math.min(8, b.indent + 1) : 0, align: b.align });
  }
  if (!slides.length) slides.push({ items: [] });
  return { width: W, height: H, slides };
}
