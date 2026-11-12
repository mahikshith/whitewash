# Conversion teardown: how good open-source converters keep formatting

Written 2026-11-12 for the whitewash converter rewrite. Reference repos were cloned shallow and read, not run. We reimplement mechanics and copy no code. File paths below are relative to each repo root.

## 0. Where whitewash loses formatting today

Read from `website/dist/conv-doc.js` and `conv-ocr.js` (not edited).

- Every input is flattened to one block model: `h / p / li / code / quote / hr / table`, with runs that carry only `b`, `i`, `code`, `href`. No colour, size, font, alignment, underline, images, or positions. Anything not in the model is gone before a writer sees it.
- `htmlFromPptx` collects every `a:t` on a slide and calls the first paragraph the title. No placeholders, no reading order, no tables, no pictures, no notes.
- `blocksFromPdfText` groups pdf.js items by y, sorts by x, and guesses headings from size. It does not detect columns, tables, bold, italic or colour. Two-column pages get interleaved.
- `toDocx` writes lists as a typed "1.\t" or bullet character plus an indent. Word does not see a list. There is no `numbering.xml`.
- `toPdf` lays out with three Noto faces, no italic face, no images, no nested table content, and replaces CJK with "?".
- There is no PPTX writer at all. PDF to PPTX does not exist.
- OCR keeps `data.text` and Tesseract's own PDF. Word boxes, lines and paragraphs are thrown away.

The common fault: one lossy model for both flow documents and fixed-layout pages. Every good project below keeps two models, a flow model (blocks with styles) and a page model (absolutely placed objects), and picks by target.

## 1. PPT Master (hugohe3/ppt-master)

**What it is.** An AI deck generator. The interesting part is its deterministic compiler: SVG pages in, natively editable PPTX out, plus a reverse importer PPTX to SVG. **Licence: MIT.** Python, uses PyMuPDF (AGPL) and mammoth for intake only.

**Source intake** (`skills/ppt-master/scripts/source_to_md/`).
- `pdf_to_md.py`: PyMuPDF text dict. Builds a font-size histogram for heading levels, reads span flags for bold/italic, detects list prefixes, strips repeating headers/footers found in the top and bottom 15% band, finds ruled tables with PyMuPDF and borderless ones by clustering word x positions, merges tables that continue across pages.
- `doc_to_md.py`: mammoth to HTML to Markdown, with its own passes for tables, charts, OMML maths to LaTeX, footnotes and image occurrences (with display size in EMU).
- Intake goes to Markdown plus JSON side files. Layout is not carried through Markdown. The deck layout is authored fresh as SVG. So the "right mechanism" is not the intake. It is the SVG to DrawingML compiler.

**The intermediate form.** A closed SVG dialect, one file per slide, px units at 96 dpi. Only elements with a registered DrawingML mapping are allowed. A checker rejects the rest. The compiler never guesses. (`docs/technical-design.md`, `scripts/docs/svg-contract.md`.)

**SVG to DrawingML** (`scripts/svg_to_pptx/drawingml/`). One small translator per element kind (`elements.py`), no whole-page optimiser.
- Units (`utils.py`): 1 px = 9525 EMU. Font px to `sz` is px x 75 (hundredths of a point), rounded to 0.1 pt. Angles are degrees x 60000. Alpha is 0..100000.
- `rect` goes to `prstGeom rect`, or `roundRect`, or a custom geometry when rx and ry differ. `circle`/`ellipse` go to `prstGeom ellipse`. `line` goes to a connector. `path`, `polygon`, `polyline` go to `a:custGeom`.
- Paths (`paths.py`): parse `d`, make absolute, turn quadratics and arcs into cubics, compute the bounding box, then write `a:moveTo / a:lnTo / a:cubicBezTo / a:close` with points in EMU relative to the box corner. The box becomes `a:xfrm`.
- Fills (`styles.py`): solid to `a:solidFill/a:srgbClr` with `a:alpha`. Gradients to `a:gradFill` with `a:gsLst` stops. Stroke to `a:ln` with width, dash, cap, and arrow heads from SVG markers. Drop shadow filter to an outer shadow, glow to `a:glow`.
- Images (`convert_image`): `p:pic` with `a:blip r:embed`, `a:stretch/a:fillRect`, `a:picLocks noChangeAspect="1"`. Opacity is `a:alphaModFix` inside the blip. `preserveAspectRatio slice` becomes `a:srcRect` (crop metadata, pixels kept). `meet` shrinks the frame to the image aspect. A clip-path becomes the picture's geometry. Images are downscaled to the displayed size before embedding. EMF/WMF are embedded as is.

