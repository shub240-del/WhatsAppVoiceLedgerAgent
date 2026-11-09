import { randomUUID } from "node:crypto";
import type { SpeechToText, Transcript } from "./adapters.js";
import { ProviderUnavailable, UnusableAudio } from "./agent/errors.js";
import type { GnaniSttConfig } from "./gnani-config.js";

type Fetch = typeof fetch;

/** Account-level problem (bad key, no credit, missing scope). Retrying will not help. */
export class GnaniAccountError extends Error {
  constructor(public code: "invalid_key" | "insufficient_credit" | "scope_not_allowed", message: string) {
    super(message);
    this.name = "GnaniAccountError";
  }
}

const EXT: Record<string, string> = {
  "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
  "audio/x-wav": "wav", "audio/flac": "flac", "audio/aac": "aac", "audio/mp4": "m4a", "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
};

/**
 * Gnani Prisma speech-to-text over REST (POST {base}/stt/v3, multipart, X-API-Key-ID).
 * https://docs.gnani.ai/api/STT/speech-to-text
 */
export class GnaniSpeechToText implements SpeechToText {
  constructor(private config: GnaniSttConfig, private fetchImpl: Fetch = fetch) {}

  async transcribe(audio: Uint8Array, _languageHints: string[], mimeType: string): Promise<Transcript> {
    const mime = mimeType.split(";")[0].trim().toLowerCase();
    const ext = EXT[mime];
    if (!ext) throw new UnusableAudio("unsupported_type");
    const form = new FormData();
    form.append("audio_file", new Blob([audio], { type: mime }), `voice.${ext}`);
    form.append("language_code", this.config.languages.join(","));
    if (this.config.model !== "prisma-v2.5") form.append("model", this.config.model);
    form.append("format", this.config.format);

    const body = await this.post(form);
    const text = typeof body.transcript === "string" ? body.transcript.trim() : "";
    return {
      text,
      language: typeof body.detected_language_code === "string" ? body.detected_language_code : null,
      confidence: null, // Gnani STT REST does not return a confidence score.
      durationMs: null,
    };
  }

  private async post(form: FormData): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/stt/v3`, {
        method: "POST",
        headers: { "X-API-Key-ID": this.config.apiKey, "X-API-Request-ID": randomUUID() },
        body: form,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch {
      throw new ProviderUnavailable("gnani", "Could not reach Gnani speech-to-text.");
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (response.ok && body.success !== false) return body;
    const code = String(body?.detail?.error_code ?? body?.error?.type ?? "");
    switch (response.status) {
      case 400:
        throw new UnusableAudio(code === "MAX_AUDIO_DURATION_EXCEEDED" ? "too_long" : "unusable");
      case 401:
        throw new GnaniAccountError("invalid_key", "Gnani rejected the API key (check GNANI_API_KEY).");
      case 402:
        throw new GnaniAccountError("insufficient_credit", "Gnani account has insufficient credit.");
      case 403:
        throw new GnaniAccountError("scope_not_allowed", "This Gnani key is not allowed to use speech-to-text.");
      case 422:
        throw new UnusableAudio("unusable");
      default:
        // 429 rate limit, 5xx, 504 upstream timeout: transient, safe to retry the job.
        throw new ProviderUnavailable("gnani", `Gnani speech-to-text returned ${response.status}.`);
    }
  }
}

/** 1 second of 16 kHz mono silence as WAV: lets us check the key without sending real audio. */
export function silentWav(ms = 1000, rate = 16_000) {
  const samples = Math.round((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples * 2, 40);
  return new Uint8Array(buf);
}

export type GnaniCheck =
  | { ok: true; detail: string }
  | { ok: false; reason: "invalid_key" | "insufficient_credit" | "scope_not_allowed" | "unreachable"; detail: string };

/** Live check: sends 1 s of silence. Any answer other than an account error proves the key works. */
export async function verifyGnaniKey(config: GnaniSttConfig, fetchImpl: Fetch = fetch): Promise<GnaniCheck> {
  try {
    await new GnaniSpeechToText(config, fetchImpl).transcribe(silentWav(), [], "audio/wav");
    return { ok: true, detail: "Gnani accepted the key and transcribed a test clip." };
  } catch (error) {
    if (error instanceof GnaniAccountError) return { ok: false, reason: error.code, detail: error.message };
    if (error instanceof UnusableAudio) return { ok: true, detail: "Gnani accepted the key (the silent test clip had no speech, as expected)." };
    if (error instanceof ProviderUnavailable && / 429\./.test(error.message))
      return { ok: true, detail: "Gnani accepted the key but is rate-limiting; try again shortly." };
    return { ok: false, reason: "unreachable", detail: error instanceof Error ? error.message : "Gnani check failed." };
  }
}
