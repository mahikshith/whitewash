# Whitewash

Product discovery for a web and mobile writing tool that improves clarity, cleans text artifacts, and helps users review changes while preserving meaning and supported document structure.

Planned feature: Metadata & Privacy, with inspection, selective removal of supported metadata, and a verified export report. Metadata cleanup does not guarantee removal of statistical text watermarks or external provenance records.

Status: browser-local website with the writing tools, about 250 file conversions (documents, data, images, audio, archives), PDF tools and a metadata wiper for photos, PDFs and Office files. Model-assisted rewriting, AI classification and provider watermark checks are research/roadmap items, not connected services. Parked ideas are in [research/later.md](research/later.md).

The product must distinguish Unicode cleanup, writing improvement, statistical AI detection, and provider watermark verification. It must not promise universal detector bypass or certify human authorship from a detector score.

Read the [product discovery and implementation proposal](docs/product-discovery.md) for feasibility, competitors, open-source options, format limits, validation, and a proposed launch sequence.

The repository is private. Product name, audience, implementation stack, and pricing remain open decisions.

Research checkpoint (18 October 2026): [15-repository code audit](docs/research/repository-audit.md), [watermark evidence](docs/research/watermark-evidence.md), [community findings](docs/research/community-findings.md), and [competitive benchmark plan](docs/research/benchmark-plan.md). These distinguish observed code, author claims, reproduced checks and untested product hypotheses.

The [user guide](docs/user-guide.md) explains how to get around the site and do the common jobs, and [how the conversions work](docs/conversions.md) covers what each route keeps, its limits and how it was tested. The [website guide](website/README.md) covers running, testing and current limits. The initial site uses plain HTML/CSS/JavaScript with no runtime dependencies. Source is under `website/dist/`; the hosting manifest binds the private Sites preview separately from this GitHub origin.

Open the [private website preview](https://whitewash-studio.astute-newt-2147.chatgpt.site). [Validation](docs/validation.md) and [deployment details](docs/deployment.md) record completed checks and operational limits.

The [implementation roadmap](docs/implementation-roadmap.md) separates working tools from the next model, document and metadata features. The [design notes](docs/ui-design.md) cover the new homepage, the drop-anywhere wheel and the image tools. The [research folder](research/README.md) holds the converter teardown, the conversion-site survey and the phased plan.
