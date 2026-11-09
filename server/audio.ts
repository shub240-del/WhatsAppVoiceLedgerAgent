import { UnusableAudio } from "./agent/errors.js";

// WhatsApp inbound audio types (OGG must be Opus) plus WAV from the website recorder.
const ALLOWED = new Set(["audio/ogg", "audio/opus", "audio/mpeg", "audio/amr", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav"]);
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
// Gnani STT REST accepts at most 30 s per request (docs.gnani.ai/api/STT/speech-to-text).
export const MAX_AUDIO_MS = 30_000;

/** Duration of a PCM WAV from its header (byte rate) and data chunk size. */
export function wavDurationMs(bytes: Uint8Array): number | null {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.length < 44 || view.toString("latin1", 0, 4) !== "RIFF" || view.toString("latin1", 8, 12) !== "WAVE") return null;
  let offset = 12, byteRate = 0;
  while (offset + 8 <= view.length) {
    const id = view.toString("latin1", offset, offset + 4), size = view.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 16 <= view.length) byteRate = view.readUInt32LE(offset + 16);
    if (id === "data") return byteRate ? Math.round((Math.min(size, view.length - offset - 8) * 1000) / byteRate) : null;
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Reads the final OGG page granule position (48 kHz for Opus) to get duration without decoding. */
export function oggOpusDurationMs(bytes: Uint8Array): number | null {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const last = view.lastIndexOf("OggS");
  if (last < 0 || last + 14 > view.length) return null;
  const granule = view.readBigUInt64LE(last + 6);
  if (granule === 0xffffffffffffffffn) return null;
  return Number((granule * 1000n) / 48_000n);
}

export function validateAudio(bytes: Uint8Array, mimeType: string) {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED.has(mime)) throw new UnusableAudio("unsupported_format");
  if (bytes.byteLength < 64) throw new UnusableAudio("empty");
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new UnusableAudio("too_large");
  let durationMs: number | null = null;
  if (mime === "audio/ogg" || mime === "audio/opus") {
    if (Buffer.from(bytes.subarray(0, 4)).toString("latin1") !== "OggS") throw new UnusableAudio("corrupt");
    if (!Buffer.from(bytes).includes("OpusHead")) throw new UnusableAudio("unsupported_codec");
    durationMs = oggOpusDurationMs(bytes);
  } else if (mime === "audio/wav" || mime === "audio/x-wav") {
    durationMs = wavDurationMs(bytes);
    if (durationMs === null) throw new UnusableAudio("corrupt");
  }
  if (durationMs !== null && durationMs > MAX_AUDIO_MS) throw new UnusableAudio("too_long");
  return { mime, durationMs };
}
