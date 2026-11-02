# Plan: Whitewash as a humanizer with a converter built in

Humanizing AI text stays the main feature. File conversion comes second. Everything runs in the browser.

## Phase 1: new look, new words, drop-anywhere wheel (shipped)

Ships with no new libraries.

- **New homepage.** A real hero with the paste box right in it, so the main task needs zero clicks. Under it, tools grouped as *Writing*, *Documents* and *Images*. Unbuilt tools move to one "Coming next" line.
- **Copy rewrite** across the homepage, tool pages, buttons, errors, Help and Privacy. See [copy-audit.md](copy-audit.md).
- **Drop-anywhere wheel.** Drag any supported file over the page and a glass radial wheel opens at the cursor, offering only what makes sense for that file. Drop on a segment to run it. On phones, "Choose file" opens the same wheel. Numbers come from [ui-teardown.md](ui-teardown.md):
  - SVG ring segments with rounded corners, a hub label and a spring open with a staggered fan-out.
  - Hit-testing by angle and distance, because `dragover` doesn't give reliable per-element hover.
  - Keyboard: arrows to move, Enter to run, Esc to close.
  - A progress pill drops in at the top centre, then offers the download.
- **Image tools using the canvas** (no library): convert between JPG, PNG and WebP, resize, and strip photo metadata (location, camera). These are real conversions at zero download cost.
- **Wheel actions for files we already handle:** TXT/MD → humanize; DOCX/PPTX/XLSX → refine text or strip metadata.

## Phase 2: converter, PDF tools, metadata wiper (shipped)

Vendored and lazy-loaded from `dist/vendor/`: pdf-lib, @pdf-lib/fontkit, pdf.js (with worker, cmaps and standard fonts), mammoth and marked, plus Noto Sans fonts for PDF output. The CSP gained `worker-src 'self'`, `connect-src 'self'` and `'wasm-unsafe-eval'`. The SheetJS CDN was blocked, so spreadsheets use our own XLSX/ODS/CSV engine.

- **Document engine** (`conv-doc.js`): every input becomes a block list (headings, paragraphs, lists, code, quotes, tables, links, bold/italic), and every output is written from it. In: TXT, MD, HTML, DOCX, ODT, EPUB, PDF (text layer), PPTX. Out: PDF, DOCX, MD, HTML, TXT, ODT, RTF, EPUB.
- **Data engine** (`conv-data.js`): CSV, TSV, JSON, XLSX, ODS in; those plus Markdown, HTML, PDF and DOCX tables out. Tables in HTML or Markdown can come out as spreadsheets.
- Subtitles SRT ↔ VTT ↔ text. Images JPG, PNG, WebP, GIF, BMP, AVIF, SVG in; JPG, PNG, WebP, PDF, BMP, TIFF, ICO out. PDF → JPG/PNG/WebP, one image per page.
- About 150 conversion routes from this phase. Counted honestly: no video.
- PDF tools: merge, split (ranges or every page), organize (thumbnail grid: move, rotate, delete), images → PDF, PDF → images, watermark, page numbers, PDF text → Polish.
- **Metadata wiper**: photos (EXIF incl. GPS and serials, XMP, IPTC, C2PA, AI prompt chunks), PDFs (Info dictionary, XMP, PieceInfo, document ID) and Word/PowerPoint/Excel properties. Each copy is reopened and checked before it is offered.
- Every new PDF is written with no producer, creator or dates. Images placed into PDFs have their camera details stripped first.
- The wheel offers conversions, merge and wipe for each file type, and a floating orb on tool pages accepts drops too.

Word ↔ PDF keeps text, headings, lists, links and tables, not page layout. That is stated in the tool descriptions.

## Phase 2b: audio and archives (shipped)

See [audio-archives-synthid.md](audio-archives-synthid.md).

