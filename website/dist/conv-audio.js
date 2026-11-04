// Audio conversion with Mediabunny. Decoding and Opus/AAC encoding use the
// browser's own WebCodecs; MP3, FLAC and AAC encoders load only when the
// browser lacks its own.
// Video files are read only for their sound: nothing here encodes video.
import * as libs from './libs.js';

export const AUDIO_IN = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'weba', 'mp4', 'mov', 'mkv', 'webm'];
export const AUDIO_OUT = ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a'];
export const VIDEO_IN = ['mp4', 'mov', 'mkv', 'webm'];
export const MAX_AUDIO = 1_000_000_000;
const CODEC = { mp3: 'mp3', wav: 'pcm-s16', flac: 'flac', ogg: 'opus', opus: 'opus', m4a: 'aac' };
export const QUALITY = { low: 96_000, medium: 160_000, high: 256_000 };

function outputFormat(mb, to) {
  if (to === 'mp3') return new mb.Mp3OutputFormat();
  if (to === 'wav') return new mb.WavOutputFormat();
  if (to === 'flac') return new mb.FlacOutputFormat();
  if (to === 'ogg' || to === 'opus') return new mb.OggOutputFormat();
  if (to === 'm4a') return new mb.Mp4OutputFormat();
  throw new Error('Can’t write ' + to + ' audio.');
}

// options: { quality: 'low'|'medium'|'high', keepTags: true }
export async function convertAudio(file, to, { quality = 'high', keepTags = true, onProgress } = {}) {
  if (file.size > MAX_AUDIO) throw new Error('Audio files up to 1 GB only.');
  if (!globalThis.AudioDecoder) throw new Error('This browser can’t convert audio. Try a current Chrome, Edge, Firefox or Safari.');
  const mb = await libs.media();
  const codec = CODEC[to];
  if (['mp3', 'flac', 'aac'].includes(codec)) await libs.mediaEncoder(codec);
  else if (codec !== 'pcm-s16' && !(await mb.canEncodeAudio(codec))) throw new Error('This browser can’t encode ' + to.toUpperCase() + '.');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    let audioTrack;
    try { audioTrack = await input.getPrimaryAudioTrack(); }
    catch { throw new Error('Whitewash couldn’t read this file. It may be damaged, or use a format the browser can’t decode.'); }
    if (!audioTrack) throw new Error('There’s no sound in this file.');
    if (!(await audioTrack.canDecode())) throw new Error('This browser can’t decode the ' + (audioTrack.codec || 'audio') + ' sound in this file.');
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: outputFormat(mb, to), target });
    const lossy = !['pcm-s16', 'flac'].includes(codec);
    const conversion = await mb.Conversion.init({
      input, output,
      video: { discard: true },
      audio: { codec, ...(lossy ? { bitrate: QUALITY[quality] || QUALITY.high } : {}), ...(codec === 'opus' ? { sampleRate: 48000 } : {}) },
      // MP4/M4A only stores a front cover, so a picture tagged "other" (what
      // ffmpeg writes by default) would be dropped. Treat the first one as the cover.
      tags: !keepTags ? {} : to === 'm4a' ? (tags) => ({ ...tags, images: tags.images?.length && !tags.images.some((i) => i.kind === 'coverFront') ? [{ ...tags.images[0], kind: 'coverFront' }, ...tags.images.slice(1)] : tags.images }) : undefined,
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((t) => t.track.type === 'audio')?.reason;
      throw new Error(reason === 'no_encodable_target_codec' || reason === 'undecodable_source_codec' ? 'This browser can’t convert this sound to ' + to.toUpperCase() + '.' : 'Whitewash couldn’t convert this file.');
    }
    conversion.onProgress = (p) => onProgress?.(p);
    await conversion.execute();
    return new Blob([target.buffer], { type: output.format.mimeType });
  } finally { input.dispose?.(); }
}

// Duration, codec, channels and sample rate, for the file list.
export async function probeAudio(file) {
  const mb = await libs.media();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    return { duration: await input.computeDuration(), codec: track.codec, channels: track.numberOfChannels, sampleRate: track.sampleRate, video: !!(await input.getPrimaryVideoTrack()) };
  } catch { return null; } finally { input.dispose?.(); }
}
