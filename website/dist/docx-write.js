// Writes a Word file from the block list (docs/conversion-model.md). Lists
// are real Word lists, tables are real tables with a header row, pictures are
// embedded, and code and quotes get their own styles. Nothing identifying is
// written: no author, dates or app name.
import { deflateEntry, writeZip } from './office-zip.js';

const encoder = new TextEncoder();
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
// A4 with one inch margins leaves this much room, in twentieths of a point.
const TEXT_WIDTH = 11906 - 2880, TEXT_HEIGHT = 16838 - 2880;
const MONO = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
const quoteOf = (b) => b.quote || (b.t === 'quote' ? 1 : 0);

export async function toDocx(doc) {
  const links = [], media = [], lists = [];
  let drawing = 0;

  const run = (r, extra = '') => {
    const props = (r.href ? '<w:rStyle w:val="Hyperlink"/>' : '') + (r.code ? MONO : '') + (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '') + (r.s ? '<w:strike/>' : '')
      + (r.color && !r.href ? '<w:color w:val="' + esc(r.color) + '"/>' : '') + (r.size ? '<w:sz w:val="' + Math.round(r.size * 2) + '"/>' : '') + (r.mark ? '<w:highlight w:val="yellow"/>' : '') + (r.u ? '<w:u w:val="single"/>' : '')
      + (r.code ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F0"/>' : '') + (r.sup ? '<w:vertAlign w:val="superscript"/>' : r.sub ? '<w:vertAlign w:val="subscript"/>' : '') + extra;
    const parts = r.text.split('\n').map((line) => line.split('\t').map((t) => t ? '<w:t xml:space="preserve">' + esc(t) + '</w:t>' : '').join('<w:tab/>')).join('<w:br/>');
    const xml = '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '') + parts + '</w:r>';
    if (!r.href) return xml;
    links.push(r.href);
    return '<w:hyperlink r:id="rIdLink' + links.length + '" w:history="1">' + xml + '</w:hyperlink>';
  };
  const runs = (list, extra) => (list || []).map((r) => run(r, extra)).join('');
  const jc = (align) => align === 'center' ? '<w:jc w:val="center"/>' : align === 'right' ? '<w:jc w:val="right"/>' : align === 'justify' ? '<w:jc w:val="both"/>' : '';
  // Paragraph properties have a fixed order in the file format: style, keep,
  // numbering, borders, shading, spacing, indent, alignment.
  const para = (inner, { style = '', num = '', border = '', shade = '', spacing = '', indent = '', align = '' } = {}) => {
    const props = (style ? '<w:pStyle w:val="' + style + '"/>' : '') + num + border + shade + spacing + indent + jc(align);
    return '<w:p>' + (props ? '<w:pPr>' + props + '</w:pPr>' : '') + inner + '</w:p>';
  };
  const quoteProps = (depth) => depth ? { border: '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C8C8C8"/></w:pBdr>', indent: '<w:ind w:left="' + 360 * depth + '"/>' } : {};

  // One Word list per run of list items, so numbering restarts where the
  // source restarted it and each level keeps its own bullet or number.
  const listFor = new Map();
  let open = null;
  doc.blocks.forEach((b, i) => {
    if (b.t === 'li' && b.task === undefined) {
      const top = !(b.depth > 0);
      // A new list starts after other content, when bullets turn into numbers
      // (or back) at the top level, or when the numbers start over.
      if (!open || open.quote !== quoteOf(b) || (top && open.kinds[0] !== undefined && (open.kinds[0] !== !!b.ordered || (b.ordered && b.n <= open.last)))) { open = { id: lists.length + 1, kinds: [], start: [], quote: quoteOf(b) }; lists.push(open); }
      if (top) open.last = b.n;
      const depth = Math.min(b.depth || 0, 8);
      if (open.kinds[depth] === undefined) { open.kinds[depth] = !!b.ordered; open.start[depth] = b.ordered ? (b.n || 1) : 1; }
      listFor.set(i, open);
    } else if (!(b.indent && open) && b.t !== 'li') open = null;
  });

  const picture = (b, maxWidth = TEXT_WIDTH) => {
    const id = ++drawing;
    const name = 'image' + id + (b.mime === 'image/jpeg' ? '.jpeg' : '.png');
    media.push({ name, bytes: b.bytes, mime: b.mime });
    const scale = Math.min(1, (maxWidth * 635) / (b.width * 9525), (TEXT_HEIGHT * 635 * 0.9) / (b.height * 9525));
    const cx = Math.round(b.width * 9525 * scale), cy = Math.round(b.height * 9525 * scale);
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Picture ' + id + '"' + (b.alt ? ' descr="' + esc(b.alt) + '"' : '') + '/>'
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '"/><pic:cNvPicPr/></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="rIdImage' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

  const body = doc.blocks.map((b, i) => {
    const depth = quoteOf(b), q = quoteProps(depth);
    const left = depth * 360 + (b.indent || 0) * 360;
    if (b.t === 'h') return para(runs(b.color || b.size ? b.runs.map((r) => ({ ...r, ...(b.color && !r.color ? { color: b.color } : {}), ...(b.size && !r.size ? { size: b.size } : {}) })) : b.runs), { style: 'Heading' + Math.min(Math.max(b.level, 1), 6), align: b.align, ...q });
    if (b.t === 'li') {
      const level = Math.min(b.depth || 0, 8);
      if (b.task !== undefined) return para(runs([{ text: (b.task ? '☑' : '☐') + '\t' }, ...b.runs]), { style: 'ListParagraph', indent: '<w:ind w:left="' + (720 + level * 360 + depth * 360) + '" w:hanging="360"/>', border: q.border });
      return para(runs(b.runs), { style: 'ListParagraph', num: '<w:numPr><w:ilvl w:val="' + level + '"/><w:numId w:val="' + listFor.get(i).id + '"/></w:numPr>', border: q.border, indent: depth ? '<w:ind w:left="' + (720 + level * 360 + depth * 360) + '" w:hanging="360"/>' : '' });
    }
    if (b.t === 'code') return para(runs([{ text: b.text.replace(/\t/g, '    ') }]), { style: 'Code', indent: left ? '<w:ind w:left="' + left + '"/>' : '' });
    if (b.t === 'hr') return para('', { border: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="AAAAAA"/></w:pBdr>' });
    if (b.t === 'break') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if (b.t === 'img') return para(picture(b, TEXT_WIDTH - left), { align: b.align, indent: left ? '<w:ind w:left="' + left + '"/>' : '', border: q.border });
    if (b.t === 'table') {
      const width = Math.max(1, ...b.rows.map((r) => r.length)), head = b.head ?? 1;
      // Column widths follow the longest line in each column, within limits.
      const weight = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(4, ...b.rows.map((row) => Math.max(...(row[c] || []).map((r) => r.text).join('').split('\n').map((l) => l.length), 0)))));
      const total = weight.reduce((s, w) => s + w, 0);
      const cols = b.widths?.length === width ? b.widths.map((f) => Math.round(TEXT_WIDTH * f)) : weight.map((w) => Math.round(TEXT_WIDTH * w / total));
      return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="' + (b.widths?.length === width ? Math.round(5000 * Math.min(1, b.widths.reduce((a, f) => a + f, 0))) : 5000) + '" w:type="pct"/>' + (left ? '<w:tblInd w:w="' + left + '" w:type="dxa"/>' : '') + '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>' + cols.map((w) => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>'
        + b.rows.map((row, r) => '<w:tr>' + (r < head ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>') + Array.from({ length: width }, (_, c) => {
          const cell = row[c] || [];
          if (cell.merged) return '';
          const span = Math.min(cell.span || 1, width - c);
          const w = cols.slice(c, c + span).reduce((s, x) => s + x, 0);
          return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') + (r < head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '') + '</w:tcPr>'
            + para(runs(r < head ? cell.map((x) => ({ ...x, b: true })) : cell), { style: 'TableText', align: b.align?.[c] }) + '</w:tc>';
        }).join('') + '</w:tr>').join('') + '</w:tbl>' + (doc.blocks[i + 1]?.t === 'table' ? '<w:p/>' : '');
    }
    if (depth) return para(runs(b.runs), { style: 'Quote', align: b.align, ...q, indent: '<w:ind w:left="' + left + '"/>' });
    return para(runs(b.runs), { align: b.align, indent: left ? '<w:ind w:left="' + left + '"/>' : '' });
  }).join('');

  const heading = (n, size, color) => '<w:style w:type="paragraph" w:styleId="Heading' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="' + (n === 1 ? 360 : 280) + '" w:after="100"/><w:outlineLvl w:val="' + (n - 1) + '"/></w:pPr><w:rPr><w:b/><w:color w:val="' + color + '"/><w:sz w:val="' + size + '"/></w:rPr></w:style>';
  const styles = HEAD + '<w:styles xmlns:w="' + W + '"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + [[1, 36, '1B1B1F'], [2, 30, '1B1B1F'], [3, 26, '1B1B1F'], [4, 24, '1B1B1F'], [5, 22, '333333'], [6, 22, '555555']].map(([n, s, c]) => heading(n, s, c)).join('')
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:keepLines/><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="E2E2E0"/><w:left w:val="single" w:sz="4" w:space="6" w:color="E2E2E0"/><w:bottom w:val="single" w:sz="4" w:space="6" w:color="E2E2E0"/><w:right w:val="single" w:sz="4" w:space="6" w:color="E2E2E0"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F5F5F4"/><w:spacing w:before="120" w:after="200" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>' + MONO + '<w:noProof/><w:sz w:val="19"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr></w:style>'
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
    + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/></w:tblBorders></w:tblPr></w:style>'
    + '</w:styles>';

  const BULLETS = ['•', '◦', '▪'], NUMBERS = [['decimal', '%N.']];
  const level = (list, n) => {
    const ordered = list.kinds[n] ?? list.kinds.slice(0, n).reverse().find((k) => k !== undefined) ?? false;
    const [format, text] = ordered ? NUMBERS[0] : ['bullet', BULLETS[n % 3]];
    return '<w:lvl w:ilvl="' + n + '"><w:start w:val="' + (list.start[n] || 1) + '"/><w:numFmt w:val="' + format + '"/><w:lvlText w:val="' + text.replace('N', n + 1) + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + 720 * 0.5 * (n + 2) + '" w:hanging="360"/></w:pPr>' + (ordered ? '' : '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:hint="default"/></w:rPr>') + '</w:lvl>';
  };
  const numbering = HEAD + '<w:numbering xmlns:w="' + W + '">'
    + lists.map((list) => '<w:abstractNum w:abstractNumId="' + list.id + '"><w:multiLevelType w:val="hybridMultilevel"/>' + Array.from({ length: 9 }, (_, n) => level(list, n)).join('') + '</w:abstractNum>').join('')
    + lists.map((list) => '<w:num w:numId="' + list.id + '"><w:abstractNumId w:val="' + list.id + '"/></w:num>').join('') + '</w:numbering>';

  const types = new Set(media.map((m) => m.mime));
  const entries = new Map();
  const add = async (name, content) => deflateEntry(entries, name, typeof content === 'string' ? encoder.encode(content) : content);
  await add('[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + (types.has('image/png') ? '<Default Extension="png" ContentType="image/png"/>' : '') + (types.has('image/jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '')
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + (lists.length ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : '') + '</Types>');
  await add('_rels/.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  await add('word/document.xml', HEAD + '<w:document xmlns:w="' + W + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + (body || '<w:p/>')
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>');
  await add('word/styles.xml', styles);
  if (lists.length) await add('word/numbering.xml', numbering);
  await add('word/_rels/document.xml.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + (lists.length ? '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : '')
    + media.map((m, i) => '<Relationship Id="rIdImage' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>').join('')
    + links.map((href, i) => '<Relationship Id="rIdLink' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + esc(href) + '" TargetMode="External"/>').join('') + '</Relationships>');
  for (const m of media) await add('word/media/' + m.name, m.bytes);
  return writeZip(entries);
}
