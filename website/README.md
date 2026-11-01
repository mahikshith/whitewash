# Whitewash writing tools

A browser-local tool directory with one focused page and primary action per task. No framework, runtime package installation, API key or account is needed to run it locally. Automated tests use a pinned dev-only XML parser (`npm ci`).

From this directory, run `python -m http.server 4173 --bind 127.0.0.1 --directory dist` and open http://127.0.0.1:4173. Use `npm test` (or `node --test tests/*.test.mjs`) for processing checks. The files in dist are the source for this buildless site; they are intentionally tracked.

## Working features

- Clean text: reviewed replacement of nonbreaking spaces and removal of soft hyphens/leading BOM. Zero-width-space removal is optional and off by default.
- Light edit: a small rule-based English phrase editor, explicitly labeled. No model calls.
- Optional, collapsed per-edit review, keep/reject controls, highlighted result, originals retained, stale-result protection and undo for source replacement.
- Unicode inspection with counts and positions. Emoji/script joiners and direction controls are retained. No compatibility normalization or stripping non-ASCII text.
- Exact user-locked phrases, numbers, URLs/email, quotations and conservative code protection.
- Edit text file: local UTF-8 TXT/Markdown selection and drag/drop, followed by automatic local light editing; copy/download. Uploaded originals are never rewritten.
- Dial first: the homepage, section pages (Humanize, PDF, Compress, Audio, Archives, Privacy) and the converter each show a big dial. Drop a file and click one segment to get the finished file. One-click Humanize returns Word, PowerPoint and Excel files edited in place, and PDFs as Word files. 35 tools work; four planned tools have their own status pages.
- Convert: about 150 routes between documents (TXT, MD, HTML, DOCX, ODT, RTF, EPUB, PDF, PPTX in), data (CSV, TSV, JSON, XLSX, ODS), subtitles (SRT, VTT) and images (JPG, PNG, WebP, GIF, BMP, AVIF, SVG in; TIFF and ICO out as well). Documents keep text, headings, lists, links and tables, not page layout. Up to 50 files of one type, 60 MB each.
- Audio: MP3, WAV, FLAC, OGG, Opus, M4A and AAC into MP3, WAV, FLAC, OGG, Opus and M4A, plus the sound from MP4, MOV, MKV and WebM videos. Up to 1 GB. Tags and cover art carry over. Nothing encodes video.
- Archives: open ZIP, 7Z, RAR, TAR, TAR.GZ/BZ2/XZ, GZ, BZ2 and XZ, save single files out of them, convert them to ZIP, TAR or TAR.GZ, or pack any files into a new one. Up to 300 MB and 10,000 files.
- PDF tools: merge, split, organize pages with thumbnails, images to PDF, PDF to images, watermark, page numbers, compress (real photo downsampling), sign (drawn signature), add or remove a password (AES-256, qpdf WASM), repair, and PDF text into the Polish tool.
- Read text from scans (OCR): photos and scanned PDFs, English, up to 50 pages. Text to copy, polish or save, plus a searchable PDF. Tesseract.js, about 15 MB, loaded on first use.
- Search and menu: the Tools menu groups every tool and searches tools and conversion routes ("pdf to word", "mp3", "compress"). Every conversion shows what you get, what's kept and what's dropped.
- Metadata wiper: photos, PDFs and Office files, up to 100 at a time. Lists what it found, removes it, then reopens the copy to confirm nothing is left. Photos are not re-encoded.
- Images: convert between JPG, PNG and WebP, resize, compress (MozJPEG, OxiPNG) and strip photo metadata. Up to 50 images at a time, 40 MB and 100 megapixels each.
- Refine Word, slide and spreadsheet text: local DOCX/PPTX/XLSX copies, light English phrase edits or character cleanup, protected text and structural/output verification. Main-body/table text for Word; slide text for PowerPoint; long prose cells for spreadsheets.
- Office metadata: clear standard core/custom property children, selected application fields and ZIP dates/extras/comments; list removed properties and verify the copy. Comments, revisions, embedded media and visible content remain.
- Writing check: flag specific filler, promotional and assistant-style phrases; no authorship percentage. Optional plain punctuation; inspect Unicode tags/variation selectors while retaining them.
- Light/dark themes: follows device appearance initially; a visible switch saves your choice locally.

## Limits and privacy

One UTF-8 file, 400 KB, 100,000 UTF-16 code units, up to 500 suggestions per review and 50 locked phrases (2,000 characters total). Oversized/unsupported input fails visibly. Only the appearance preference uses local storage; drafts, analytics and external processing are absent from storage/application requests. A hosting service still handles page/access requests. Draft state survives Home/tool navigation in memory and disappears on reload. Clipboard/downloaded copies are controlled by the device.

