# Design

1 November 2026. Replaces the tool-directory design from 18 October.

## Why it changed

The old homepage was 13 identical tiles under a generic tagline, with "AI" in nearly every label. The main job, pasting a draft and fixing it, took a click to reach, and a third of the tiles were placeholders. See [the copy audit](../research/copy-audit.md).

## Layout

- **Hero with the paste box in it.** "Make it sound like you wrote it." The draft box sits beside the headline. "Polish it" and "Spot AI tells" hand the draft to the full tool page and run it.
- **Drop band with the orb.** Says plainly that a file can be dropped anywhere on the page. "Choose a file" opens the same wheel for touch and keyboard users.
- **Grouped tools.** Writing, Convert, PDF, Office files and privacy, Images. Each card has an icon, a plain title and one sentence.
- **Coming next.** Unbuilt tools are listed once, in a box at the bottom, with their own status pages.

## The wheel

Drag a file over the homepage and a glass radial wheel opens under the cursor. It offers only what fits the file: Polish, AI tells, Clean and quick conversions for text; Polish, Wipe info and conversions for Office files; Word, Polish, Shrink, Sign, Wipe info and Pages for a PDF; Merge for several PDFs; JPG, PNG, WebP, PDF, Wipe info, Shrink and (for one image) Text for images; other audio formats for a sound file, MP3, M4A or WAV for a video; Open plus other archive formats for an archive; and ZIP for any set of several files. "More" opens the full converter. Drop on an option to run it. Dropping on the middle, or outside, keeps the wheel open so you can pick with the pointer or the arrow keys.

Measurements come from Open-Tangerine and og-converter ([teardown](../research/ui-teardown.md)): 62 px inner radius, 150 px outer, 6 px gaps, 12 px corners, a spring open with a staggered fan-out, and a 6 px outward nudge on hover. The code is our own.

A browser only sees a drag once it reaches the tab, and only learns file names on drop. So the wheel uses MIME types during the drag and checks again on drop. If the type is unknown during the drag (Markdown often is), a plain "Drop it anywhere" screen shows instead and the wheel opens on drop.

On tool pages a small floating orb sits in the bottom corner. Drop a file on it, or click it, and the wheel opens around it. Drops elsewhere on a tool page go to that tool.

Quick conversions and wipes download straight away and report in a status pill at the top of the screen. Everything else opens the matching tool page with the file already loaded.

Beside the wheel, a dark card says what the highlighted action gives you, what it keeps and what it drops. It sits on whichever side has room, and under the wheel on phones.

## Menu

The header holds a "Tools" mega menu, four quick links (Polish, Convert, PDF, Wipe metadata) and a search button. The menu has group tabs on the left and that group's tools on the right; typing in its search box replaces both with results, including direct conversion routes. Ctrl/⌘K or `/` opens it from anywhere.

## Look

Warm paper background, near-black ink, and a lime accent used for highlights, the active wheel segment and "New" labels. Big rounded corners (24–28 px on panels, pill buttons). Headings in Bricolage Grotesque, body in the system sans-serif. Dark mode swaps the primary button to lime.
