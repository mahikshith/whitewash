# Watermark evidence and practical experiments

18 October 2026. Statistical text watermarks can be weakened or defeated in specific settings. The engineering question is whether an attack preserves the user's meaning, works on the target provider/version, remains effective across lengths and languages, and costs less than the value it creates. No result below demonstrates universal removal from arbitrary Claude output.

## First distinguish the mechanisms

Invisible characters are observable code points. File metadata lives in format-specific stores. A statistical text watermark changes the distribution of generated words. Cleaning a nonbreaking space or author property does not test that statistical signal. A style classifier is a different mechanism again.

Anthropic says its text watermark adds no hidden characters and describes a SynthID-derived sampling approach. Its public support page should be checked for current model coverage; the announced detector access is a private preview for eligible organizations. Public reference keys do not supply Anthropic's production keys. Conversely, not possessing a key does not make attacks impossible: paraphrasing attacks can operate without it. It limits our ability to verify their success on that provider. [Anthropic announcement](https://www.anthropic.com/news/claude-text-watermark), [current support explanation](https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content)

## Research comparison

| Primary source | What it establishes | Product implication |
| --- | --- | --- |
| [Watermarks in the Sand, ICML 2024](https://proceedings.mlr.press/v235/zhang24o.html) | Quality-oracle-guided random walks can attack schemes under mixing and oracle assumptions, with experiments on three schemes. | A serious research direction, not an unconditional fast bypass theorem. Our inspected implementation uses detector feedback and has execution/export issues. |
| [Sandcastles in the Storm, ACL 2025](https://aclanthology.org/2025.acl-long.1436/) | Revisits practical assumptions. Automated attacks averaged 26.1% success; human quality adjudication reduced that to 10.5% in the studied setting. Best tested oracle had F1 77.4%. | A lower score can hide quality damage. Independent human review and bounded compute are required. These figures are not our measurements or predictions for Claude. |
| [RLCracker, ICML 2026](https://proceedings.mlr.press/v306/huang26ch.html) | RL-based paraphrasing with semantic/distribution objectives; detector-access assumptions must be read against the exact paper version. | Potential later training project. Reported high removal for a particular scheme/length cannot be generalized to every provider. Code inspection is not reproduction. |
| [MarkSec, September 2026 preprint](https://arxiv.org/html/2609.16681v1) | Quality-constrained evaluation across six watermark families and three open model families; raw removal and quality-constrained rankings differ. | Use quality-constrained success and original eligibility as denominators. Public project pages were accessible, but the referenced GitHub code could not be resolved during this audit; no code audit claim. |
| [DIPPER, NeurIPS 2023](https://arxiv.org/abs/2303.13408) | Controlled lexical/order paraphrasing attacks historical watermark/classifier settings and studies retrieval defenses. | Paraphrasing is a legitimate baseline, but an 11B research model is not automatically the best serving choice today. |
| [On the Reliability of Watermarks, ICLR 2024](https://arxiv.org/abs/2306.04634) | Watermark evidence can survive edits and accumulate with longer texts in the tested settings. | Evaluate the whole supported length range and pooled evidence; short-sample non-detection is not absence. |
| [Cross-lingual consistency, ACL 2024](https://aclanthology.org/2024.acl-long.226/) | Translation attacks several schemes and motivates a cross-lingual defense. | Language hopping is a test condition, not a universal workaround. Measure translation quality and changed facts as well as detection. |

The [Sandcastles methods and results](https://arxiv.org/html/2505.06827v1) specifically question efficient mixing and quality-oracle reliability. [MarkSec's protocol](https://arxiv.org/html/2609.16681v1) also makes the eligible original, invalid output and missing quality data important to the reported success rate. These observations support a quality-first experiment rather than a “rewrite until green” loop.

## Modes worth testing

1. **Character cleanup:** deterministic, visible edits with language-aware preservation. Useful today, without a watermark claim.
2. **Meaning-preserving rewrite:** a later model service with selected voice, locked terms and factual checks. Evaluate one pass before repeated paraphrasing. An editing provider may watermark its own output; test that too.
3. **Research watermark evaluation:** isolated, known-key generation/detection, explicit access assumptions and fixed budgets. Start with SynthID and a second MarkLLM family. Do not expose public demonstration keys as a production origin checker.
4. **Provider verification:** only after access is available. Report provider/version, coverage and inconclusive cases. A negative result says that check found no evidence, not “written by a human.”

For research, compare identity, Unicode-only cleanup, plain paraphrase, translation round-trip and quality-constrained perturbations under the same quality floor. Add RL only if a simpler baseline leaves a commercially meaningful gap. Evaluate naturalness with blinded readers, and facts using both deterministic locks and contextual adjudication: preserving the multiset of numbers does not preserve who paid whom.

## Decision

Build useful cleanup and review controls now. Continue a separate known-key lab before offering a watermark-related mode. Do not label a future output “watermark-free” from lexical distance, absence of metadata or an ordinary classifier. The promising opportunity is making a faithful edit easy to trust, while accurately reporting what was checked.
