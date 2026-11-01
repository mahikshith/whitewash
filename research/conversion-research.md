# Whitewash: browser-local file conversion research

## 0. Two facts about Whitewash that change the plan
- **The whole site ships about 57 KB of JS with no dependencies** (`dist/*.js`). It already has its own ZIP reader/writer that uses native `DecompressionStream` (`office-zip.js`). pdf.js alone is about 25x that. Every library must load lazily, per tool, never on first paint.
- **The current CSP blocks almost every serious library, not just CDNs.**
  - `connect-src 'none'` blocks `fetch()` of your own vendored `.wasm`, pdf.js cmaps and fonts, and Tesseract language data. It has to become `connect-src 'self'`.
  - Any WASM needs `script-src 'self' 'wasm-unsafe-eval'`.
  - Workers need `worker-src 'self'`, plus `blob:` if a library builds its workers from blob URLs (heic2any and Tesseract defaults do; verify per lib).
  - Previews need `img-src blob:`.
  - The "files never leave your device" promise stays true: `connect-src 'self'` still allows no third-party egress.

## 1. Table stakes across the leading sites
Sources checked: iLovePDF, iLoveIMG, Smallpdf, PDF24, CloudConvert, FreeConvert, plus Stirling-PDF, BentoPDF and VERT.

| Tool | iLovePDF | Smallpdf | PDF24 | FreeConvert | BentoPDF |
|---|---|---|---|---|---|
| Merge / Split | Y | Y | Y | Y | Y |
| Delete / extract / reorder pages | Y | Y | Y | Y | Y |
| Rotate | Y | Y | Y | - | Y |
| Compress PDF | Y | Y | Y | Y | Y |
| JPG→PDF / PDF→JPG | Y | Y | Y | Y | Y |
| Word/PPT/Excel → PDF | Y | Y | Y | Y | Y (LibreOffice WASM) |
| PDF → Word/PPT/Excel | Y | Y | via converter | Y | partial |
| OCR | Y | Y | Y | - | Y |
| Protect / Unlock | Y | Y | Y | Y | Y |
| Watermark, page numbers | Y | Y | Y | - | Y |
| Sign, Edit, Redact | Y | Y | Y | Y | Y |
| PDF/A, Compare, Repair | Y | PDF/A | Compare | - | Y |

On the image side, iLoveIMG has compress, resize, crop, convert to and from JPG, rotate, watermark, upscale, remove background and blur face. CloudConvert, Convertio and FreeConvert are server-side "any format to any format" hubs (CloudConvert advertises 212 formats).

**Table stakes:** merge, split, organize pages, rotate, compress, images↔PDF, Office→PDF, PDF→Office, OCR, protect/unlock, watermark/page numbers, sign, plus image compress/resize/convert.

## 2. Feasibility, client-side only