**Text boxes** (`convert_text` in `elements.py`). This is the part to copy in spirit.
- Each SVG `<text>` becomes one `p:sp` with `p:cNvSpPr txBox="1"`, `prstGeom rect`, `a:noFill`, and `a:ln` with `a:noFill`.
- Single line label: `<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0"><a:spAutoFit/></a:bodyPr>`. No wrap means a slightly wrong width estimate cannot reflow the line.
- Paragraph block (tspans tagged with a line height): `wrap="square"`, zero insets, `a:noAutofit`, and every `a:p` gets `<a:lnSpc><a:spcPts val="lineHeightPx x 75"/></a:lnSpc>`. Extra gaps go in `a:spcBef/a:spcPts`. Fixed point line spacing is what keeps lines where the source had them.
- Soft-wrapped source lines are joined into one paragraph with a space (no space at CJK boundaries). Hard breaks become `a:br`.
- Box origin: `x` from the anchor (start, middle, end map to `algn` l, ctr, r), `y = baseline - firstLineAscent`. Width is measured text width plus padding on both sides, padding = clamp(0.04 x size, 0.5, 2) px. Height is 1.5 x size for one line, or the sum of line advances plus 1.5 x size for the last.
- First baseline offset (`text_baseline.py`): PowerPoint's natural line is 1.2 x size. Ascent share is `ascent / (ascent + descent)` from the font's OS/2 table (typo metrics if fsSelection bit 7 is set, else win metrics), 0.8 for unknown fonts. PowerPoint rounds the result to whole points. With fixed spacing S: if S <= natural, baseline = max(0.75 S, S - (natural - baseline)), else 0.75 S. They ship `font_metrics.json` with these numbers per family.
- Width (`font_advances.json`): per-glyph advances in em for common fonts, CJK counted as 1 em, monospace as 0.6 em, then headroom of 6% (12% for all caps), 12% to 36% for serif, because the target machine may substitute a wider font.
- Runs: `<a:rPr lang sz b i u="sng" strike="sngStrike" spc baseline dirty="0">` then, in schema order, optional `a:ln`, `a:solidFill`, effects, `a:latin`, `a:ea`, `a:cs`, `a:hlinkClick`. All three typeface slots are always written. `spc` is letter spacing in hundredths of a point. RTL text adds `a:rtl`.
- Bullets: a leading bullet glyph is stripped from the text and turned into `a:pPr marL indent(negative)` plus `a:buClr`, `a:buSzTx`, `a:buFontTx`, `a:buChar`.
- Rotation: `a:xfrm rot`, with the offset recomputed so the box centre lands where the SVG rotation put it. Off/ext describe the unrotated box.

**Reverse direction** (`scripts/pptx_to_svg/`), useful for PPTX to PDF.
- `shape_walker.py`: placeholder lookup key is (type, idx) with schema defaults type "obj", idx "0". Tables are built layout first, master second, first writer wins. Lookup order: (type, idx), then (type), then (idx). Geometry, `bodyPr` and `lstStyle` each have their own table. Master `p:txStyles` is appended last: titleStyle for title/ctrTitle, bodyStyle for body-like types, otherwise otherStyle.
- `txbody_to_svg.py`: default insets 91440 / 45720 EMU, default size 18 pt, default leading 1.2. Run properties resolve through rPr, endParaRPr, pPr defRPr, lstStyle level defRPr, then inherited. `normAutofit` is honoured by multiplying sizes by `fontScale` and line spacing by `1 - lnSpcReduction`. It does its own word wrap with estimated widths, then anchors t/ctr/b.
- `color_resolver.py`: scheme colour through the clrMap, then modifiers in document order in HSL: tint, shade, lumMod, lumOff, satMod, alpha and so on.

