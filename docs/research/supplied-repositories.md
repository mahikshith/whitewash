# Supplied repositories: findings and implementation

18 October 2026. The useful result of this review is five working tools: refine Word text, refine slide text, refine spreadsheet prose, clear Office properties, and check writing for reviewable phrases. These are bounded local tools, not a general Office editor or a model-powered rewrite service.

The homepage now states the purpose: **Humanize AI-written text.** Every feature title explicitly says AI; file cards name the AI-text task rather than calling Whitewash a general Office editor.

## Coverage and branches

The [source manifest](supplied-source-manifest.json) records 944 downloaded textual source, test, documentation and configuration files, with pinned commits and SHA-256 hashes. All six selected repository trees were untruncated. Binary media, fonts, archives and large training corpora were excluded. Downloading a file is not a claim that every line was manually reviewed. The paths below identify the implementation paths examined in depth; media research internals and every topic-page listing were not exhaustively audited.

| Repository | Selected branch and commit | Other branches checked |
| --- | --- | --- |
| AhmadHassan-BTed/Turnitout-Humanizer | `main` · `b660c932f005df37360e77b845976e02e33159d6` | `scrapbook-design` is 7 commits behind, with no unique commits |
| Olib-AI/llm-cleanup | `main` · `6188f8549fd72909667e7dbe415fc82240aea06f` | Only main listed |
| wiltodelta/remove-ai-watermarks | `main` · `5677c22a6b1ce7231a7dd0eb324cba6875f37864` | Research-landscape branch is 38 commits behind; Synthesia branch is 6 behind; neither has unique commits |
| lynote-ai/humanize-text | `main` · `190a4887f43bac184c8034313b1d014cc0fc73e2` | Only main listed |
| rudra496/StealthHumanizer | `master` · `fce08d2017058e9d43eabedf539c4000add8eeb7` | Cross-links branch is behind; divergent Copilot branch adds job polling/error handling and four samples; divergent Dependabot branch changes an Action version |
| Shreyan1/ai-text-watermark-remover | `main` · `f96fa2afb8b257dcec8bac7eb2603a4d2f265463` | Only main listed |

