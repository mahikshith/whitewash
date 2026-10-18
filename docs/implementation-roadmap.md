# Implementation order after the first editor

18 October 2026. The current site is a browser-local workflow prototype. Its Light edit mode performs a small set of phrase substitutions; it is not the model-powered humanizer described in discovery. The research reports are specifications and evidence, not shipped features.

| Order | Deliverable | What makes it complete |
| --- | --- | --- |
| Shipped | Dark mode | Visible, keyboard-accessible switch, all editor/dialog states themed, device default and remembered choice |
| 1 | Real model-assisted rewriting | Server-side model integration; light polish/plain language/tone controls; bounded requests; reviewable edits; explicit processing disclosure; useful error/cancel states |
| 2 | Meaning and voice controls | Locked names/numbers/citations, contextual factual checks, selected-section rewriting and a voice sample supplied by the user; do not silently accept an edit that violates a lock |
| Shipped, bounded | Office text and metadata | DOCX/PPTX/XLSX prose and defined Office properties now work. Extend scope after interoperability tests; original gate: inspect author/editor/custom properties, selectively remove supported fields in a new copy, reopen and verify; preserve supported text runs/lists/tables and report exceptions |
| 4 | Quality comparison | Blinded comparison against a generic editing prompt, QuillBot and Undetectable AI, with factual errors, naturalness, repair time, latency and cost reported |
| 5 | Detector and watermark research | Known-key experiments with calibrated thresholds, language/length coverage and quality constraints; provider checks only when suitable access is available |
| 6 | More formats and paid workflows | PDF import/review before faithful export; extend existing PPTX/XLSX prose adapters after customer validation. Saved voices, batches, teams, billing and mobile distribution follow repeat-use evidence |

The next core feature is the real rewriting service, not more variations of the current text box. Keep the existing review controls as the output contract, so stronger editing still lets the user inspect and reject changes. Model/service credentials belong on the server, never in this static site's browser code. Choosing and configuring that runtime is part of the next implementation.

The metadata feature and statistical watermark experiments are separate tracks. A metadata-cleaned file must report the exact stores verified. A lower detector score must not be presented as proof of human authorship or a universal watermark-removal result.

Premium remains a hypothesis until the comparison and customer tests show a recurring advantage. The [benchmark plan](research/benchmark-plan.md) defines a measurable path to a 10× claim on a specific workflow rather than a broad unsupported promise.

The October supplied-repository update ships bounded Office adapters and writing review without changing the next core model-service gate. See [implementation and evidence](research/supplied-repositories.md).