**What whitewash should take.**
1. A page model in px (text, rect, path, image, group) as the hub for PDF to PPTX and PPTX to PDF. It can be plain JS objects. It does not need to be SVG text.
2. The text box recipe above, almost verbatim in mechanics: zero insets, `wrap="none"` + `spAutoFit` for single lines, `wrap="square"` + `noAutofit` + `lnSpc spcPts` for paragraphs, baseline minus ascent for the top.
3. Per-element translators and a strict allow-list. Unsupported things fall back to a picture of that region, not a broken shape.
4. A small font metrics table (ascent share, average advance) for the fonts we emit. In a browser, canvas `measureText` or the pdf.js item width gives real widths, so the advance table is only a fallback.

## 2. pdf2docx (dothinking/pdf2docx)

**What it is.** PDF to DOCX by rebuilding layout from coordinates. **Licence: MIT** (README says it was relicensed; LICENSE now names Artifex). It still depends on PyMuPDF, which is AGPL, so we take ideas only. Python.

**Pipeline** (`pdf2docx/converter.py`, `page/RawPage.py`, `layout/`, `text/`, `table/`, `shape/`).
1. Raw extraction: text spans (bbox, font, size, colour int, flags), images, and vector paths split into strokes (thin rects) and fills.
2. Clean up: drop lines overlapping others by more than 90%, drop shapes under 2 pt, treat an image overlapping text as floating.
3. Margins: the bbox of all content against the page box, capped at 1 inch, top and bottom halved to leave slack.
4. Sections and columns (`RawPage.parse_section`): group lines into rows by y overlap, group each row into columns by x gaps. Only one or two columns are accepted. Two columns must have a width ratio within 2:1 and text filling at least a third of each. A change in column count closes the section. Sections shorter than 20 pt are folded back. Output is a Word section with `w:cols`.
5. Tables first (`table/TablesConstructor.py`, `TableStructure.py`).
   - Lattice: group connected strokes, split into horizontal and vertical, snap to shared coordinates, build the grid of all x and y, and for each cell edge test whether a stroke covers it. A missing inner edge means a merged cell. Fills inside a cell become shading. Border width and colour come from the stroke.
   - Stream (borderless): take lines that sit in the same row but far apart in x, propose virtual borders in the gaps, recurse into each column to find rows. A setting stops bullet lists being taken for tables.
6. Paragraphs (`layout/Blocks.py`): take the most common vertical gap as the reference line spacing. A line joins the current block if its gap is within 1 pt of that and under 1.5 x line height. Then split blocks at sentence-ending punctuation when the line ends well short of the right edge.
7. Inline format (`text/TextSpan.py`, `text/Lines.py`): flags bit 0 superscript, bit 1 italic, bit 4 bold. Colour from the span. Thin rects near a span are classified by position: near the bottom is underline, near the middle is strike-through, covering the height and not white is highlight. Spans are split at the rect edges.
8. Spacing (`text/TextBlock.py`): alignment from comparing line x0, x1 and centres within 1 to 2 pt. Left indent, right indent and first-line indent from the block bbox against the column. Tab stops where one line has x gaps. Line spacing is either relative (block height over the sum of natural line heights, minimum 1.02) or exact (`(blockHeight - firstLine) / (rows - 1)` with space-before corrected). Space-before is the gap to the previous block.
9. DOCX output (`common/docx.py`): explicit paragraph properties on every paragraph, character scaling and spacing, floating pictures with anchors, cell margins, borders, shading.

**What whitewash should take.** Steps 4 to 8 map directly onto pdf.js data. Order matters: margins, then tables, then columns, then paragraphs, then inline styles. Write exact indents and spacing on each paragraph. Keep the column limit at two; three and more is where it breaks.

## 3. MarkItDown (microsoft/markitdown)

**What it is.** Anything to Markdown for LLM input. **Licence: MIT.** Python. It keeps structure, not appearance.

**Mechanism** (`packages/markitdown/src/markitdown/converters/`).
- `_pptx_converter.py`: python-pptx. Per slide it writes a `<!-- Slide number: n -->` comment, sorts shapes by (top, left), recurses into groups with the same sort, and emits: the title placeholder as `# `, text frames as plain text, tables as Markdown tables (via HTML), charts as a data table of categories and series, pictures as `![alt](name)` using the shape's `descr` alt text, and speaker notes under `### Notes:` only when non-empty.
- `_docx_converter.py`: mammoth to HTML to Markdown, after a pre-pass that turns OMML maths into LaTeX (`converter_utils/docx/pre_process.py`). Honours an embedded mammoth style map.
- `_pdf_converter.py`: pdfplumber words with x/y tolerance 3, grouped into rows by y. Columns are found by clustering word x starts (20 pt tolerance). Rows that align with two or more global columns become table rows. If no page looks like a form or table it falls back to pdfminer plain text. No headings, no bold.
- `_xlsx_converter.py`: each sheet becomes `## SheetName` and a Markdown table.

