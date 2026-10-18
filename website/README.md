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
- A 13-tool homepage, shared top menu and dedicated task URLs. Nine tools work; future tools have clearly labeled status pages. The mobile layout keeps the primary action visible.
- Refine Word, slide and spreadsheet text: local DOCX/PPTX/XLSX copies, light English phrase edits or character cleanup, protected text and structural/output verification. Main-body/table text for Word; slide text for PowerPoint; long prose cells for spreadsheets.
- Office metadata: clear standard core/custom property children, selected application fields and ZIP dates/extras/comments; list removed properties and verify the copy. Comments, revisions, embedded media and visible content remain.
- Writing check: flag specific filler, promotional and assistant-style phrases; no authorship percentage. Optional plain punctuation; inspect Unicode tags/variation selectors while retaining them.
- Light/dark themes: follows device appearance initially; a visible switch saves your choice locally.

## Limits and privacy

One UTF-8 file, 400 KB, 100,000 UTF-16 code units, up to 500 suggestions per review and 50 locked phrases (2,000 characters total). Oversized/unsupported input fails visibly. Only the appearance preference uses local storage; drafts, analytics and external processing are absent from storage/application requests. A hosting service still handles page/access requests. Draft state survives Home/tool navigation in memory and disappears on reload. Clipboard/downloaded copies are controlled by the device.

Markdown is edited as text, not rendered. Both fence types, unclosed fences, indented code, inline-code lines, frontmatter, and heading/link/table/HTML/math-like lines are conservatively retained. This is not a complete Markdown parser or a promise of every dialect's structural fidelity. Mixed-script word boundaries are respected. Word counts are space-delimited estimates and are unsuitable for exact Chinese segmentation.

Light edits are not a factual or grammatical certification. Review them in context. This version does not do general model rewriting, persistent voice profiles, PDF editing/export, general metadata sanitization beyond the defined Office properties, AI classification or keyed watermark verification. It cannot certify human authorship or universal watermark removal. There is no billing flow yet.

## Publication and source

`.openai/hosting.json` records the private Site identity and static output directory. Keep that identity on updates. Do not replace the parent repository's GitHub origin with the Sites source endpoint. The initial publication uses an ignored deployment checkout containing this exact website source; the Sites helper owns its Git push/archive. Keep credentials in memory/stdin only.

The comparison protocol is in [the benchmark plan](../docs/research/benchmark-plan.md). No “10× better” or detector-bypass benchmark has been achieved. The next engineering gate is a real model adapter evaluated on protected-edit contracts and held-out document quality. Bounded Office text/property tools are now implemented; see [the supplied-source review](../docs/research/supplied-repositories.md).

## UI structure

The directory and top menu share `dist/tools.js`. Add new shipped tools first and set `isNew`; do not label planned tools ready. Hash task URLs such as `#clean-text`, `#light-edit`, `#characters` and `#text-file` keep the draft in memory. Old `#studio` links resolve to their matching task. `dist/styles.css` is the single stylesheet; `dist/theme.js` applies appearance before paint.

No decorative hero or separate feature bar. One consistent sans-serif font, short tool descriptions, one primary action per task, and advanced controls behind Options. See [design decisions](../docs/ui-design.md).

## Office limits and validation

One transitional OOXML DOCX/PPTX/XLSX at a time: 10 MB input/output, 30 MB expanded package, 1,000 entries, 10 MB per package payload and 5 MB per parsed XML part, 100,000 eligible text characters and 500 edits. Strict OOXML, ZIP64, encrypted, digitally signed, macro-enabled and legacy formats are unsupported. Modern browsers need native raw-deflate decompression. XML declarations/entities that require a DTD are rejected; external relationships are never fetched.

Untouched package payloads retain their compressed bytes. Edited XML is serialized again and verified for an unchanged element/attribute structure, allowing only the `xml:space` preservation attribute on text runs. Run styling, tables, shape positions, formulas and relationships are retained within the supported scope; shorter text can reflow. No-edit text processing returns the exact original bytes. Downloads always use a separate `-cleaned` filename.

Word fields/known code/headings/links/revisions are skipped; headers, footnotes, comments and other parts are untouched. Slide notes/masters are untouched. Spreadsheet formulas and cached formula results, numbers, first-row labels, short cells and phonetic shared strings are skipped; a shared string referenced by a header/formula cell is blocked globally. Metadata cleaning removes child fields from `docProps/core.xml` and `custom.xml`; selected `app.xml` fields are Application, AppVersion, Company, Manager, Template, TotalTime and HyperlinkBase. It is not complete anonymization or statistical watermark removal.

Run `npm test` for synthetic engine/package checks. With python-docx, python-pptx, openpyxl and Node installed, `python ../scripts/check-office-roundtrips.py` generates representative fixtures under ignored `.research/qa`, processes them and independently reopens all six edited/metadata copies. It checks library readability and structural/content invariants, not visual rendering in Microsoft Office. No browser file upload automation was used after the prior declined upload permission.

Homepage cards use the catalog `before` and `after` fields to show input → outcome without an extra description. Task pages keep their title/description; availability badges remain visible and accessible.
