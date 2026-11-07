import { UnusableAudio } from "./agent/errors";

// WhatsApp-supported inbound audio types (Cloud API media docs). OGG must be Opus.
const ALLOWED = new Set(["audio/ogg", "audio/opus", "audio/mpeg", "audio/amr", "audio/mp4", "audio/aac"]);
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
export const MAX_AUDIO_MS = 60_000;

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
    if (durationMs !== null && durationMs > MAX_AUDIO_MS) throw new UnusableAudio("too_long");
  }
  return { mime, durationMs };
}
