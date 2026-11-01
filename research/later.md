# Parked ideas

Things we've agreed to do after the conversion and metadata work. Newest at the bottom.

## AI features (from mykee, 1 Nov 2026)
- **Rewrite in your voice.** A real model rewrite on top of the rule-based polish. Two ways to pay for it:
  - *Bring your own key* (OpenAI, Anthropic, Google, etc.). The key stays in the browser and calls go straight to the provider. That's cheap for us and private for the user.
  - *Built-in credits.* We run a small server that holds our key and meters usage. This needs accounts, billing (Stripe) and abuse limits. It also breaks "nothing leaves your browser" for that one feature, so the page must say so clearly.
- **Voice profile.** Paste two or three things you wrote, and the rewrite matches your tone.
- **Explain a flag.** Click a flagged "AI tell" to get a suggested human rewrite of just that sentence.
- **Summarise / shorten / change tone** on any text or extracted PDF.
- **Smarter PDF and scan import.** A model fixes reading order and headings that the local extractor gets wrong.

## Other ideas
- **OCR** for scanned PDFs and photos of text (Tesseract.js, about 6–9 MB, loaded only when used).
- **HEIC → JPG** for iPhone photos.
- **Better image compression** (MozJPEG / WebP encoders via WASM).
- **PDF password protect and unlock** (qpdf WASM).
- **Real redaction** that burns black boxes into the page.
- **Batch mode for documents**: drop a folder of .docx files and polish them all.
- **Install as an app (PWA)** so it works offline once loaded.
- **Hosting:** GitHub Pages for a free public link.
