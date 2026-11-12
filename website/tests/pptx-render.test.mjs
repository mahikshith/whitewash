import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { deflateEntry, writeZip } from '../dist/office-zip.js';
import { parsePptx, pptxToPdf } from '../dist/pptx-render.js';
import { PDFDocument } from '../dist/vendor/pdf-lib.esm.min.js';
import * as libs from './helpers/node-libs.mjs';

globalThis.DOMParser = DOMParser;
const encoder = new TextEncoder();
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const rels = (...list) => '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}${type}" Target="${target}"/>`).join('') + '</Relationships>';
const nv = (id, ph = '') => `<p:nvSpPr><p:cNvPr id="${id}" name="s${id}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>`;
const xfrm = (x, y, w, h, extra = '') => `<a:xfrm${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
const tree = (inner) => `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:spTree></p:cSld>`;
const para = (text, pPr = '', rPr = '') => `<a:p>${pPr}<a:r>${rPr}<a:t>${text}</a:t></a:r></a:p>`;
const body = (inner, bodyPr = '<a:bodyPr/>') => `<p:txBody>${bodyPr}<a:lstStyle/>${inner}</p:txBody>`;

const theme = `<a:theme ${NS} name="t"><a:themeElements><a:clrScheme name="c">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
<a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>
<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>
<a:fontScheme name="f"><a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="x"/></a:themeElements></a:theme>`;
// The master swaps light and dark, puts a logo bar on every slide and styles titles and body text.
const master = `<p:sldMaster ${NS}>${tree(
  `<p:sp>${nv(2, '<p:ph type="title"/>')}<p:spPr>${xfrm(457200, 274638, 8229600, 1143000)}</p:spPr>${body(para('Master title'), '<a:bodyPr anchor="ctr"><a:normAutofit/></a:bodyPr>')}</p:sp>` +
  `<p:sp>${nv(3, '<p:ph type="body" idx="1"/>')}<p:spPr>${xfrm(457200, 1600200, 8229600, 4525963)}</p:spPr>${body(para('Master body'))}</p:sp>` +
  `<p:sp>${nv(4)}<p:spPr>${xfrm(0, 6731000, 9144000, 127000)}<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:spPr></p:sp>`)}
<p:clrMap bg1="dk1" tx1="lt1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buChar char="&#8226;"/><a:defRPr sz="3200"/></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750"><a:buChar char="&#8211;"/><a:defRPr sz="2800"/></a:lvl2pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`;
// The layout moves the body placeholder and makes its first level smaller.
const layout = `<p:sldLayout ${NS}>${tree(
  `<p:sp>${nv(2, '<p:ph type="title"/>')}<p:spPr/>${body(para('Layout title'))}</p:sp>` +
  `<p:sp>${nv(3, '<p:ph idx="1"/>')}<p:spPr>${xfrm(914400, 1828800, 7315200, 3657600)}</p:spPr><p:txBody><a:bodyPr lIns="0"/><a:lstStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></a:lstStyle>${para('Layout body')}</p:txBody></p:sp>`)}</p:sldLayout>`;
const slide1 = `<p:sld ${NS}>${tree(
  `<p:sp>${nv(2, '<p:ph type="title"/>')}<p:spPr/>${body(para('Hello'))}</p:sp>` +
  `<p:sp>${nv(3, '<p:ph idx="1"/>')}<p:spPr/>${body(para('One') + para('Two', '<a:pPr lvl="1"/>') + para('First', '<a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>') + para('Second', '<a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>') + para('Plain', '<a:pPr><a:buNone/></a:pPr>', '<a:rPr sz="1200" b="1" i="1"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:rPr>'))}</p:sp>`)}</p:sld>`;
