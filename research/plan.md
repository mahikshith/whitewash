# Plan: Whitewash as a humanizer with a converter built in

Humanizing AI text stays the main feature. File conversion comes second. Everything runs in the browser.

## Phase 1: new look, new words, drop-anywhere wheel

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

## Phase 2: PDF tools

Adds pdf-lib (MIT, about 0.5 MB) and pdf.js (Apache-2.0, about 1.5 MB with its worker). Both are vendored and load only when a PDF tool opens. The CSP gains `connect-src 'self'` and `worker-src 'self'`.

- Merge, split, reorder, delete and rotate pages, using a thumbnail grid.
- Images → PDF and PDF → JPG/PNG.
- **PDF → text → humanize.** This is the one conversion that feeds the main product.
- Watermark and page numbers.
- TXT/Markdown → PDF via a print stylesheet.

## Phase 3: heavier tools (WASM)

Adds `'wasm-unsafe-eval'` to the CSP. Each library is lazy-loaded and comes with a size warning.

- Better image compression (MozJPEG, WebP, OxiPNG via @jsquash).
- HEIC → JPG (native decoding first, libheif as a fallback).
- OCR for scanned PDFs and images (Tesseract.js, English first, about 6–9 MB).
- PDF password protect and unlock (qpdf WASM).
- Real redaction that burns pages to images, never boxes drawn over live text.
- XLSX ↔ CSV.

## Not building

- **Word ↔ PDF with layout.** It needs a LibreOffice WASM build of tens of MB plus server headers, and the output still breaks. This is the conversion people search for most, so the site should say plainly that it isn't offered.
- **Video and audio conversion.** ffmpeg.wasm is about 30 MB, crashes on phones and pulls in GPL parts.
- **"Compress PDF"** unless it actually resamples images. Anything else saves a few percent and would be a misleading label.
- **Matching CloudConvert's 200+ formats.** They run servers.

## Open questions for the owner

- **Hosting.** The old preview was a ChatGPT Sites deployment, which we can't publish to. GitHub Pages would serve the same files for free.
- **Sounds.** The Windows app plays tiny tick sounds on the wheel. Optional, off by default?