**What whitewash should take.** For PPTX to text formats: reading order by (top, left), title from the title placeholder not the first paragraph, tables, notes, alt text. Cheap to do and much better than today's `a:t` dump. Nothing here helps visual fidelity.

## 4. PPTXjs (meshesha/PPTXjs)

**What it is.** PPTX to HTML viewer in browser JS (jQuery, JSZip, d3). **Licence: MIT.** One 14k-line file, `js/pptxjs.js`. Messy, but it shows the whole inheritance chain in JS.

**Mechanism.**
- Scale: `slideFactor = 96 / 914400` (EMU to px). Slide size from `p:sldSz` in `presentation.xml`.
- For each slide it loads slide, its layout (via slide rels), the layout's master, and the master's theme. `indexNodes` builds three tables per layout and per master: by shape id, by placeholder `idx`, by placeholder `type`.
- `processSpNode`: if the slide shape has `idx`, the layout shape is `layout.idxTable[idx]` and the master shape is `master.typeTable[type]` when type is known, else `master.idxTable[idx]`. If it only has `type`, both come from the type tables. That is the practical rule: idx links slide to layout, type links layout to master.
- `getPosition` / `getSize`: first `a:xfrm` found on slide, then layout, then master. Groups (`chOff`, `chExt`) rescale children.
- `getFontSize`: run `rPr sz`, then the shape's own `lstStyle` level, then layout placeholder `lstStyle`, then master placeholder `lstStyle`, then master `p:txStyles` (titleStyle, bodyStyle or otherStyle by type), then `presentation.xml` `defaultTextStyle`. Level key is `a:lvl{n+1}pPr`. Then multiply by `normAutofit fontScale`.
- Bullets (`genBuChar`): `buNone`, `buChar`, `buAutoNum`, `buBlip` looked up on the paragraph, then lstStyle, layout, master in the same order. Wingdings and Symbol bullet glyphs are mapped to Unicode (`dingbat.js`). Numbering counters are kept per level.
- Colours (`getSchemeColorFromTheme`): map `tx1/tx2/bg1/bg2` through the slide's `clrMapOvr`, else the layout's, else the master's `clrMap`, then read the theme `clrScheme` entry (`srgbClr val` or `sysClr lastClr`). Then tint, shade, lumMod, lumOff, alpha. `phClr` is replaced by the colour of the referencing style.
- Fonts: `+mj-lt` / `+mn-lt` resolve to the theme major and minor fonts.
- Text is laid out by the browser as HTML in an absolutely positioned div, with vertical anchor via flex. It ignores exact line breaking.

**What whitewash should take.** The lookup tables and the five-step style chain. Do it once into a resolved page model (every shape with final xfrm, every run with final size, font, colour) and render from that. Do not copy its HTML output path; we draw to PDF.

## 5. PDF to PPTX projects

- **kevinmcguinness/pdf2pptx** (MIT, Python, PyMuPDF + python-pptx). One PNG per page, placed full-bleed on a blank slide, slide size set from the page aspect. Faithful and not editable. This is the baseline fallback.
- **zhangqiyuan24/pdf2pptx** (MIT, Node, uses mupdf.js which is AGPL). Two steps, same shape as PPT Master. `pdf2svg.mjs` runs the page through a MuPDF device and records fill paths, stroke paths, text runs (per glyph positions, font, colour, rotation) and images into SVG. `svg2pptx.mjs` turns paths into `custGeom`, images into `p:pic`, and text into text boxes. Text: glyphs are clustered into rows by y (tolerance 0.55 x size), split into separate boxes where the x gap exceeds 1.2 x size, box top at baseline minus 0.85 x size, height 1.1 x size, `wrap="none"`, zero insets. One box per run, so text is editable but paragraphs are not reflowable.
- **terryfurqan/pdf2pptx** (MIT, Python, PyMuPDF). The better text model. Slide size equals page size. Layer 0: vector rules and filled panels as shapes. Layer 1: pictures as picture shapes, and each PDF text block as one text box. Inside a block: cluster spans by baseline, measure real line spacing from baselines, start a new paragraph on terminal punctuation plus a short line, a list prefix, or a larger baseline gap. Detect alignment from line edges. Decode ligatures and remove end-of-line hyphens. Map PDF font names to installed families.