| Tool | Feasible? | Best library | License | Size (approx.) | Notes |
|---|---|---|---|---|---|
| Image convert JPG/PNG/WebP | **Yes, trivial** | Native canvas `createImageBitmap` + `toBlob` | n/a | 0 KB | Safari may not encode WebP via canvas; check the output type. Re-encoding strips EXIF and GPS (a privacy feature). |
| Image resize / crop / rotate | **Yes, trivial** | Canvas | n/a | 0 KB | Pure JS, no WASM |
| Image compress (quality) | **Yes** | Canvas for basic; @jsquash (MozJPEG, OxiPNG, WebP, AVIF) for good results | Apache-2.0 | ~0.2–0.4 MB WASM per codec; AVIF encoder is several MB | WASM + `wasm-unsafe-eval`, run in a worker |
| HEIC→JPG | Yes, heavier | heic2any (MIT wrapper around libheif, which is **LGPL**) or libheif-js | MIT/LGPL-3.0 | ~2.7 MB unpacked | heic2any is v0.0.4 and stale. Safari 17+ decodes HEIC natively, so try native first. |
| Merge / split / reorder / delete / extract / rotate PDF | **Yes** | pdf-lib | MIT | ~0.5 MB min | Pure JS, no WASM. Last real release was 1.17.1 (2021) and it is effectively unmaintained but stable. **It cannot open encrypted PDFs.** Fork: @cantoo/pdf-lib (adds SVG). |
| Images→PDF | **Yes** | pdf-lib (embed JPG/PNG) | MIT | shared | Pure JS |
| Watermark, page numbers, visual signature stamp | **Yes** | pdf-lib | MIT | shared | A visual stamp only, not a cryptographic signature |
| PDF→JPG/PNG, thumbnails | **Yes** | pdf.js (`pdfjs-dist`) | Apache-2.0 | ~0.4 MB main + ~1.1 MB worker; recent builds add optional WASM image decoders | Needs a worker (self-hosted module worker) and `connect-src 'self'` for cmaps and fonts. Also gives the page-grid UI for organize/split. |
| PDF→text / Markdown | **Yes** | pdf.js `getTextContent()` | Apache-2.0 | shared | Reading order is imperfect, but it feeds the humanizer directly |
| OCR (scanned PDF or image → text) | Heavy but realistic | Tesseract.js v5/6 | Apache-2.0 | core WASM ~3–5 MB + `eng.traineddata` ~2–4 MB (fast) | Worker + WASM. By default it fetches core and language data from jsDelivr, so you must set `workerPath`, `corePath` and `langPath` to self-hosted copies. Slow on phones. |
| Protect / unlock PDF (real encryption) | Medium | qpdf compiled to WASM (community builds) | Apache-2.0 | ~1–2 MB (verify) | pdf-lib can't do it. Rasterizing to unlock destroys the text layer. |
| Compress PDF | **Weak** | pdf-lib re-save with object streams (gains are small); or rasterize pages (lossy, kills text); or Ghostscript WASM (AGPL, ~10+ MB) | — | — | Don't advertise "compress" unless you do image downsampling properly. Real compression is a server-grade job. |
| Redact | Yes, only if honest | pdf.js render → burn black boxes → rebuild an image-only PDF | — | shared | **Drawing boxes over text is a fake redaction and a data-leak bug.** Rasterize, or don't ship it. |
| DOCX→HTML / text | Yes | mammoth.js | BSD-2 | ~0.6 MB | Semantic output. Layout is thrown away by design. |
| XLSX↔CSV / JSON | Yes | SheetJS CE | Apache-2.0 | ~0.9 MB full build | Get it from cdn.sheetjs.com tarballs (npm is frozen at 0.18.5) |
| TXT / MD / HTML → PDF | Yes, cheap | Browser print-to-PDF (`window.print()` with a print stylesheet) or jsPDF (MIT, ~0.35 MB) | — | 0 / 0.35 MB | Print is free and gives the best typography |
| DOCX/PPTX/XLSX → PDF (faithful) | **Not realistic** | LibreOffice WASM (what BentoPDF uses) | MPL | tens of MB | Needs SharedArrayBuffer, so COOP/COEP headers. Fidelity still varies. |
| PDF → DOCX/PPTX/XLSX with layout | **Not realistic** | — | — | — | Every big site does this server-side. A "text-only DOCX" is possible: label it honestly. |
| Audio/video convert, trim, GIF | Heavy | ffmpeg.wasm | MIT wrapper; the FFmpeg core is LGPL/GPL (x264) | **~30 MB core** | The multi-thread core needs SharedArrayBuffer, so COOP/COEP (`same-origin` / `require-corp`). Memory caps at ~2 GB, it's slow, and it's unreliable on mobile. VERT itself offloads video to a server. |
| Background removal / upscale | Not worth it | ONNX models | — | 40–170 MB | Off-mission |

