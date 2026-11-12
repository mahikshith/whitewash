# Design

1 November 2026. Replaces the tool-directory design from 18 October.

## Why it changed

The old homepage was 13 identical tiles under a generic tagline, with "AI" in nearly every label. The main job, pasting a draft and fixing it, took a click to reach, and a third of the tiles were placeholders. See [the copy audit](../research/copy-audit.md).

## Layout (Phase 4, dial first)

The product is one idea: drop a file, click one thing, get the finished file back. Every page that takes files is a big dial beside a short explanation.

- **Header tabs, one per kind of file.** Humanize, PDF, Word, Excel, PowerPoint, Images, Audio, Archives (`sections.js`). Hovering a tab drops down every option for that format, in columns by job (From PDF, To PDF, Pages…). Clicking it opens that format's page. Search (Ctrl/⌘K or `/`) sits on the right and only searches; it is not a second tool list.
- **Homepage.** Headline ("Take the AI out of any document."), a before/after card for Humanize and a three-part trust row (never uploaded, no account, no tracking) on the left, the big dial on the right, and nothing else. Before a file, the dial holds the eight tabs and a click opens that format's page. After a drop, the dial shows what you can do with that file. Tool cards live only on each format page.
- **Format pages** (`#humanize`, `#pdf`, `#word`, `#excel`, `#powerpoint`, `#images`, `#audio`, `#archive`) use the same layout: jobs on the dial (grouped ones drill in), then the tools as cards and the conversions as compact chips below.
- **Convert.** Formats on the left, the dial of targets in the middle, notes and results on the right. Pick a format or drop a file, then click a target. If you click a target first, the picker opens and the conversion runs as soon as the file arrives.
- **Editor.** Draft and result side by side, so the page fits a laptop screen without scrolling.
- No hero paste box, no example text, no floating orb.

## One-click Humanize

A document dial has two writing buttons, never more:

- **Humanize** does everything in one pass: filler, stock AI phrases ("delve into", "it is important to note"), chatbot openers and sign-offs, Markdown bold, hidden characters and smart punctuation. Word, PowerPoint and Excel come back as the same file with every style, table and run kept. PDF, HTML, ODT and EPUB come back as a Word file, and the status pill says why. A one-line summary says what changed ("Fixed 13 AI phrases, 2 hidden characters").
- **Edit** opens the text editor already humanized, where every change can be kept or undone.

Quotes, numbers, URLs and code are never touched.

## The dial

`dial.js` draws it as one ring (92 to 254 px), always. The two-layer dial from Phase 4 is gone (12 November 2026): people could not tell which ring to use. A segment with more choices behind it shows a small arrow; clicking it swaps the ring for those choices and turns the middle into Back. A line above the dial says what it is asking.

Every file page has the same three steps, shown as a strip at the top: add a file, pick what you want, save it. Once a file is loaded, the dial's options are repeated beside it as a plain list with a one-line description each, so nobody has to use the dial to get a job done. Hovering either lights the other. When a job finishes, a green card on the page says what was saved and offers "Save again"; the status pill still appears too. The middle is a plain + (no coloured circle). Pointer, touch, keyboard (Tab, arrows, Enter) and file drops all work. The middle button opens the file picker. The first Humanize segment is lit as the primary action. Measurements started from Open-Tangerine and og-converter ([teardown](../research/ui-teardown.md)); the code is our own.

Beside the dial, a card says what the highlighted segment gives you, what it keeps and what it drops.

Quick actions download straight away and report in a status pill at the top of the screen. Anything that needs one more choice (sign, organize pages, protect) opens its tool with the file already loaded.

## Look

Warm paper background, near-black ink, and a lime accent used for highlights, the primary dial segment and "New" labels. Big rounded corners (24–28 px on panels, pill buttons). Headings in Bricolage Grotesque, body in the system sans-serif. Dark mode swaps the primary button to lime.