const slide2 = `<p:sld ${NS} showMasterSp="0">${tree(
  `<p:sp>${nv(5)}<p:spPr>${xfrm(1270000, 635000, 2540000, 1270000, ' rot="5400000"')}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 25000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr></a:solidFill><a:ln w="25400"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:ln></p:spPr></p:sp>` +
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="6" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1270000" y="2540000"/><a:ext cx="2540000" cy="1270000"/><a:chOff x="0" y="0"/><a:chExt cx="5080000" cy="2540000"/></a:xfrm></p:grpSpPr>` +
  `<p:sp>${nv(7)}<p:spPr>${xfrm(2540000, 1270000, 2540000, 1270000)}<a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></p:spPr></p:sp></p:grpSp>` +
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="8" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="127000" y="4445000"/><a:ext cx="5080000" cy="762000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>` +
  `<a:tblGrid><a:gridCol w="2540000"/><a:gridCol w="1270000"/><a:gridCol w="1270000"/></a:tblGrid>` +
  `<a:tr h="381000"><a:tc gridSpan="2"><a:txBody><a:bodyPr/><a:lstStyle/>${para('Head')}</a:txBody><a:tcPr/></a:tc><a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para('H3')}</a:txBody><a:tcPr/></a:tc></a:tr>` +
  `<a:tr h="381000"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para('A')}</a:txBody><a:tcPr><a:lnB w="25400"><a:solidFill><a:srgbClr val="112233"/></a:solidFill></a:lnB><a:solidFill><a:srgbClr val="FFE080"/></a:solidFill></a:tcPr></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para('B')}</a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para('C')}</a:txBody><a:tcPr/></a:tc></a:tr>` +
  `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>` +
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="c"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="6350000" y="635000"/><a:ext cx="2540000" cy="1270000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>`)}</p:sld>`;
const hidden = `<p:sld ${NS} show="0">${tree(`<p:sp>${nv(2)}<p:spPr>${xfrm(0, 0, 127000, 127000)}</p:spPr>${body(para('Secret'))}</p:sp>`)}</p:sld>`;
const presentation = `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId4"/><p:sldId id="258" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/>
<p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`;

// Slides are listed out of file order on purpose: rId3 (slide2.xml) comes first.
async function deck() {
  const parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    '_rels/.rels': rels(['rId1', 'officeDocument', 'ppt/presentation.xml']),
    'ppt/presentation.xml': presentation,
    'ppt/_rels/presentation.xml.rels': rels(['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'slide', 'slides/slide2.xml'], ['rId4', 'slide', 'slides/slide3.xml']),
    'ppt/slides/slide1.xml': slide1, 'ppt/slides/slide2.xml': slide2, 'ppt/slides/slide3.xml': hidden,
    'ppt/slides/_rels/slide1.xml.rels': rels(['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']),
    'ppt/slides/_rels/slide2.xml.rels': rels(['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']),
    'ppt/slides/_rels/slide3.xml.rels': rels(['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']),
    'ppt/slideLayouts/slideLayout1.xml': layout,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels(['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']),
    'ppt/slideMasters/slideMaster1.xml': master,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels(['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']),
    'ppt/theme/theme1.xml': theme,
  };
  const entries = new Map();
  for (const [name, text] of Object.entries(parts)) await deflateEntry(entries, name, encoder.encode(text));
  return writeZip(entries, true);
}
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 0.01, `${message}: ${a} is not ${b}`);

test('slides come in presentation order, in points, without hidden ones', async () => {
  const parsed = await parsePptx(await deck());
  assert.equal(parsed.width, 720);
  assert.equal(parsed.height, 540);
  assert.equal(parsed.slides.length, 2, 'the show="0" slide is dropped');
  assert.equal(parsed.slides[0].items[0].geom, 'roundRect', 'slide2.xml is first in sldIdLst');
});

test('shape geometry, rotation, fills and theme colours', async () => {
  const [first] = (await parsePptx(await deck())).slides;
  const [box, oval] = first.items;
  assert.deepEqual([box.x, box.y, box.w, box.h, box.rot], [100, 50, 200, 100, 90]);
  assert.deepEqual(box.adj, { adj: 25000 });
  assert.deepEqual(box.fill, { type: 'solid', color: 'FF0000', alpha: 0.5 });
  assert.equal(box.line.width, 2);
  assert.equal(box.line.color, '000000', 'bg1 goes through the master colour map to dk1');
  assert.deepEqual(first.background, { type: 'solid', color: 'FFFFFF', alpha: 1 });
  assert.equal(oval.geom, 'ellipse');
  assert.deepEqual([oval.x, oval.y, oval.w, oval.h], [200, 250, 100, 50], 'group children are scaled into the group box');
  assert.ok(!first.items.some((item) => item.fill?.color === 'C0504D'), 'showMasterSp="0" hides the master bar');
});

