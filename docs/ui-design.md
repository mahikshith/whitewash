# Design

1 November 2026. Replaces the tool-directory design from 18 October.

## Why it changed

The old homepage was 13 identical tiles under a generic tagline, with "AI" in nearly every label. The main job, pasting a draft and fixing it, took a click to reach, and a third of the tiles were placeholders. See [the copy audit](../research/copy-audit.md).

## Layout (Phase 4, dial first)

The product is one idea: drop a file, click one thing, get the finished file back. Every page that takes files is a big dial beside a short explanation.

- **Header tabs.** Humanize, Convert, PDF, Compress, Audio, Archives, Privacy. Hovering a tab opens a dropdown that lists every tool in it. Search (Ctrl/⌘K or `/`) sits on the right.
- **Homepage.** Headline and a "How it works" card on the left, the big dial on the right. Before a file, the dial's segments open each section (plus "Paste text"). After a drop, they become what you can do with that file. Tool cards for every section sit below.
- **Section pages** (`#humanize`, `#pdf`, `#compress`, `#audio`, `#archive`, `#privacy`) use the same layout. Before a file, segments open that section's tools or ask for a file type; after a drop, they run that section's actions. `#pdf` shows all 15 PDF tools instead of landing on Merge.
- **Convert.** Formats on the left, the dial of targets in the middle, notes and results on the right. Pick a format or drop a file, then click a target. If you click a target first, the picker opens and the conversion runs as soon as the file arrives.
- **Editor.** Draft and result side by side, so the page fits a laptop screen without scrolling.
- No hero paste box, no example text, no floating orb.

## One-click Humanize

A document dial has two writing buttons, never more:

- **Humanize** does everything in one pass: filler, stock AI phrases ("delve into", "it is important to note"), chatbot openers and sign-offs, Markdown bold, hidden characters and smart punctuation. Word, PowerPoint and Excel come back as the same file with every style, table and run kept. PDF, HTML, ODT and EPUB come back as a Word file, and the status pill says why. A one-line summary says what changed ("Fixed 13 AI phrases, 2 hidden characters").
- **Edit** opens the text editor already humanized, where every change can be kept or undone.

Quotes, numbers, URLs and code are never touched.

## The dial

`dial.js` draws it: 96 px inner radius, 236 px outer, 7 px gaps, 14 px corners, a staggered fan-out and a 7 px outward nudge on hover. Pointer, touch, keyboard (Tab, arrows, Enter) and file drops all work. The middle button opens the file picker. The first Humanize segment is lit as the primary action. Measurements started from Open-Tangerine and og-converter ([teardown](../research/ui-teardown.md)); the code is our own.

Beside the dial, a card says what the highlighted segment gives you, what it keeps and what it drops.

Quick actions download straight away and report in a status pill at the top of the screen. Anything that needs one more choice (sign, organize pages, protect) opens its tool with the file already loaded.

## Look

Warm paper background, near-black ink, and a lime accent used for highlights, the primary dial segment and "New" labels. Big rounded corners (24–28 px on panels, pill buttons). Headings in Bricolage Grotesque, body in the system sans-serif. Dark mode swaps the primary button to lime.
