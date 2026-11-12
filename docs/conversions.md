# How the conversions work

12 November 2026. Written after the conversion rewrite. For the block format itself see [conversion-model.md](conversion-model.md); for the projects this was learned from see [the teardown](../research/conversion-teardown.md).

## Two kinds of conversion

**Flowing documents** (Markdown, Word, HTML, ODT, EPUB, RTF, text, and PDF as a target) go through one block list: a reader turns the source into headings, paragraphs, list items, tables, pictures and so on, and a writer produces the target from that list. Any reader works with any writer, so a fix to one reader improves every route out of that format.

**Page pictures** (slides and PDF pages) can't be reflowed without wrecking them, so two routes work on positions instead:

- PowerPoint to PDF draws every slide onto a PDF page.
- PDF to PowerPoint puts each page on a slide as editable text boxes over a background picture.

## Where the code is

| File | Job |
| --- | --- |
| `convert.js` | Formats, routes, `convertFile`. The only place that decides which reader and writer run |
| `conv-doc.js` | Markdown, HTML, text, table, ODT and EPUB readers; text, Markdown, HTML, ODT, RTF and EPUB writers |
| `docx-read.js` / `docx-write.js` | Word reader and writer |
| `pdf-write.js` | Block list to PDF: layout, tables, code, links |
| `font-trim.js` | Shrinks the embedded fonts to the glyphs used |
| `pdf-extract.js` | PDF to positioned lines, then to blocks (columns, headings, lists, tables) |
| `pptx-read.js` | Slides to blocks (for PowerPoint to Word, Markdown, text) |
| `pptx-render.js` | Slides to PDF pages |
| `pptx-write.js` | Blocks or positioned items to a .pptx |
| `pdf-to-pptx.js` | PDF pages to slides |
| `conv-ocr.js` | Tesseract output to blocks, and the searchable PDF |
| `conv-data.js` | Spreadsheets, CSV, JSON |
| `office-zip.js` | The ZIP reader and writer every Office format uses |

## What each route keeps

| Route | Keeps | Does not keep |
| --- | --- | --- |
| Markdown to Word / PDF / ODT / HTML | Heading levels, nested bullet and numbered lists (real Word numbering), task lists, tables with alignment, code blocks with indentation, quotes and nested quotes, links, bold, italic, strikethrough, inline code, rules, embedded pictures | Pictures that are web links or separate files (a caption line stays) |
| Word to PDF | Text, heading sizes and colours, bold/italic/underline/colour, lists with their numbers, tables with column widths, merged cells and column alignment, pictures (also those inside table cells), footnotes, page breaks, justified and centred text | Page-for-page layout, columns, headers and footers, text boxes in place (their text becomes paragraphs), charts, shapes, fonts (set in Noto Sans). Near-white text is shown dark so it stays readable |
| Word to Markdown / HTML / ODT / EPUB / RTF | The same content as above, in that format's terms | As above |
| PowerPoint to PDF | Slide size, backgrounds, theme colours and font sizes, master and layout shapes, pictures with cropping, about 40 preset shapes plus custom shapes, gradients, lines and arrows, tables, bullets and numbering, text fitting, rotation | Charts (a labelled box), SmartArt without its fallback picture, WordArt warping, shadows and glows, embedded fonts (Noto Sans is used), clickable links |
| PowerPoint to Word / Markdown / text | Slide titles as headings, bullets with levels, tables, pictures, speaker notes as quotes | Positions and design |
| PDF to PowerPoint | Every page as a slide of the same shape; text as editable boxes with size, colour, bold and italic; everything else as a background picture with the text removed from it | Editable shapes and tables, justified spacing, fonts (not embedded), links |
| PDF to Word / Markdown / HTML / text | Reading order across columns, headings by size, paragraphs, bullet and numbered lists, simple tables, bold and italic, pictures | Exact layout, complex or tightly packed tables, links, running headers. Scanned pages are read with OCR |
| Markdown / Word / HTML to PowerPoint | A slide per heading, bullets, tables, pictures, code | Design: the slides are plain |
| Scan or photo to Word / Markdown | Reading order across columns, headings, paragraphs, lists, ruled and simple borderless tables | Bold and italic, pictures, tables with merged or multi-line cells, handwriting, languages other than English |
| Spreadsheet routes | Cell values, sheets, header row | Formatting, charts, formulas (their last value is used) |

Nothing written by the site carries a producer, author or date.

## Things that are easy to get wrong

- **Fonts in PDFs.** pdf-lib's own subsetting drops letters in most viewers. Fonts are embedded whole and then trimmed by `font-trim.js`, which empties unused glyph outlines but keeps glyph numbers. Never turn `subset: true` back on.
- **Characters Noto Sans lacks** (emoji, CJK, Arabic, Indic, Thai) are drawn by the browser into small pictures and placed inline. A character the font has but can't shape counts as missing.
- **Office ZIP files.** Microsoft Office sets compression-option flag bits that python-made fixtures don't. The reader accepts them; a test fixture made by a library is not proof a real file opens.
- **Placeholders in slides** inherit from the layout, then the master, then the master's text styles. The deck-wide default text style applies to plain text boxes only.
- **Unwrapped slide text** (`wrap="none"`) is still aligned inside its box.
- **PDF to PowerPoint text removal** relies on a private pdf.js method (`_renderPageChunk`, pdf.js 4.10.38). If it disappears after an upgrade the slides fall back to a full picture with no text boxes. Re-check after any pdf.js update.
- **OCR** uses automatic page segmentation and rebuilds reading order from line positions; Tesseract's own block order is wrong on multi-column pages.

## How it was tested

`npm test` runs 133 unit tests on the readers and writers.

On top of that, 111 real files from public repositories (Apache POI's corpus of documents found on the web, pdf.js, pdfplumber, pandoc, markitdown, ONLYOFFICE samples, real READMEs, tesseract test scans) were run through every route in Chromium: about 620 conversions. Outputs for the main routes were rendered and compared side by side with LibreOffice's rendering of the original.

That pass found and fixed:

1. Every .docx, .xlsx and .pptx saved by Microsoft Office was rejected as damaged (103 of 222 files in the first run), which also broke Humanize for those files.
2. Decks listed no slides because the slide id was read in place of the relationship id.
3. Files with a stray byte after the ZIP end record were rejected.
4. Word files with a body part over 10 MB were rejected. The limits are now 60 MB packed and 200 MB unpacked for conversions.
5. PDFs containing some Indic or Thai punctuation crashed the PDF writer.
6. Slide text with wrapping turned off was drawn off the page (missing titles and shape labels).
7. Slide placeholders picked up italic from the deck-wide default.
8. Donut, pie, arc and cut-corner shapes were drawn as plain rectangles.
9. Pictures inside Word table cells were dropped, and centred columns came out left-aligned.
10. White text from dark Word banners vanished on the white PDF page.
11. Scanned PDFs stopped with an error; they are now read with OCR.
12. OCR text wrapped round a picture came out one line per paragraph.

## Known gaps

- Word to PDF is a clean reflow, not a copy of Word's page layout. A layout-faithful version would need a full Word layout engine.
- Charts are not drawn from their data in any route.
- Markdown tables written to Word can give a short first column less width than it needs.
- PDF to Word can put a full-width abstract after the first column on two-column papers.
- OCR was measured on synthetic scans (0 to 2% word errors at 100 dpi and up) and spot-checked on 11 real ones; phone photos taken at an angle do badly.
- The outputs were checked in LibreOffice and with python-docx and python-pptx. They were not opened in Microsoft Office or Keynote.
- CSV files with more than about ten thousand rows take 10 to 25 seconds to turn into a PDF.