## 3. CSP and vendoring checklist
- **Self-host everything** under `/vendor/<lib>@<ver>/`, with SRI-pinned copies and license files. Never use a CDN: the CSP forbids it, and so does the privacy promise.
- **No WASM, no CSP change beyond workers:** canvas, pdf-lib, mammoth, SheetJS, jsPDF.
- **WASM, so `'wasm-unsafe-eval'`:** @jsquash, libheif, Tesseract, qpdf, ffmpeg, and newer pdf.js decoders (these fall back gracefully).
- **Workers:** pdf.js, Tesseract, ffmpeg, jsquash (recommended). Add `worker-src 'self' blob:`.
- **COOP/COEP:** only ffmpeg-mt and LibreOffice WASM need it. This needs host-header control that a static `<meta>` CSP cannot provide. Avoid both.
- **Licensing:** GPL/AGPL pieces (Ghostscript, PyMuPDF, ffmpeg+x264, and BentoPDF's own code) would force the license onto Whitewash. Stick to MIT, Apache or BSD. LGPL libheif is fine if it's an unmodified, separately loaded file.

## 4. Recommendation

**Tier 1: ship first.** Small, high value, mostly no WASM.
1. Image convert, resize, compress and strip metadata with canvas (0 KB). This matches the existing "metadata cleanup" story.
2. pdf-lib suite: merge, split, extract/delete/reorder/rotate pages, images→PDF, watermark, page numbers. One ~0.5 MB lazy chunk covers about 8 of the table-stakes tools.
3. pdf.js: PDF→images, page thumbnails for the organize UI, and **PDF→text→Humanize**. This is the one conversion that strengthens the core product rather than diluting it.
4. TXT/MD → PDF via print stylesheet (0 KB). DOCX→text→Humanize already exists through office.js.

**Tier 2: worth it with WASM.** Add `wasm-unsafe-eval` and `connect-src 'self'`.
- @jsquash MozJPEG/WebP/OxiPNG for compression that's actually good.
- HEIC→JPG: native first, libheif fallback.
- Tesseract.js OCR (eng only, lazy, with a size warning).
- qpdf-wasm protect/unlock.
- Rasterized "true" redaction.
- XLSX↔CSV via SheetJS.

**Tier 3: don't.**
- Office→PDF and PDF→Office with layout. Not feasible locally without 50+ MB LibreOffice plus COOP/COEP, and the output still disappoints.
- Video/audio via ffmpeg.wasm: 30 MB, header changes, GPL, mobile crashes.
- "Compress PDF" without image resampling, which is marketing fraud.
- Overlay redaction.
- AI upscale and background removal.
- Trying to match CloudConvert's 200+ formats. You will lose that fight: they run servers.

**Blunt summary:** About 70% of iLovePDF's catalog is achievable locally. It costs roughly 2 MB of lazy-loaded vendored JS (pdf-lib + pdf.js) plus a two-line CSP change. The other 30%, which includes the headline conversions people search for most (Word↔PDF), cannot be done well in a browser. Say so on the page instead of shipping garbage.

## Sources
- https://www.ilovepdf.com/ · https://www.iloveimg.com/ · https://smallpdf.com/pdf-tools · https://tools.pdf24.org/en/ · https://cloudconvert.com/ · https://www.freeconvert.com/
- https://github.com/alam00000/bentopdf (LibreOffice WASM needs SharedArrayBuffer/COOP-COEP; AGPL components) · https://github.com/VERT-sh/VERT (AGPL; video converted server-side by default) · https://github.com/Stirling-Tools/Stirling-PDF (Java server)
- https://github.com/Hopding/pdf-lib (MIT; "does not currently support encrypted documents") · https://app.unpkg.com/@cantoo/pdf-lib@2.6.1/files/README.md
- https://github.com/mozilla/pdf.js (Apache-2.0, worker required)
- https://github.com/jamsinclair/jSquash (Apache-2.0; MozJPEG/WebP/AVIF/JXL/OxiPNG/resize)
- https://github.com/naptha/tesseract.js (Apache-2.0; worker-based)
- https://npmjs.com/package/heic2any (MIT, 2.72 MB, v0.0.4)
- https://ffmpegwasm.netlify.app/docs/overview · https://shotstack.io/learn/ffmpeg-wasm/ (~30 MB core; COOP/COEP for multi-thread; ~2 GB memory limit)
- Sizes marked "approx." come from known package builds and should be re-measured when vendoring.
