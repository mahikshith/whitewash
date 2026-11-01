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

## Phase 3: heavier tools (WASM)

Adds `'wasm-unsafe-eval'` to the CSP. Each library is lazy-loaded and comes with a size warning.

- Better image compression (MozJPEG, WebP, OxiPNG via @jsquash).
- HEIC → JPG (native decoding first, libheif as a fallback).
- OCR for scanned PDFs and images (Tesseract.js, English first, about 6–9 MB).
- PDF password protect and unlock (qpdf WASM).
- Real redaction that burns pages to images, never boxes drawn over live text.

## Not building

- **Word ↔ PDF with layout.** It needs a LibreOffice WASM build of tens of MB plus server headers, and the output still breaks. This is the conversion people search for most, so the site should say plainly that it isn't offered.
- **Video conversion.** Encoding video needs ffmpeg.wasm (about 30 MB, crashes on phones, GPL parts, special server headers) or a server. Removed from scope on 1 November 2026. Reading a video for its sound is fine and shipped.
- **SynthID removal.** See [audio-archives-synthid.md](audio-archives-synthid.md): not built, by decision.
- **"Compress PDF"** unless it actually resamples images. Anything else saves a few percent and would be a misleading label.
- **Matching CloudConvert's 200+ formats.** They run servers.

## Open questions for the owner

- **Hosting.** The old preview was a ChatGPT Sites deployment, which we can't publish to. GitHub Pages would serve the same files for free.
- **Sounds.** The Windows app plays tiny tick sounds on the wheel. Optional, off by default?
