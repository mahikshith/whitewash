# Converter UI teardown (Open-Tangerine / og-converter / Tangerine)

Paths: OT = `NativeApp/Sources` in [Open-Tangerine@53f1a75](https://github.com/sintaxerrorpvtltd/Open-Tangerine/tree/53f1a75be2c50a7fc88ed5968675a818a55c321f). OG = `src` in [og-converter@c4218a9](https://github.com/Dr-At0mic/og-converter/tree/c4218a9bcdbcc63aa5a8a52f90e1076bbad712d7). Both repos are GPL-3.0. This file records measurements and mechanics only. Reimplement from these numbers and copy no code.

## 1. Interaction sequence
1. **Drag start.** OT polls the global mouse at 30 Hz when idle and 60 Hz while the button is down. It reads the drag pasteboard to see if files are being dragged. If the pasteboard is empty, a Finder drag still counts after ≥24 px of movement and ≥0.3 s (Radial/DragMonitor.swift). OG uses low-level hooks and treats the drag as real once the cursor leaves the OS drag rectangle (Services/GlobalHookService.cs).
2. **Wheel appears.** It opens when the user taps a modifier mid-drag. Shift opens Convert. Option/Cmd opens Tools ("advanced"). Ctrl opens Actions. The wheel is centred on the cursor and clamped to the screen with a margin of radius+48 (Radial/RadialController.swift). OG uses the same keys: Shift = Convert, Ctrl = Tools, Alt = Actions. Pressing another modifier while the wheel is open switches mode in place. Esc cancels (Views/RadialWheelOverlay.xaml.cs). Tangerine's site says the same thing: tap Shift/Cmd/Ctrl, and the wheel stays open after the key is released.
3. **Hover.** The wheel hit-tests by angle and radius. OT accepts radii from inner up to outer+24. OG accepts inner−10 up to outer+30. Each new hover fires a haptic in OT and a "tick" sound in OG. The centre hub shows the hovered label. OG's hub also shows a one-line description.
4. **Drop.** Releasing the mouse on a segment runs it. Releasing outside the wheel, or ending the drag, dismisses it. OT waits 0.15 s before dismissing. A click/keyboard picker exists too: arrow keys step through segments, Enter applies, Esc cancels.
5. **Progress.** OT drops down a "notch pill" HUD (Core/JobRunner.swift). OG shows a bottom-right toast with a progress bar (Views/ToastNotificationWindow.xaml).
6. **Result.** The HUD/toast shows success with Open/Reveal buttons, then auto-hides. On failure it stays up.

## 2. Wheel geometry and motion
- **OT** (Radial/RadialView.swift): inner radius 64, outer radius 150, gap 4 px between wedges, wedge corner radius 14 (10 if more than 8 items). The host disc is 170 px.
  - N equal slices, with item 0 centred at 12 o'clock and the rest going clockwise. Labels sit at inner + 0.56·(outer−inner).
  - Open: window opacity 0→1 over 160 ms, plus scale 0.84→1 on spring(response 0.28, damping 0.78).
  - Hover: accent tint fill, scale 1.025, 4 px outward offset along the slice bisector, spring(0.26, 0.8).
  - Centre: a 34 px-tall capsule reading "CONVERT"/"TOOLS" or the hovered label.
- **OG** (Controls/RadialWheelCanvas.cs, Wheel/Renderers/GlassRenderer.cs): outer radius 188 in a 460 px canvas, inner = 0.404·outer (≈76). User scale ranges 0.4–1.4. The glass theme uses a 6 px gap and 12 px corners, and the hovered tile grows outward by 4 px.
  - Hover easing is exponential: `k = 1−e^(−dt/τ)` with τ = 110 ms/3 per tile.
  - Open style "pop", 260 ms total: wheel scale 0.86 + 0.14·outBack, opacity outCubic(2t).
  - Items are staggered clockwise: item i is delayed 0.4·i/(n−1) and animates over 0.6 of the duration, with scale 0.7→1 (outBack).
  - Mode switch replays the stagger at 0.8× duration and cross-fades the accent colour over 180 ms.
  - Each mode has its own accent: Convert #FF6B35, Tools #3B9EFF, Actions #A78BFA.
  - A key-cap hint bar ("Shift Convert · Ctrl Tools · Alt Actions · Esc Cancel") sits under the wheel.
- **Grouping.** There are three separate wheels (Convert / Tools / Actions), not grouped segments.
- **Options per file.** OT: `ConversionMatrix.targets(for:)`. For several files it shows only the targets every file supports (the intersection). OG: `FormatRegistry.GetWheelItems(path, mode)` per file category. It builds the wheel from the first file and applies the pick to every file it suits. The hub shows "+N more files".

## 3. Visual language
- **Glass.** OT uses macOS 26 `glassEffect(.regular)` inside a GlassEffectContainer. The fallback is `.ultraThinMaterial`, and selection is the accent at 80% opacity (UI/GlassSurface.swift). OG's glass is drawn by hand:
  - Vertical gradient from ring colour + 7% white at the top to ring colour − 12% at the bottom.
  - Two shadows: ambient (spread 34, y 10, 60% alpha) and key (spread 10, y 3).
  - A 1 px rim at 70% of the edge colour, and a radial-gradient hub with a 1 px edge.
- **Colours.** OT accent is #FF5C00 (UI/Theme.swift). OG palette (Core/Models/WheelTemplate.cs): ring #15171C at 96% alpha, hub #1B1D23, text #ECEDEF, muted #A1A6B0, faint #7A7F8A, edge white 19%, shadow black 44%.
- **Radii.** OT cards 12, empty-state panel 18, HUD expanded 24 / collapsed 9–10. OG cards 10, controls 6, key caps 3.5, hint bar 8. OG flyout shadow: blur 28, depth 8, opacity 0.45 (Themes/Theme.xaml).
- **Type.** OT: SF Rounded bold for segment labels, 11.5 pt with 0.6 letter-spacing (10 pt when dense), uppercase format names, icons 20/16 pt. OG: Segoe UI Variable with Fluent icons.
- **Sounds.** Only OG has sounds. They are synthesised sine "voices" (Services/SoundService.cs). In the glass pack:
  - tick: 3520 Hz, 30 ms
  - open: 1760 + 2637 Hz, about 150 ms
  - select: 2093 + 3136 Hz, 110 ms
  - The "click" pack's tick is 2400 Hz for 9 ms.

## 4. Feedback states
- **OT HUD** (Core/JobRunner.swift, UI/NotchCompanion.swift, UI/CompanionState.swift):
  - 360 px wide, height 48 + 56 px per row, capped at 3 rows.
  - Expands from the notch on spring(0.42, 0.88) and collapses with easeInOut over 0.24 s.
  - Each row shows a title, a percentage in monospace, a cancel button, and a thin accent progress bar. Finished rows show a green check or a red error icon.
  - A mascot moves through phases watching → received → processing → delivering → success / failed / cancelled. Captions include "Got it!", "Making it happen…" and "Stopped. Your original is safe."
  - Auto-hides after 2 s (pill style) or 8 s (card style). It never auto-hides on failure.
  - Jobs run one at a time (AsyncSemaphore limit 1).
- **OG toast:** 440×112, bottom-right with a 16 px inset, corner 10.
  - 34 px circular status badge, 3 px progress track with an indeterminate gradient sweep (1.4 s loop) until a percentage arrives.
  - Buttons: Open, Cancel, dismiss. Auto-closes after 6 s or 4.5 s depending on the outcome.
  - Concurrency: 2–3 video jobs at once, 2–4 other jobs (Core/Services/JobQueue.cs).
- **Output naming.**
  - OT: `name.ext`, then `name 2.ext` on a clash. Saved beside the original, in Downloads or on the Desktop. Optional reveal in Finder.
  - OG: `name.ext`, then `name_1.ext` (ConversionEngine.cs `GetUniquePath`).

## 5. Web translation
- **Trigger.** A page cannot see drags anywhere else on the OS; it only sees `dragenter` on its own window. Use this instead:
  - Listen for `dragenter`/`dragover` on `document` and show a full-page glass drop scrim.
  - Open the wheel at `clientX/Y` on the first `dragover` inside the page. Optionally require Shift (`e.shiftKey`) and switch mode with Alt/Ctrl from the same event.
  - File type: `e.dataTransfer.items[i].type` gives MIME types during the drag, but not file names (that's a browser security rule). Use the MIME type to fill the wheel early, then confirm with `files` on drop.
  - Mobile has no drag. Use file-picker → wheel at the tap point.
  - The same flow works for files picked with `<input type=file>` and files pasted from the clipboard.
- **Segments.** Draw an inline SVG of `<path>` annular wedges with rounded corners, computed in JS: two arcs plus corner arcs, using the corner-limit formula in RadialView. Each wedge is its own element so it can take `:hover` and `transform: translate()` along its bisector.
  - Hit-test drags yourself with `atan2`, because `dragover` doesn't give reliable per-element hover.
  - A conic-gradient can only fake the wedges: it can't round the corners or move tiles individually.
- **Glass.**
  - `backdrop-filter: blur(24px) saturate(180%)` on the wheel container, clipped with `clip-path: url(#wheel)`, or render each wedge as an SVG mask over a blurred layer.
  - Fill: `rgba(255,255,255,.12)` dark / `.55` light, 1 px inset highlight, plus the two-layer box-shadow above.
  - Fallback for browsers without backdrop-filter: an opaque #15171C surface.
- **Motion.**
  - Open: Web Animations API, scale .84→1 and opacity, with `linear()` easing sampled from a spring (damping .78, about 280 ms).
  - Per-item stagger: `delay = 0.4·i/(n−1)·260ms`.
  - Hover: CSS transition `transform 180ms cubic-bezier(.34,1.56,.64,1)`.
  - Honour `prefers-reduced-motion` with fades only.
- **Sound.** Short WebAudio oscillator + gain envelopes with the frequencies above. Off by default, since browsers require a user gesture before audio plays.
- **Haptics.** `navigator.vibrate(5)` on Android only.
- **Notch.** Doesn't exist on the web. Use a top-centre "dynamic island" pill: fixed position, a 360 px expanded card with radius 24, morphed with a WAAPI spring.
- **Results.** Output is a Blob download named `name.ext`. Batch results go out as a zip or as one download per file. There is no "beside the original": the File System Access API's `showDirectoryPicker` works in Chromium only.

## 6. Conversion matrices
- **Image.**
  - OT: jpg/png/webp/heic/tiff/svg/avif/bmp → jpg, png, webp, heic, tiff, avif, bmp, pdf. jpg/png also → docx (Formats/ConversionMatrix.swift).
  - OG adds ico and gif input and outputs png/webp/jpg/avif/bmp/pdf/ico/tiff (Core/Services/FormatRegistry.cs).
- **Video.**
  - OT: mp4/mov/mkv/webm/avi/wmv ↔ each other, plus gif and mp3. gif → video formats.
  - OG also accepts flv/m4v/ts and also outputs wav.
- **Audio.** mp3/m4a/wav/flac/ogg/opus/aiff/wma ↔ each other (OG has aac in place of m4a/aiff).
- **PDF.**
  - OT: → docx, jpg, png, txt.
  - OG: → docx, png, jpg, webp, tiff (every page), txt (with OCR).
  - Tangerine (from its site): → docx, pages, pptx, xlsx, jpg, png, epub, txt, md.
- **Documents.**
  - OT: txt → pdf/jpg/png/srt/vtt.
  - OG: docx/doc/odt/rtf ↔ pdf/docx/odt/doc/rtf/txt/html. md → html/pdf/png/docx/odt/rtf/txt. html → pdf/png/jpg plus the doc formats. txt → pdf/docx/odt/rtf.
- **Spreadsheets (OG).** xlsx/xls/ods/csv → xlsx, ods, csv, xls, pdf.
- **Slides (OG).** pptx/ppt/odp/ppsx → pdf, pptx, odp, ppt, ppsx, png, jpg, txt.
- **Subtitles.** srt ↔ vtt, and both → txt.
- **Archives.**
  - OT: disabled (returns an empty target list).
  - OG: extract, or repack to zip/tar/gz. Any file → zip, base64, hex dump.
- **Tools.**
  - OT has 25 tools (Tools/ToolID.swift), including compress, metadata, image edit/crop/redact/resize/rotate/background, PDF create/merge/organize/split, collage, and video trim/crop/speed/join/frames/split/redact.
  - OG tools include OCR, PDF protect/unlock/rotate/strip metadata, video mute/720p/snapshot, and audio normalize/mono.
- **Actions.**
  - OT: reveal, copy files, copy paths, duplicate, SHA-256.
  - OG adds terminal, wallpaper and unblock.
