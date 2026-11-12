# The document model

Every document conversion reads the source into one block list and writes the
target from it. Add a reader or a writer, never a pairwise converter. Two
routes skip the block list because they are about page layout, not text flow:
PowerPoint to PDF (`pptx-render.js`) and PDF to PowerPoint (`pdf-to-pptx.js`).

A document is `{ title, blocks, page? }`.

## Runs

Inline text is a list of runs. A run is `{ text }` plus any of:

| Field | Meaning |
| --- | --- |
| `b`, `i`, `u`, `s` | bold, italic, underline, strikethrough |
| `code` | inline code (monospace) |
| `sup`, `sub` | superscript, subscript |
| `href` | link target (http, https or mailto only) |
| `color` | text colour as `RRGGBB` |
| `mark` | highlighted text |
| `size` | font size in points, only when the source sets one that matters |

A `\n` inside `text` is a line break.

## Blocks

| `t` | Fields | Notes |
| --- | --- | --- |
| `h` | `level` 1-6, `runs`, `align?`, `color?`, `size?` | heading. `color` and `size` only when the source sets them |
| `p` | `runs`, `align?`, `indent?` | paragraph. `indent` is a list depth for text that continues a list item |
| `li` | `ordered`, `depth`, `n`, `runs`, `task?` | one list item. `n` is its number. `task` is `true`/`false` for a checkbox item |
| `code` | `text`, `lang?` | code block, whitespace kept |
| `quote` | `runs` | one quoted paragraph |
| `hr` | | horizontal rule |
| `table` | `rows`, `align?`, `head?`, `widths?` | `rows[r][c]` is a list of runs. `align[c]` is `left`, `center` or `right`. `head` is the number of header rows (default 1). A cell array may carry `span` (columns); the cells it covers are empty arrays marked `merged`. `widths[c]` is each column's share of the text width (0 to 1) |
| `img` | `bytes`, `mime`, `width`, `height`, `alt?` | `bytes` is a `Uint8Array` of a PNG or JPEG. Width and height are in CSS pixels (96 per inch) |
| `break` | | page break |

Any block may carry `quote: n`, the depth of the block quote it sits in.
`align` is `left`, `center`, `right` or `justify`.

Writers must accept every block type and never throw on an unknown field.
Readers only emit what they are sure of.
