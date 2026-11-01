# Audio, archives and SynthID

1 November 2026. Asked by mykee: add audio conversion, add archive conversion and compression, drop video, and find repos that remove SynthID.

## Audio: what can run in a browser

| Option | Licence | Size | Verdict |
|---|---|---|---|
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | ~11 MB unpacked, tree-shaken much smaller | **Use.** Pure TypeScript. Reads and writes MP3, WAV, FLAC, OGG, M4A/MP4, WebM, AAC, MKV. Uses the browser's own WebCodecs for decoding and Opus/AAC/Vorbis encoding. No special server headers needed. |
| `@mediabunny/mp3-encoder` | MPL-2.0 (wraps LAME, LGPL) | ~2.3 MB | **Use.** WebCodecs can't encode MP3. |
| `@mediabunny/flac-encoder` | MPL-2.0 | ~1.6 MB | **Use.** WebCodecs can't encode FLAC. |
| `@mediabunny/aac-encoder` | MPL-2.0 (wraps FFmpeg's AAC encoder, LGPL) | ~1.1 MB | **Use**, loaded only when the browser has no AAC encoder (Linux Chrome and Firefox). |
| [ffmpeg.audio.wasm](https://github.com/jorensix/ffmpeg.audio.wasm) | LGPL with GPL parts, Rubber Band needs a commercial licence | ~5 MB | No. Needs `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers, which GitHub Pages can't send. |
| ffmpeg.wasm (full) | GPL-2.0+ core build | ~30 MB | No. Same header problem, crashes on phones, and it's mostly video. |
| lamejs | LGPL-3.0 | small | Not needed once the Mediabunny MP3 encoder is in. |

Plan: audio in = MP3, WAV, FLAC, OGG, Opus, M4A, AAC, WebM audio, plus the audio track of MP4/MOV/MKV/WebM videos. Audio out = MP3, WAV, FLAC, OGG (Opus), M4A (AAC where the browser can), Opus. No video output.

## Archives

| Option | Licence | Verdict |
|---|---|---|
| [fflate](https://github.com/101arrowz/fflate) | MIT, ~30 KB used | **Use** for ZIP and GZIP, both ways. |
| [libarchive.js](https://github.com/nika-begiashvili/libarchivejs) | MIT wrapper, libarchive is BSD | **Use** to open 7z, RAR, TAR.XZ, TAR.BZ2 and others. Read-only for RAR. WASM in a worker. |
| TAR | ours | Simple format, written by hand. |

Shipped: open ZIP, 7Z, RAR, TAR, TAR.GZ/TGZ, TAR.BZ2, TAR.XZ, GZ, BZ2, XZ. Write ZIP, TAR, TAR.GZ. libarchive.js can write 7Z and TAR.XZ too, but its writer allocates the output buffer as the sum of file sizes plus 128 bytes each, so small files fail with "written bytes don't match file size". Writing uses fflate and our own TAR writer instead. RAR can't be written: the format is proprietary.

Tested with real ZIP and TAR.GZ files (Python-made) and a TAR with long and non-ASCII names. 7Z and RAR opening is untested here: there was no tool in the container to make sample files.

## Video

Removed from scope. Nothing in the site encodes video, and the plan's "Not building" list says so. Pulling the audio out of a video file stays, because it only reads the video.

## SynthID

Repos that claim to remove it:

- [aloshdenny/reverse-SynthID](https://github.com/aloshdenny/reverse-SynthID). Python. Spectral analysis of Gemini images, then subtraction of the carrier frequencies (V3) or a 7-stage pipeline with a Stable Diffusion VAE round trip, warping, resampling and JPEG (V4). "Research" licence. Self-reported results on 20 to 88 images. Not verified by Google. V4 drops pixel accuracy to 18–24 dB PSNR.
- 00quebec/Synthid-Bypass ([summary](https://www.sourcepulse.org/projects/23071281)). ComfyUI workflow that re-renders the image through a diffusion model with ControlNets. Needs a GPU with more than 16 GB of VRAM. No open-source licence.

**Decision: not building this into Whitewash.**

- **What it's for.** SynthID carries no personal data. Its only job is to say "an AI made this". Stripping it is not a privacy feature like the metadata wiper; its only use is making AI images pass as real.
- **Legal exposure.** The EU AI Act's transparency rules (Article 50, applying from August 2026) require AI-generated media to carry machine-readable marking. A public tool built to strip that marking is a liability for the site.
- **It can't run in a browser anyway.** Both approaches need a diffusion model or a VAE (gigabytes, a GPU), and neither has a licence that lets us ship it.
- **It doesn't work cleanly.** The claims are self-reported, the images get visibly worse, and Google can retrain the detector.

The site stays honest about this: the wiper's Help text already says pixel watermarks like SynthID can't be removed by wiping.