Markdown is edited as text, not rendered. Both fence types, unclosed fences, indented code, inline-code lines, frontmatter, and heading/link/table/HTML/math-like lines are conservatively retained. This is not a complete Markdown parser or a promise of every dialect's structural fidelity. Mixed-script word boundaries are respected. Word counts are space-delimited estimates and are unsuitable for exact Chinese segmentation.

Light edits are not a factual or grammatical certification. Review them in context. This version does not do general model rewriting, persistent voice profiles, non-English OCR, HEIC photos, redaction, layout-faithful Word ↔ PDF, video conversion, SynthID removal, password-protected archives, AI classification or keyed watermark verification. It cannot certify human authorship or universal watermark removal. There is no billing flow yet.

## Publication and source

`.openai/hosting.json` records the private Site identity and static output directory. Keep that identity on updates. Do not replace the parent repository's GitHub origin with the Sites source endpoint. The initial publication uses an ignored deployment checkout containing this exact website source; the Sites helper owns its Git push/archive. Keep credentials in memory/stdin only.

The comparison protocol is in [the benchmark plan](../docs/research/benchmark-plan.md). No “10× better” or detector-bypass benchmark has been achieved. The next engineering gate is a real model adapter evaluated on protected-edit contracts and held-out document quality. Bounded Office text/property tools are now implemented; see [the supplied-source review](../docs/research/supplied-repositories.md).

## UI structure

The homepage, the Tools menu and every page heading read from the shared catalog in `dist/tools.js`, which also defines the header sections. Planned tools stay in the catalog with `state: 'soon'` or `'research'` and appear only under "Coming next". Hash URLs such as `#light-edit`, `#word` and `#image-resize` keep the draft in memory, and old `#studio` links still resolve. `dist/styles.css` is the single stylesheet; `dist/theme.js` applies appearance before paint.

Audio is `conv-audio.js` (Mediabunny); archives are `conv-archive.js` (libarchive.js to read, fflate and our TAR writer to write) with their page in `archive-ui.js`. Conversions route through `dist/convert.js` (formats, routes, `convertFile`) to the engines `conv-doc.js`, `conv-data.js` and `conv-pdf.js`. Vendored libraries load on first use through `dist/libs.js`; their licences are in `dist/vendor/licenses/`. Photo metadata and the BMP/TIFF/ICO encoders are `image-meta.js` and `image-codecs.js`. The pages are `convert-ui.js`, `pdf-ui.js` and `wipe-ui.js`, sharing `files.js`.

The dial lives in `dist/dial.js` (drawing and events), `dist/wheel-geometry.js` (angles, hit-testing, segment paths) and `dist/actions.js` (which options fit which files and sections). `dist/hubs.js` runs the homepage and section pages, and `dist/quick.js` does one-click Humanize. Image conversion uses the canvas in `dist/images.js` and `dist/image-ui.js`; batches download as one ZIP built with the existing `office-zip.js`. The status pill is `dist/island.js`. See [design](../docs/ui-design.md) and [research](../research/README.md).

## Office limits and validation

One transitional OOXML DOCX/PPTX/XLSX at a time: 10 MB input/output, 30 MB expanded package, 1,000 entries, 10 MB per package payload and 5 MB per parsed XML part, 100,000 eligible text characters and 500 edits. Strict OOXML, ZIP64, encrypted, digitally signed, macro-enabled and legacy formats are unsupported. Modern browsers need native raw-deflate decompression. XML declarations/entities that require a DTD are rejected; external relationships are never fetched.

Untouched package payloads retain their compressed bytes. Edited XML is serialized again and verified for an unchanged element/attribute structure, allowing only the `xml:space` preservation attribute on text runs. Run styling, tables, shape positions, formulas and relationships are retained within the supported scope; shorter text can reflow. No-edit text processing returns the exact original bytes. Downloads always use a separate `-cleaned` filename.

Word fields/known code/headings/links/revisions are skipped; headers, footnotes, comments and other parts are untouched. Slide notes/masters are untouched. Spreadsheet formulas and cached formula results, numbers, first-row labels, short cells and phonetic shared strings are skipped; a shared string referenced by a header/formula cell is blocked globally. Metadata cleaning removes child fields from `docProps/core.xml` and `custom.xml`; selected `app.xml` fields are Application, AppVersion, Company, Manager, Template, TotalTime and HyperlinkBase. It is not complete anonymization or statistical watermark removal.

Run `npm test` for synthetic engine/package checks. With python-docx, python-pptx, openpyxl and Node installed, `python ../scripts/check-office-roundtrips.py` generates representative fixtures under ignored `.research/qa`, processes them and independently reopens all six edited/metadata copies. It checks library readability and structural/content invariants, not visual rendering in Microsoft Office. No browser file upload automation was used after the prior declined upload permission.

