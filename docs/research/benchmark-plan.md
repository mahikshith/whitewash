# Making the “10× better” goal testable

18 October 2026. QuillBot and Undetectable AI are the intended comparison products; earlier spoken names are interpreted that way. Ten times better is a product ambition, not an established result. No paid competitor output or comparative quality trial has been run yet.

The best initial advantage to test is **time to a faithful, usable document**. More modes alone do not justify a premium. Our proposed quality review and format preservation must work on actual tasks before we claim superiority.

## Comparison protocol

Start with 100 permissioned drafts: emails, reports, proposals, technical explanations and bilingual professional writing. Include non-native English, Chinese and mixed-script stress cases, plus short and long documents. Keep a disjoint development set. Publish sample provenance, versions, dates, selected competitor modes, free/paid tier, limits and unavailable results. Paid-tier access is still required for a fair premium comparison.

Use identical inputs, allowed context, budgets and intended audience. Include the original, our version, QuillBot, Undetectable AI and a plain editing-model prompt. Randomize and blind outputs for readers. Use paired comparisons, confidence intervals and failure rates; preserve refusals, timeouts and truncation in denominators. Do not select only successful examples or tune on the held-out evaluation set.

| Outcome | Measurement | Proposed release gate / ambition |
| --- | --- | --- |
| Faithfulness | Human-adjudicated changed facts, negation, attribution, citations, names and quantities | No critical factual error in the release corpus; publish the finite sample size, not “zero risk” |
| Protected content | Exact matches for locked spans, URLs, code, identifiers and numeric roles | 100% on supported fixtures, fail closed when validation fails |
| Naturalness and voice | Blinded reader preference and edit-acceptance rate | Demonstrate a statistically supported advantage before marketing one |
| Formatting | Structural comparison and rendered review for each supported format | No silent unsupported conversion; publish the support matrix |
| Useful completion time | Input to accepted/exportable result, including repair time | Investigate a 10× reduction on a specific painful workflow; this is not a current result |
| Privacy | Requests containing document content, retention and deletion behavior | Initial local text tools transmit no drafts; later external processing must be explicit |
| Accessibility | Keyboard completion, labels, contrast and small-screen tasks | Entire first-use workflow usable without a mouse |
| Economics | Inference/storage cost per accepted result, p50/p95 latency, refund/support burden | Set price only after costs and willingness to pay are measured |

A 10× claim must name its denominator: e.g. reducing a median 20-minute repair task to 2 minutes on a published corpus. It cannot mean an invented composite score. If competitors already solve the task well, find another valuable workflow or improve the evidence; do not move the scoring rules after seeing results.

## Detector and watermark track

Keep this separate from editing quality. Classifiers need human false-positive measurement by language, length and domain. Calibrate thresholds separately from held-out tests and report coverage/abstentions. Model confidence is not a probability of human authorship.

Known-key watermark experiments need algorithm/version, tokenizer, generation settings, key handling, detector type, threshold calibration, observed tokens and original detection eligibility. Report raw removal, quality-constrained success, invalid outputs, cost and repeated-run variance. Include long and pooled text tests. Never publish secret keys for a real provider. Evaluate authorized provider checks separately if access becomes available.

## Initial website scope and next gates

First: browser-local text cleanup, conservative light-edit suggestions, original/result comparison, accept/reject controls, protected Markdown handling, Unicode inspection and TXT/MD import/export. These establish a functioning workflow without pretending a model or detector exists. Labels must state that light editing is rule-based.

Next: benchmark a real model adapter on the same protected-edit contract. Then bounded DOCX metadata inspection/removal and text-run patching, with independent export checks. PDF, presentations and spreadsheets each require their own preservation gate. A metadata result must enumerate inspected stores, not claim complete erasure.

Premium hypotheses: saved client voice/glossaries, reliable document workflows and team review. Free local cleanup can acquire users. Do not add fake plans, checkout or unsupported “undetectable” guarantees to an early prototype. Charge after a target customer repeatedly chooses the result and the unit economics support the service.
