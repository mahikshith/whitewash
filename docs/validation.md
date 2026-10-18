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
