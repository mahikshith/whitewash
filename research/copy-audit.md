# Copy audit of the ChatGPT-era site

Snapshot of `website/dist` at commit `51d386c`.

## The problems

1. **"AI" is stamped on almost every label.** "AI text in Word", "AI text polish", "AI character check", "AI file metadata", "Your AI text", "Paste your AI text here…". It reads like keyword stuffing. It also tells the visitor their own writing is the problem, which is not what someone polishing a report wants to hear.
2. **Cards read like a data model.** "AI prose cells → Clearer prose", "AI file properties → Cleaned copy", "Text → AI signals". The before/after arrows were a good idea, but the nouns are internal ones.
3. **Help and Privacy are a spec dump.** "Expanded package limit 30 MB, 1,000 parts, 5 MB per XML part, 100,000 editable characters and 500 edits." Accurate, but nobody reads it. The limits belong in an error message at the moment someone hits them.
4. **Over-hedged.** "Editorial notes only. These phrases do not establish AI authorship." "Markdown protection is conservative, not a full renderer." Every sentence apologises for something.
5. **Generic tagline.** "Humanize AI-written text. Convert AI drafts into clearer, more natural writing." This is the same line every humanizer site uses.

## Layout problems

1. **13 identical tiles, no hierarchy.** The thing most people came to do, paste text and fix it, is one tile among thirteen.
2. **Four of the thirteen are "Soon" or "Research".** Placeholder tiles make the product look unfinished.
3. **Grey page, white boxes, one system font.** Clean, but there is nothing to remember. The rules in `AGENTS.md` (no hero, one font) caused much of this, so the redesign replaces them.

## Direction for the rewrite

- Talk to the reader in plain words: "Paste your draft", "Fix it", "Drop a file".
- Say "AI" where it helps someone find the tool (the hero and the humanizer), not on every button.
- Keep limits in errors and in Help, and write them as one short sentence each.
- Hide unbuilt tools from the main grid and list them once as "Coming next".