test('placeholders inherit position, sizes, alignment and bullets', async () => {
  const slide = (await parsePptx(await deck())).slides[1];
  const [bar, title, content] = slide.items;
  assert.equal(bar.fill.color, 'C0504D', 'the master bar is drawn first');
  near(bar.y, 530, 'bar position');
  assert.deepEqual([title.x, title.w], [36, 648], 'title box comes from the master');
  near(title.y, 21.625, 'title y');
  const heading = title.text.paragraphs[0];
  assert.equal(heading.runs[0].text, 'Hello');
  assert.equal(heading.runs[0].size, 44);
  assert.equal(heading.align, 'ctr');
  assert.equal(heading.runs[0].color, 'FFFFFF', 'tx1 is mapped to lt1');
  assert.equal(heading.runs[0].font, 'Cambria', 'the major theme font');
  assert.equal(title.text.anchor, 'ctr');
  assert.equal(title.text.fit, 'shrink');
  assert.equal(heading.bullet, null);

  assert.deepEqual([content.x, content.y, content.w, content.h], [72, 144, 576, 288], 'body box comes from the layout');
  assert.deepEqual(content.text.insets, [0, 3.6, 7.2, 3.6], 'layout sets lIns, the rest are defaults');
  const [one, two, first, second, plain] = content.text.paragraphs;
  assert.equal(one.runs[0].size, 20, 'the layout list style beats the master');
  assert.equal(one.bullet.text, '•');
  assert.deepEqual([one.marL, one.indent], [27, -27]);
  assert.deepEqual(one.before, { pct: 0.2 });
  assert.equal(two.runs[0].size, 28, 'level two comes from the master');
  assert.equal(two.bullet.text, '–');
  near(two.marL, 58.5, 'level two margin');
  assert.deepEqual([first.bullet.text, second.bullet.text], ['1.', '2.']);
  assert.equal(plain.bullet, null);
  const run = plain.runs[0];
  assert.deepEqual([run.size, run.bold, run.italic, run.font], [12, true, true, 'Calibri']);
  assert.equal(run.color, '376092', 'accent1 darkened by lumMod 75%');
});

test('tables: grid, merged cells, fills and borders', async () => {
  const table = (await parsePptx(await deck())).slides[0].items.find((item) => item.type === 'table');
  assert.deepEqual(table.cols, [200, 100, 100]);
  assert.deepEqual(table.rows.map((row) => row.h), [30, 30]);
  const [head, covered, h3] = table.rows[0].cells, [a, b] = table.rows[1].cells;
  assert.deepEqual([head.col, head.span, covered.merged, h3.col], [0, 2, true, 2]);
  assert.equal(covered.text, null);
  assert.equal(head.text.paragraphs[0].runs[0].text, 'Head');
  assert.equal(head.fill.color, '4F81BD', 'header row of the default table style');
  assert.equal(head.text.paragraphs[0].runs[0].bold, true);
  assert.equal(a.fill.color, 'FFE080', 'the cell\'s own fill wins');
  assert.deepEqual([a.borders.b.color, a.borders.b.width], ['112233', 2]);
  assert.equal(b.fill.color, 'D0D8E8', 'banded row: accent1 at 40% tint');
  assert.equal(b.text.paragraphs[0].runs[0].size, 18);
  const chart = (await parsePptx(await deck())).slides[0].items.find((item) => item.type === 'frame');
  assert.deepEqual([chart.label, chart.x, chart.w], ['Chart', 500, 200]);
});

test('the PDF has one page per shown slide at the slide size, and no metadata', async () => {
  const seen = [];
  const bytes = await pptxToPdf(await deck(), libs, (n, total) => seen.push(n + '/' + total));
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), '%PDF-');
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[720, 540], [720, 540]]);
  assert.deepEqual(seen, ['1/2', '2/2']);
  for (const value of [pdf.getProducer(), pdf.getCreator(), pdf.getAuthor(), pdf.getCreationDate(), pdf.getModificationDate()]) assert.equal(value, undefined);
});

test('a file that is not a presentation is refused with a plain message', async () => {
  const entries = new Map();
  await deflateEntry(entries, 'word/document.xml', encoder.encode('<w:document/>'));
  await assert.rejects(parsePptx(writeZip(entries, true)), /readable \.pptx/);
  await assert.rejects(parsePptx(new Uint8Array(40)), /damaged/);
});
