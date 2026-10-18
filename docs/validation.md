# Initial website validation

18 October 2026. Initial browser-local prototype; this is not a production quality certification or competitive benchmark.

## Automated

Twelve Node test cases cover accepted/rejected edit reconstruction, unchanged originals, amounts/dates/citations, both Markdown fence types and unclosed fences, frontmatter/links/tables/indented code, mixed-script boundaries, inline code, multiline/incomplete quotes, protected phrases, Unicode joiners/direction controls, preferences, unsupported/oversized files, suggestion limits and idempotence. Application and engine JavaScript syntax checks pass. Four upstream research-code checks were reproduced separately; see the research report.

## Browser checks

Checked the local site in the in-app browser at its desktop default and a narrow mobile viewport (reported inner width 334 CSS px). Verified:

- Individual rejection and reject-all retain the right source spans; source edits disable stale copy/download.
- A synthetic Markdown file imports locally, selects Markdown mode and preserves frontmatter, a tilde code block, URL/link, numbers, emoji and a Persian non-joiner.
- The downloaded edited Markdown was independently read and exactly matched the expected reviewed text.
- Unsupported PDF import retains the previous draft and shows a useful error. Clear disables processing/export; Undo replace restores the draft.
- Clipboard copy reports success; Unicode inspection reports both protected and eligible characters without removing them.
- Mobile Original/Result controls switch the visible pane, custom locks retain phrases, and Escape closes a dialog. No horizontal overflow observed.
- No browser warning/error logs were reported in the checked local session.

The full-page screenshot endpoint was unavailable; viewport screenshots were available. A full screen-reader/contrast audit, every browser, long-document UI stress tests, live detector/model inference, and paid competitor comparisons were not run. File-system/cloud history and external provenance are outside this prototype's operations.

## Dark-mode update

Sixteen tests now pass (the original twelve plus four appearance tests). Theme checks cover device defaults before controls load, saved-choice precedence, explicit toggling, invalid saved values and disabled storage. Browser checks verified keyboard toggling, preference persistence after reload, retained edit selections, dark dialog colors, mobile control visibility and no horizontal overflow at a reported 334 CSS px. Application text now discloses the saved appearance preference; drafts remain memory-only.

## Tool-directory redesign

Twenty-three tests pass: processing/Unicode/protection checks, theme behavior, tool routes and availability, and UTF-8 file validation. Synthetic byte fixtures verify BOM/Markdown/multilingual preservation and reject invalid encoding, binary data, unsupported formats, oversized bytes and oversized text before processing.

Browser checks verified the 12-tile directory, distinct Clean text/Light edit/Character check pages, one-action results, collapsed optional review, rejection restoring source spans, stale results hidden after input changes, Home navigation preserving the draft and choices, and a PDF status page with no processing form. Light/dark layouts and a narrow viewport were checked. At the reported 334 CSS px mobile width there was no horizontal overflow; the primary action was within the first viewport. One consistent sans-serif family was confirmed.

Browser file uploads were not retried after the user declined the earlier upload-automation request. Only synthetic local-byte unit tests were used for file validation in this redesign; the new selection-to-result UI flow is not browser-verified. No workaround for the denied upload action was attempted. Competitive conversion/retention, paid outputs, model inference and provider watermark verification remain untested.

## Supplied-source feature update and purpose-led labels

18 October 2026. Thirty-four Node tests pass. New checks cover DOCX edits across styled runs, whitespace preservation, cross-paragraph quotations, multi-paragraph fields, locks, known code/headings/links/revisions, table prose, slide position/style invariants, shared/inline spreadsheet strings, formula/cache/header preservation, metadata stores and archive dates, checksums, unsafe/duplicate ZIP paths, decompression overflow, malformed XML/DTD, disguised/macro/signed formats, opt-in punctuation and meaningful Unicode tags/selectors. All browser JavaScript passes syntax checks.

`check-office-roundtrips.py` generated realistic fixtures using the bundled python-docx, python-pptx and openpyxl packages. The same JavaScript engine produced edited and metadata copies for all three formats. All six copies reopened independently. Bold runs, Word tables/headers, slide positions/notes, spreadsheet formulas, numbers, merges, comments and styles passed assertions. Metadata copies retained every non-property package payload, removed the tested author properties, had valid XML/checksums and normalized ZIP dates. Microsoft Office visual rendering was not tested.

Browser checks covered the 13-card home, clear AI-draft purpose and file-task labels, a one-action metadata entry, writing notes, protected facts/quotes in the text editor, collapsed controls, and light/dark appearance. At the reported 334 CSS px mobile width, no horizontal overflow was observed and the Word file action sat inside the first viewport. Browser warnings/errors were empty in the inspected session. A rapid action batch after resizing reached a different route; repeating navigation with an intervening state check reached the correct page and text processing passed. No app exception was logged.

The previously declined browser file-upload action was not retried or recreated. Office file selection through the browser remains unverified; independent synthetic file/library checks covered the processing and export logic. No external detector, model or provider watermark was queried, and no competitive quality benchmark was run. Two narrow upstream source findings are reproducible with `scripts/check-supplied-source.py` and recorded in `research/supplied-source-checks.json`.

Final copy verification: all thirteen feature titles explicitly contain AI. Browser checks confirmed the homepage, top-menu labels and an individual Office task heading. The owner-private live deployment displayed the same copy and reported no browser warnings/errors.