- **Audio** with Mediabunny (MPL-2.0) plus its MP3, FLAC and AAC encoder add-ons, loaded only when the browser can't encode that codec itself. In: MP3, WAV, FLAC, OGG, Opus, M4A, AAC, WebM audio, and the sound track of MP4, MOV, MKV and WebM videos. Out: MP3, WAV, FLAC, OGG (Opus), Opus, M4A. Title, artist and cover art carry over.
- **Archives**: libarchive.js opens ZIP, 7Z, RAR, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2 and XZ. fflate and our own TAR writer make ZIP, TAR and TAR.GZ. New archives record a fixed 1980 date for every file. The wheel offers "ZIP" for any set of dropped files.
- The CSP adds `blob:` to `worker-src`, because the audio encoders start their workers from blobs.
- About 250 conversion routes in total.

## Phase 3: menu, info cards and the tools people pay for (shipped)

- **Menu.** The header has a grouped "Tools" mega menu (tabs on the left, tools on the right) with a search box that understands "pdf to word", "jpg 2 png", "compress pdf" or just "mp3". Ctrl/⌘K or `/` opens it. Four quick links sit beside it.
- **Clear notes.** Every conversion and every wheel action has a short "You get / Keeps / Drops / Note" card (`notes.js`): beside the wheel, and under the converter's format chips on hover or focus.
- **PDF:** compress (re-saves the photos inside at a lower resolution with canvas, then a lossless qpdf pass; never returns a bigger file), sign (draw, click to place), password protect (AES-256) and unlock (qpdf WASM in a worker), repair (qpdf, with a pdf-lib rebuild as fallback because this qpdf build can't run its own xref reconstruction).
- **OCR** for photos and scanned PDFs (Tesseract.js 7, English, about 15 MB, downloaded once on first use). Gives text, a hand-off to Polish, and a searchable PDF.
- **Image compression** with MozJPEG and OxiPNG (@jsquash).
- The wheel now offers Shrink and Sign for a PDF, Shrink and Text (OCR) for an image.
- The CSP gains `'wasm-unsafe-eval'`. Still no `'unsafe-eval'`.

Skipped in this phase:

- **HEIC → JPG.** heic2any needs `new Function` (embind), which the CSP forbids. Revisit with a libheif build that doesn't, or Safari's native decoding.
- **Real redaction.** Needs page rasterising plus a box-drawing UI; next candidate.
- **PDF → Excel** (table detection) and **Office ↔ PDF with layout** (see below).

## Phase 4: dial first, one-click Humanize (1 November 2026)

- **The product is wiping AI slop.** Humanize is the first tab and the first segment on every document dial.
- **One button.** Humanize does filler, stock AI phrases, chatbot openers and sign-offs, hidden characters and punctuation in one pass, then says what it fixed in one line. Edit is the only other writing button.
- **Same file back.** Word, PowerPoint and Excel are edited in place (styles, tables and runs kept, checked with python-docx). PDF, HTML, ODT and EPUB come back as Word files.
- **Big dial everywhere.** Homepage, Convert (formats left, dial right), PDF (all 15 tools, Compress first), Compress, Audio, Archives, Privacy. Header tabs with hover dropdowns list every tool.
- **Removed:** hero paste box, "Try an example", the floating orb and the overlay wheel. The editor shows draft and result side by side.
- **Later:** a simpler phone layout; AI rewriting with your own key ([later.md](later.md)).

## Not building

- **Word ↔ PDF with layout.** It needs a LibreOffice WASM build of tens of MB plus server headers, and the output still breaks. This is the conversion people search for most, so the site should say plainly that it isn't offered.
- **Video conversion.** Encoding video needs ffmpeg.wasm (about 30 MB, crashes on phones, GPL parts, special server headers) or a server. Removed from scope on 1 November 2026. Reading a video for its sound is fine and shipped.
- **SynthID removal.** See [audio-archives-synthid.md](audio-archives-synthid.md): not built, by decision.
- **Matching CloudConvert's 200+ formats.** They run servers.

## Open questions for the owner

- **Hosting.** Settled: GitHub Pages, deployed from `main` by `.github/workflows/pages.yml`.
- **Sounds.** The Windows app plays tiny tick sounds on its wheel. Optional, off by default?
