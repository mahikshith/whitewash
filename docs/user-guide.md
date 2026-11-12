# How to use Whitewash

Everything runs in your browser tab. Files are never uploaded.

## The three steps

Every page that takes a file works the same way, and the strip at the top of the page shows where you are.

1. **Add a file.** Drop it anywhere on the page, or click the + in the middle of the dial.
2. **Pick what you want.** The dial and the plain list beside it show the same jobs. Use whichever you like. Pointing at a job shows what you get, what is kept and what is dropped.
3. **Save it.** The finished file goes to your downloads. A green card says what was saved and has a "Save again" button.

"Change file" swaps the file. "Start over" clears it.

## Reading the dial

- A segment with a small arrow (›) holds more choices, for example **More** or **Pages**. Click it and the dial shows those choices. The middle turns into **Back**.
- The line above the dial always says what the dial is asking.
- The lit segment is the usual choice for that file (Humanize for documents).
- Keyboard: Tab to the dial, arrow keys to move, Enter to pick, Escape to go back.

## Finding your way around

| You want to | Go to |
| --- | --- |
| Do anything with one file | The homepage. Drop the file and pick a job |
| See everything for one kind of file | The tabs at the top: Humanize, PDF, Word, Excel, PowerPoint, Images, Audio, Archives |
| Convert without a file in hand yet | A format tab, then click a conversion on the dial. The file picker opens and the conversion runs as soon as you choose the file |
| Find a tool by name | Search (Ctrl/⌘ K or `/`). Try "pdf to word" or "compress" |
| Convert many files of one type | The Convert page (`#convert`), up to 50 files |
| Read a scan or a photo of a page | PDF tab, then "Read text from scans" |

## Common jobs

**Markdown to Word or PDF.** Drop the `.md` file, click Word or PDF. Headings, nested and numbered lists, task lists, tables, code blocks, quotes, links and bold/italic all carry over. Pictures embedded in the file as data links are kept. Pictures that are web links or separate files can't be fetched from a browser tab, so a "[Picture: …]" line marks where each one was.

**Word to PDF.** Drop the `.docx`, click PDF. You get a clean, reflowed PDF: text, heading sizes and colours, lists, tables with their column widths, pictures and footnotes. It is not a page-for-page copy of Word's layout. Text boxes and floating shapes become ordinary paragraphs, and charts are left out.

**PowerPoint to PDF.** Drop the `.pptx`, click PDF. Each slide becomes one page that looks like the slide: backgrounds, pictures, shapes, tables and text in place.

**PDF to PowerPoint.** Drop the PDF, click PowerPoint. Each page becomes one slide. The text is real, editable text boxes in the same places; everything else on the page (pictures, lines, backgrounds) is one background picture.

**PDF to Word.** Drop the PDF, click Word. The text is rebuilt into headings, paragraphs, lists and tables that you can edit. A scanned PDF is read with OCR automatically, which is slower.

**Scan or photo to Word.** PDF tab, "Read text from scans", choose the picture. "Save as Word" and "Save as Markdown" keep the headings, columns, lists and simple tables found on the page. The text box, Copy and ".txt" give plain text you can fix first.

**Humanize.** Drop a document and click Humanize. Word, PowerPoint and Excel files come back as the same file with the wording cleaned.

## When something looks wrong

- **"Too large when unpacked."** Office files are limited to 60 MB, and 200 MB once unpacked.
- **A PDF made from Word looks different from Word.** That is expected: see "Word to PDF" above. For an exact copy, print to PDF from Word itself.
- **Odd characters in a PDF.** Emoji, Chinese, Japanese, Korean, Arabic and similar scripts are drawn as small pictures, so they show but can't be selected as text.
- **OCR got words wrong.** It reads English print. Photos taken at an angle, handwriting and low-resolution scans do poorly.

What each conversion keeps and drops, and how it was tested, is in [conversions.md](conversions.md).
