# Whitewash draft studio

A working browser-local editor, with a warm, quiet workspace and responsive original/result views. No framework, package installation, API key or account is needed to run it locally.

From this directory, run `python -m http.server 4173 --bind 127.0.0.1 --directory dist` and open http://127.0.0.1:4173. Use `npm test` (or `node --test tests/*.test.mjs`) for processing checks. The files in dist are the source for this buildless site; they are intentionally tracked.

## Working features

- Clean text: reviewed replacement of nonbreaking spaces and removal of soft hyphens/leading BOM. Zero-width-space removal is optional and off by default.
- Light edit: a small rule-based English phrase editor, explicitly labeled. No model calls.
- Per-suggestion acceptance/rejection, bulk controls, highlighted result, original retained, stale-result export prevention, and undo for file/sample/clear replacement.
- Unicode inspection with counts and positions. Emoji/script joiners and direction controls are retained. No compatibility normalization or stripping non-ASCII text.
- Exact user-locked phrases, numbers, URLs/email, quotations and conservative code protection.
- Local UTF-8 TXT/Markdown import and drag/drop; reviewed copy/download. Uploaded originals are never rewritten.
- Responsive mobile Original/Result views, labeled controls, keyboard focus and native dialogs.
- Light/dark themes: follows device appearance initially; a visible switch saves your choice locally.

## Limits and privacy

One UTF-8 file, 400 KB, 100,000 UTF-16 code units, up to 500 suggestions per review and 50 locked phrases (2,000 characters total). Oversized/unsupported input fails visibly. Only the appearance preference uses local storage; drafts, analytics and external processing are absent from storage/application requests. A hosting service still handles page/access requests. Draft state is memory-only and disappears on reload. Clipboard/downloaded copies are controlled by the device.

Markdown is edited as text, not rendered. Both fence types, unclosed fences, indented code, inline-code lines, frontmatter, and heading/link/table/HTML/math-like lines are conservatively retained. This is not a complete Markdown parser or a promise of every dialect's structural fidelity. Mixed-script word boundaries are respected. Word counts are space-delimited estimates and are unsuitable for exact Chinese segmentation.

Light edits are not a factual or grammatical certification. Review them in context. This version does not do general model rewriting, persistent voice profiles, DOCX/PDF/PPTX/XLSX export, metadata sanitization, AI classification or keyed watermark verification. It cannot certify human authorship or universal watermark removal. There is no billing flow yet.

## Publication and source

`.openai/hosting.json` records the private Site identity and static output directory. Keep that identity on updates. Do not replace the parent repository's GitHub origin with the Sites source endpoint. The initial publication uses an ignored deployment checkout containing this exact website source; the Sites helper owns its Git push/archive. Keep credentials in memory/stdin only.

The comparison protocol is in [the benchmark plan](../docs/research/benchmark-plan.md). No “10× better” or detector-bypass benchmark has been achieved. The next engineering gate is a real model adapter evaluated on protected-edit contracts, followed by bounded DOCX metadata and preservation work.