**What whitewash should take.** Three modes, chosen per page: (a) editable: shapes + pictures + one text box per paragraph block; (b) hybrid: page rendered without text as a background picture, real text boxes on top; (c) picture only. Hybrid is the safe default for pages with heavy vector art. Hybrid needs a render of the page with the text left out, otherwise the text shows twice. With pdf.js that means filtering text operators out of the operator list before painting; check this is workable in the vendored version before committing to it.

## 6. DOCX readers and pandoc's list writer

- **mammoth.js** (BSD-2-Clause, already vendored). Semantic only. `lib/docx/numbering-xml.js` resolves `numId` + `ilvl` through `w:num` to `w:abstractNum`, follows `numStyleLink`, and reports only ordered or not. It drops colour, size, alignment, spacing, tabs, page setup. Good for DOCX to Markdown. Wrong tool for DOCX to PDF.
- **docx-preview / docxjs** (VolodymyrBaydalka/docxjs, Apache-2.0). `src/document-parser.ts` and `src/html-renderer.ts`. Resolves `basedOn` style chains, theme fonts and colours, numbering as CSS counters (reset on lower levels, start values, bullet pictures), tab stops, sections with page size and margins, headers and footers, and breaks pages on explicit breaks and `w:lastRenderedPageBreak`. This is the model for a faithful DOCX reader. Apache-2.0, so it could be vendored to produce styled HTML (size not checked).
- **pandoc docx writer** (GPL-2.0-or-later, ideas only; `src/Text/Pandoc/Writers/Docx.hs` and `Docx/OpenXML.hs`).
  - One `w:abstractNum` per distinct marker kind, `w:multiLevelType multilevel`, levels 0 to 8, each with `w:numFmt`, `w:lvlText`, `w:lvlJc left`, and `w:ind w:left = 720 x (lvl + 1)`, `w:hanging = 360`.
  - Bullets by level: Symbol U+F0B7, Courier New "o", Wingdings U+F0A7, repeating. The level `w:rPr` sets `w:rFonts` to that font.
  - Ordered defaults by level: decimal, lowerLetter, lowerRoman, repeating. `lvlText` is `%1.` , `%2.` and so on.
  - Every list in the document gets its own `w:num` (ids from 1000) pointing at the shared abstract. Ordered lists add `w:lvlOverride` + `w:startOverride` for every level, which is what restarts numbering at each new list.
  - The first paragraph of an item gets `<w:numPr><w:ilvl/><w:numId/></w:numPr>`. Later paragraphs in the same item get only `w:ind w:left` so they align without a second number. Tight lists use a `Compact` paragraph style with small spacing.
  - Task list items use a bullet level whose text is U+2610 or U+2612.

## 7. Browser constraints and what they allow

- pdf.js `getTextContent` gives per item: string, transform (so position, size, rotation), width, `fontName`, `hasEOL`. Its `styles[fontName]` gives family, ascent, descent. It does not give colour. Colour and exact font come from `getOperatorList` (fill colour ops before each text op) and `page.commonObjs.get(fontName)` (real PostScript name, bold/italic flags). Verify the exact fields against the vendored pdf.js version; the operator list format changed between 4 and 5 for paths.
- Ruling lines, rect fills and images also come from the operator list (construct path, fill, stroke, paint image ops) with the current transform tracked by hand.
- Tesseract.js can return blocks, paragraphs, lines and words with bboxes, baselines and confidence, and hOCR. In v6 this must be requested in the output options; the default is text only.
- No layout engine for DOCX or PPTX exists in pure JS at LibreOffice quality. We lay out ourselves with fontkit metrics and pdf-lib drawing. That is fine for PPTX (absolute boxes) and acceptable for DOCX if we resolve styles properly.
- Fonts are the hard limit. We cannot read installed fonts. Ship metric-compatible open fonts (Carlito for Calibri, Liberation Sans/Serif/Mono for Arial/Times/Courier, Noto Sans CJK subset on demand) and map names. Embedded fonts in a PPTX/DOCX are rare and often obfuscated; ignore them.

