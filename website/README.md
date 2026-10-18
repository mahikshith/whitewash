# Whitewash writing tools

A browser-local tool directory with one focused page and primary action per task. No framework, package installation, API key or account is needed to run it locally.

From this directory, run `python -m http.server 4173 --bind 127.0.0.1 --directory dist` and open http://127.0.0.1:4173. Use `npm test` (or `node --test tests/*.test.mjs`) for processing checks. The files in dist are the source for this buildless site; they are intentionally tracked.

## Working features

- Clean text: reviewed replacement of nonbreaking spaces and removal of soft hyphens/leading BOM. Zero-width-space removal is optional and off by default.
- Light edit: a small rule-based English phrase editor, explicitly labeled. No model calls.
- Optional, collapsed per-edit review, keep/reject controls, highlighted result, originals retained, stale-result protection and undo for source replacement.
- Unicode inspection with counts and positions. Emoji/script joiners and direction controls are retained. No compatibility normalization or stripping non-ASCII text.
- Exact user-locked phrases, numbers, URLs/email, quotations and conservative code protection.
- Edit text file: local UTF-8 TXT/Markdown selection and drag/drop, followed by automatic local light editing; copy/download. Uploaded originals are never rewritten.
- A 12-tool homepage, shared top menu and dedicated task URLs. Four tools work; future tools have clearly labeled status pages. The mobile layout keeps the primary action visible.
- Light/dark themes: follows device appearance initially; a visible switch saves your choice locally.

## Limits and privacy

One UTF-8 file, 400 KB, 100,000 UTF-16 code units, up to 500 suggestions per review and 50 locked phrases (2,000 characters total). Oversized/unsupported input fails visibly. Only the appearance preference uses local storage; drafts, analytics and external processing are absent from storage/application requests. A hosting service still handles page/access requests. Draft state survives Home/tool navigation in memory and disappears on reload. Clipboard/downloaded copies are controlled by the device.

Markdown is edited as text, not rendered. Both fence types, unclosed fences, indented code, inline-code lines, frontmatter, and heading/link/table/HTML/math-like lines are conservatively retained. This is not a complete Markdown parser or a promise of every dialect's structural fidelity. Mixed-script word boundaries are respected. Word counts are space-delimited estimates and are unsuitable for exact Chinese segmentation.

Light edits are not a factual or grammatical certification. Review them in context. This version does not do general model rewriting, persistent voice profiles, DOCX/PDF/PPTX/XLSX export, metadata sanitization, AI classification or keyed watermark verification. It cannot certify human authorship or universal watermark removal. There is no billing flow yet.

## Publication and source

`.openai/hosting.json` records the private Site identity and static output directory. Keep that identity on updates. Do not replace the parent repository's GitHub origin with the Sites source endpoint. The initial publication uses an ignored deployment checkout containing this exact website source; the Sites helper owns its Git push/archive. Keep credentials in memory/stdin only.

The comparison protocol is in [the benchmark plan](../docs/research/benchmark-plan.md). No “10× better” or detector-bypass benchmark has been achieved. The next engineering gate is a real model adapter evaluated on protected-edit contracts, followed by bounded DOCX metadata and preservation work.

## UI structure

The directory and top menu share `dist/tools.js`. Add new shipped tools first and set `isNew`; do not label planned tools ready. Hash task URLs such as `#clean-text`, `#light-edit`, `#characters` and `#text-file` keep the draft in memory. Old `#studio` links resolve to their matching task. `dist/styles.css` is the single stylesheet; `dist/theme.js` applies appearance before paint.

No decorative hero or separate feature bar. One consistent sans-serif font, short tool descriptions, one primary action per task, and advanced controls behind Options. See [design decisions](../docs/ui-design.md).