The first three are the explicitly linked repositories. The latter three were selected from the supplied [AI-humanizer](https://github.com/topics/ai-humanizer) and [text-humanizer](https://github.com/topics/text-humanizer) discovery pages for actual implementation relevance. Previously reviewed Chinese projects, Humanizer, MarkLLM and SynthID remain documented in the earlier audit. Topic labels and star counts were not treated as evidence of quality.

## What the code actually contributes

**Turnitout:** its public tree contains the website, documentation and assets, not the advertised Streamlit engine, thousands of rules, DOCX processor or citation backend. The inspected `docs/script.js` applies a short replacement list and assigns fixed 4% and 0% displays; it does not measure a detector result. The architecture and README describe a substantially larger system than the code available in this branch. Its license is proprietary. We used neither its implementation nor its fixed score display. [Pinned script](https://github.com/AhmadHassan-BTed/Turnitout-Humanizer/blob/b660c932f005df37360e77b845976e02e33159d6/docs/script.js), [license](https://github.com/AhmadHassan-BTed/Turnitout-Humanizer/blob/b660c932f005df37360e77b845976e02e33159d6/LICENSE).

**Olib:** the Rust format adapters, core pipeline/splicer and rule modules provide the strongest document-processing design here. DOCX paragraphs are grouped across text runs, split at visual breaks, transformed, and checked against a structural fingerprint. Non-text package parts are copied through. Flag-only lexical review is preferable to treating ordinary vocabulary as proof of AI authorship. Whitewash independently implements those architectural ideas in browser JavaScript; it does not port the Rust code. We also retain Unicode tags and variation selectors, which can form legitimate flag emoji and glyph choices. License: MIT. [DOCX adapter](https://github.com/Olib-AI/llm-cleanup/blob/6188f8549fd72909667e7dbe415fc82240aea06f/crates/cleanup-formats/src/docx.rs), [pipeline](https://github.com/Olib-AI/llm-cleanup/blob/6188f8549fd72909667e7dbe415fc82240aea06f/crates/cleanup-core/src/pipeline.rs), [Unicode rules](https://github.com/Olib-AI/llm-cleanup/blob/6188f8549fd72909667e7dbe415fc82240aea06f/crates/cleanup-rules/src/unicode_hidden.rs).

**remove-ai-watermarks:** its `humanizer.py` works on image pixels; `text_draft.py` drafts OCR lines for image-text restoration. Neither is an LLM prose rewriter. Metadata removal, visible image marks, pixel marks and audio/video handling are distinct paths. The useful transfer is its `strip_and_verify` pattern: reopen the exported copy and report residuals. Its own limitations distinguish metadata removal from provider verification of invisible marks. Whitewash applies output verification to defined Office property stores; no pixel/video pipelines were inserted into the writing app. License: Apache-2.0. [Verification code](https://github.com/wiltodelta/remove-ai-watermarks/blob/5677c22a6b1ce7231a7dd0eb324cba6875f37864/src/remove_ai_watermarks/metadata.py), [limitations](https://github.com/wiltodelta/remove-ai-watermarks/blob/5677c22a6b1ce7231a7dd0eb324cba6875f37864/docs/known-limitations.md).

**Lynote:** the standard pipeline performs two model calls followed by Google and Niutrans translation. It needs external services and credentials; it is not a browser-local rule pack. The separate postprocessor performs random vocabulary substitutions without word-boundary or protected-region checks. A narrow reproduced check changes `robust_value` to `strong_value` and a standalone quoted `robust` to `strong`. Those substitutions are unsuitable for our protected-content contract. Provider abstraction, bounded retries and traceable steps are useful ideas for the future server service. License: MIT. [Pipeline](https://github.com/lynote-ai/humanize-text/blob/190a4887f43bac184c8034313b1d014cc0fc73e2/src/standard/pipeline.py), [postprocessor](https://github.com/lynote-ai/humanize-text/blob/190a4887f43bac184c8034313b1d014cc0fc73e2/src/methodologies/postprocess.py).

**StealthHumanizer:** reviewed paths include region protection, the detector, provider routing, text processing, and the divergent job-polling patch. It offers useful product ideas: protected regions, explicit processing state, comparison, voice samples and bounded provider workflows. Its local detector includes pattern counts, word-frequency proxies and heuristic score intervals. These are not validated probabilities that a particular author used AI. Whitewash exposes concrete writing notes instead. Its regex protection recognizes triple-backtick fences; our existing protection also covers tilde and unclosed fences. License: MIT. [Region protection](https://github.com/rudra496/StealthHumanizer/blob/fce08d2017058e9d43eabedf539c4000add8eeb7/lib/protect-regions.ts), [detector](https://github.com/rudra496/StealthHumanizer/blob/fce08d2017058e9d43eabedf539c4000add8eeb7/lib/detector.ts).

**AI text watermark remover:** this is a research-oriented regeneration pipeline with metadata/Unicode stages, local-model extraction and rewriting, similarity and fact gates. Its reported watermark experiment uses its own key and a simplified word-level reference; this does not establish removal of production Claude or Gemini watermarks. Its results also document similarity checks accepting factual inversions. The Unicode scrubber strips joiners/format controls, folds homoglyphs and applies NFKC, which conflicts with our multilingual preservation requirements. No code was copied. Packaging declares Apache-2.0, but no standalone LICENSE appeared in the pinned tree; that is recorded rather than silently treating the repository as cleared for vendoring. [Measured scope](https://github.com/Shreyan1/ai-text-watermark-remover/blob/f96fa2afb8b257dcec8bac7eb2603a4d2f265463/RESULTS.md), [scrubber](https://github.com/Shreyan1/ai-text-watermark-remover/blob/f96fa2afb8b257dcec8bac7eb2603a4d2f265463/src/reweave/scrub/unicode_scrubber.py), [package declaration](https://github.com/Shreyan1/ai-text-watermark-remover/blob/f96fa2afb8b257dcec8bac7eb2603a4d2f265463/pyproject.toml).

## The supplied commercial website

The public home and document pages of [AI Metadata Remover](https://aimetadataremoval.com/document-metadata/) were inspected in the browser. The useful interaction is simple: choose a file, see properties, edit/clean, download. It advertises 100 MB Office files and server processing/deletion. Those are vendor claims; we did not upload a document, validate deletion, or access private server code. Whitewash instead ships defined Office property removal on the device, with a 10 MB limit and an exported-copy check. Media C2PA removal and invisible statistical text watermarking remain different features.

## Implemented now

| Task | Scope |
| --- | --- |
| Refine Word text | Main-body/table prose, including phrases split across runs; known code, fields, links, revisions and headings skipped |
| Refine slide text | Text in slide parts; shape properties, slide relationships, notes and masters retained |
| Refine spreadsheet text | Long prose in inline/shared string cells; formulas, numeric cells, first-row labels and short cells retained; shared header strings blocked everywhere |
| Metadata cleaner | Standard core/custom property children, selected app properties, ZIP dates/extras/comments; exact removed fields shown |
| Writing check | Specific filler, promotional and assistant-style wording flagged for review; no classifier percentage |
| Existing tools extended | Optional plain punctuation, inspection of tag characters and variation selectors, preserving meaningful Unicode |

These tools run offline after the page loads. They use the existing small English phrase editor, not generative rewriting. No upstream runtime code or service calls were added. The only new package is a test-only XML parser. Original files are never overwritten.

The engine checks package limits/checksums, XML structure, edited text reconstruction and the exported copy. Representative files generated with python-docx, python-pptx and openpyxl were edited and independently reopened; tables, bold runs, notes, positions, formulas, merges, comments and metadata invariants passed. This is not a claim of perfect Office rendering or every document dialect. Edited XML is serialized again and shorter text can reflow. See [validation](../validation.md) and [website limits](../../website/README.md).

## Next engineering work

The core missing capability is a real model rewrite with voice controls. Build it as a disclosed server service with locked-content validation, bounded cost, cancellation, and before/after review. Evaluate factual changes and repair time on held-out documents before using detector results as a secondary research measure. Translation chains and repeated detector-guided loops should be experiments with quality/latency budgets, not silent default processing.

PDF rewriting/export, general AI classification, image/audio/video processing, universal watermark removal, billing and a paid quality advantage are not implemented by this update. The [benchmark plan](benchmark-plan.md) still defines the evidence needed for a competitive claim.