## 8. Prioritised techniques per conversion

### Markdown to DOCX
1. Real lists: write `word/numbering.xml` as pandoc does (section 6). One abstract for bullets, one for ordered, a fresh `w:num` with start overrides per list, `numPr` on the first paragraph of each item only.
2. Use `marked`'s token tree, not rendered HTML, so nesting, tight/loose, task items, table alignment and code language survive.
3. Inline styles as run properties: bold, italic, strike (`w:strike`), inline code as a character style with shading, links as `w:hyperlink` with the Hyperlink style, line breaks as `w:br`.
4. Tables: `w:tblGrid` with real column widths (share page width by content length), header row with `w:tblHeader`, cell alignment from the Markdown colons via `w:jc`, cell paragraphs keep their runs.
5. Images: fetch-free only (data URIs and user-supplied files). Embed as inline `w:drawing` with `wp:inline`, size in EMU capped to the text width.
6. Styles: Title, Heading 1 to 6 with `w:outlineLvl`, Block Text for quotes with a left border, Source Code as a paragraph style with one paragraph per block using `w:br` and `xml:space="preserve"`, footnotes if the dialect has them.

### Markdown to PDF
1. Same token tree. Lay out with a proper line breaker on fontkit advances: per-run fonts, mixed sizes on one line, baseline alignment.
2. Embed regular, bold, italic, bold-italic and mono. Add a CJK fallback font loaded only when needed, chosen per character, so "?" replacement goes away.
3. Lists with hanging indents and correct nested numbering. Code blocks with a filled background rect, kept together when short. Block quotes with a left rule.
4. Tables: column widths from content with min and max, wrapped cell text, repeated header row on page break, per-column alignment.
5. Images scaled to the content width. Link annotations for real clickable links. PDF outline (bookmarks) from headings.
6. Widow and orphan control and keep-with-next for headings.

### DOCX to PDF
1. Stop going through mammoth for this path. Read `document.xml`, `styles.xml`, `numbering.xml`, `theme1.xml`, `settings.xml` and resolve as docxjs does: docDefaults, then `basedOn` chain, then paragraph style, then direct properties. Same for runs.
2. Page setup from `w:sectPr`: size, margins, columns, headers and footers.
3. Paragraph properties that matter most, in order: alignment, indents, spacing before/after, line spacing (auto vs exact), tab stops, keep-next, page-break-before.
4. Run properties: font (mapped to a shipped metric-compatible face), size, bold, italic, underline, strike, colour, highlight, super/subscript.
5. Numbering: compute the label text from `lvlText` and counters per `numId`/`ilvl`, honour start overrides.
6. Tables with `gridCol` widths, merged cells (`gridSpan`, `vMerge`), borders and shading. Inline and anchored images from `word/media`.
7. Honour explicit page breaks and use `w:lastRenderedPageBreak` as a hint only.

### PPTX to PDF
1. PDF page size equals `p:sldSz` in points (EMU / 12700). One slide per page.
2. Build layout and master lookup tables by (type, idx). Resolve each placeholder's xfrm, `bodyPr` and list styles: slide, then layout, then master, then master `txStyles`, then `defaultTextStyle` (sections 1 and 4).
3. Draw order: master background and non-placeholder shapes (unless `showMasterSp="0"`), layout non-placeholder shapes, then slide shapes in tree order. Background from `p:bg` on slide, else layout, else master.
4. Colours through clrMap and theme with lumMod/lumOff/tint/shade. Fonts through `+mj-lt`/`+mn-lt`, then map to shipped fonts.
5. Text: insets default 91440/45720 EMU, wrap inside the inner width with real font metrics, line height 1.2 x size times `lnSpc` percent or fixed points, `spcBef`/`spcAft`, anchor t/ctr/b, `normAutofit` fontScale and lnSpcReduction, bullets with `marL` and `indent`, auto-numbering.
6. Shapes: preset geometries for the common dozen (rect, roundRect, ellipse, line, triangle, arrows, chevron), `custGeom` paths, solid and linear gradient fills, outlines. Pictures with `srcRect` crop. Groups via chOff/chExt. Tables (`a:tbl`) with grid widths and cell fills. Rotation and flips from `xfrm`.
7. Anything unsupported (charts, SmartArt, 3D): draw the fallback picture if the file carries one, else a labelled grey box. Never drop silently.

