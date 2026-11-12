# Research: converter UI and conversion tools

1 November 2026. Collected before the redesign so later work has one place to start.

| File | What it covers |
|---|---|
| [plan.md](plan.md) | The phased plan, what each phase ships, and what we are deliberately not building |
| [ui-teardown.md](ui-teardown.md) | How the drag → wheel → drop → result flow works in Open-Tangerine and og-converter, with geometry, timings, colours and a web translation |
| [conversion-research.md](conversion-research.md) | What iLovePDF, Smallpdf, PDF24, CloudConvert and the open-source browser converters offer, and which of those can run fully in a browser |
| [copy-audit.md](copy-audit.md) | Why the current site reads as machine-written, line by line |
| [audio-archives-synthid.md](audio-archives-synthid.md) | Browser audio and archive libraries compared, why video is out, and the SynthID removal repos with the decision not to build it |
| [conversion-teardown.md](conversion-teardown.md) | How ppt-master, pdf2docx, markitdown, PPTXjs, mammoth, docxjs and pandoc keep formatting, and what we took from each (12 November 2026) |
| [later.md](later.md) | Parked ideas, including AI features with your own key or paid credits |

## Sources

- [Open-Tangerine](https://github.com/sintaxerrorpvtltd/Open-Tangerine) at `53f1a75`, SwiftUI Mac app, GPL-3.0
- [og-converter](https://github.com/Dr-At0mic/og-converter) at `c4218a9`, WPF Windows app, GPL-3.0
- [tangerineformac.com](https://tangerineformac.com/), the closed commercial app both were inspired by. Its site describes the interaction but shows little visual detail and says its demos are simulated.

## Ground rules that came out of this

1. **No code from either repo.** Both are GPL-3.0. Copying any of it would put Whitewash under GPL. We reimplement from measured behaviour.
2. **No branding from Tangerine.** The orange accent, mascot and notch pill are theirs. We use the mechanics with our own look.
3. **Browser-local stays the promise.** Every library is vendored and served from our own origin. No CDN, no upload.
4. **The web can't see a drag until it reaches the tab.** The desktop apps open the wheel anywhere on the OS. Ours opens when a file is dragged over the page. On phones there is no drag, so a tap on "Choose file" opens the same wheel.
