# Whitewash

Product discovery for a web and mobile writing tool that improves clarity, cleans text artifacts, and helps users review changes while preserving meaning and supported document structure.

Planned feature: Metadata & Privacy, with inspection, selective removal of supported metadata, and a verified export report. Metadata cleanup does not guarantee removal of statistical text watermarks or external provenance records.

Status: first browser-local website implemented. Model-assisted rewriting, AI classification, provider watermark checks and Office/PDF metadata sanitization are research/roadmap items, not connected services.

The product must distinguish Unicode cleanup, writing improvement, statistical AI detection, and provider watermark verification. It must not promise universal detector bypass or certify human authorship from a detector score.

Read the [product discovery and implementation proposal](docs/product-discovery.md) for feasibility, competitors, open-source options, format limits, validation, and a proposed launch sequence.

The repository is private. Product name, audience, implementation stack, and pricing remain open decisions.

Research checkpoint (18 October 2026): [15-repository code audit](docs/research/repository-audit.md), [watermark evidence](docs/research/watermark-evidence.md), [community findings](docs/research/community-findings.md), and [competitive benchmark plan](docs/research/benchmark-plan.md). These distinguish observed code, author claims, reproduced checks and untested product hypotheses.

The [website guide](website/README.md) covers running, testing and current limits. The initial site uses plain HTML/CSS/JavaScript with no runtime dependencies. Source is under `website/dist/`; the hosting manifest binds the private Sites preview separately from this GitHub origin.