### PDF to PPTX
1. Slide size equals the page size (points x 12700 EMU). One slide per page. Minimal package: presentation, one master, one blank layout, one theme, slides, media.
2. Extract with pdf.js: text items with font, size, colour; images; simple vector paths. Build the page model.
3. Group text into lines by baseline, lines into blocks by spacing and x overlap (pdf2docx rules), blocks into paragraphs (terminal punctuation + short line, list prefix, gap). One text box per block.
4. Write boxes with the PPT Master recipe: `txBox="1"`, zero insets, `wrap="square"` + `noAutofit` + fixed `lnSpc spcPts` equal to the measured baseline distance, top = first baseline minus ascent share x 1.2 x size, width = block width plus a few percent headroom. Single-line labels use `wrap="none"` + `spAutoFit`.
5. Runs keep size (`sz`), bold, italic, colour, and a mapped font name in `a:latin`, `a:ea`, `a:cs`. Split runs where any of those change. Fix ligatures and hyphenation.
6. Images as `p:pic` at their transformed bbox. Rules and filled rects as native shapes. Complex vector art: render that region to PNG.
7. Default mode is hybrid: text-free page render as a full-slide picture at the back, editable text boxes on top. Offer "fully editable" and "picture only" as options. Scanned pages go through the OCR path first.

### PDF to DOCX
1. Same extraction. Then pdf2docx order: margins, lattice tables from ruling lines, stream tables from aligned gaps, one or two columns per section, paragraphs, inline styles.
2. Write explicit paragraph formatting: indents, first-line indent, alignment, space before, line spacing (relative when lines are regular, exact otherwise).
3. Bold and italic from the font name and flags, colour from the operator list, underline/strike/highlight from thin rects near the text.
4. Detect lists from prefixes and hanging indents and emit real numbering (section 6).
5. Headings from the size histogram plus bold, mapped to Heading styles so the outline works.
6. Images inline when they sit in the flow, anchored floating when they overlap text. Repeating headers and footers detected across pages and moved into header/footer parts or dropped.
7. Offer two modes like the commercial tools: "flowing" (editable, approximate) and "exact" (text frames at fixed positions).

### OCR to document
1. Ask Tesseract for blocks with word boxes, baselines and confidence. Keep them.
2. Deskew first (Tesseract reports the angle). Scale so text is about 30 px tall.
3. Feed the word boxes into the same page model as PDF text: font size from line height (x-height or bbox height x a constant), lines from Tesseract lines, paragraphs from Tesseract paragraphs then the pdf2docx spacing rules, columns from blocks.
4. From there reuse the PDF to DOCX and PDF to PPTX writers. Searchable PDF stays as is (image plus invisible text).
5. For DOCX and PPTX output, crop non-text regions (Tesseract block type image, or large areas with no words) and place them as pictures. For PPTX hybrid mode, use the scan as the background and text boxes with matching colour sampled from the image.
6. Mark low-confidence words (highlight or a review list) instead of pretending they are right.

## 9. Licence table

| Repo | Licence | Note |
|---|---|---|
| hugohe3/ppt-master | MIT | Intake uses PyMuPDF (AGPL); not relevant to us |
| dothinking/pdf2docx | MIT (relicensed, Artifex) | Depends on PyMuPDF (AGPL) |
| microsoft/markitdown | MIT | |
| meshesha/PPTXjs | MIT | |
| kevinmcguinness/pdf2pptx | MIT | PyMuPDF underneath |
| zhangqiyuan24/pdf2pptx | MIT | Uses mupdf.js (AGPL); do not vendor mupdf |
| terryfurqan/pdf2pptx | MIT | PyMuPDF underneath |
| mwilliamson/mammoth.js | BSD-2-Clause | Already vendored |
| VolodymyrBaydalka/docxjs | Apache-2.0 | Could be vendored |
| jgm/pandoc | GPL-2.0-or-later | Ideas only |

MuPDF and PyMuPDF are AGPL. A MuPDF WASM build would solve extraction and rendering in one go, but it would put the whole site under AGPL terms. Stay on pdf.js (Apache-2.0).
