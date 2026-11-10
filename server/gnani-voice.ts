import { z } from "zod";
import { ProviderUnavailable } from "./agent/errors.js";
import type { GnaniSttConfig } from "./gnani-config.js";

type Fetch = typeof fetch;

/**
 * Gnani voice cloning (Vachana VC), used only by the owner's Voice studio to narrate the demo video.
 * 1) POST /api/v1/tts/voice-clone/embeddings (multipart audio_file) -> speaker embedding
 * 2) POST /api/v1/tts/inference with speaker_embedding -> audio in that voice
 * https://docs.gnani.ai/api/VC/voice-clone-embeddings, https://docs.gnani.ai/api/VC/vc-inference
 */
export const speakerEmbedding = z
  .object({
    embedding: z.string().min(16).max(20_000),
    shape: z.array(z.number().int().positive()).min(1).max(4),
    dtype: z.string().min(3).max(40),
  })
  .strict();
export type SpeakerEmbedding = z.infer<typeof speakerEmbedding>;

export const VOICE_SAMPLE_RATE = 24_000;

/**
 * Gnani refused or failed a voice request. Carries Gnani's own status, error code and message so the
 * owner sees the exact limitation (never the key). There is no fallback to a generic voice.
 */
export class GnaniVoiceError extends Error {
  constructor(public step: "clone" | "speak", public status: number, public gnaniCode: string | null, public gnaniMessage: string | null) {
    super(GnaniVoiceError.explain(step, status, gnaniCode, gnaniMessage));
    this.name = "GnaniVoiceError";
  }
  static explain(step: string, status: number, code: string | null, message: string | null) {
    const what = step === "clone" ? "voice cloning" : "speaking in the cloned voice";
    const meaning: Record<number, string> = {
      400: "Gnani rejected the request (for example, voice cloning or the vachana-vc-v1 model isn't enabled for this key, or the audio isn't usable)",
      401: "Gnani rejected the API key",
      402: "the Gnani account has no credit left",
      403: "this Gnani key isn't allowed to use voice cloning",
      404: "this Gnani account doesn't have the voice-cloning endpoint",
      413: "the voice sample is too large for Gnani",
      422: "Gnani couldn't use the voice sample",
      429: "Gnani is rate-limiting; wait a minute and try again",
    };
    const reason = meaning[status] ?? (status >= 500 ? "Gnani had an internal error" : "Gnani returned an unexpected error");
    const detail = [code, message].filter(Boolean).join(": ");
    return `Gnani ${what} failed — HTTP ${status}${detail ? ` (${detail})` : ""}: ${reason}. Nothing was generated; no other voice was used.`;
  }
}

async function fail(response: Response, step: "clone" | "speak"): Promise<never> {
  // Gnani errors come as {"success":false,"message":...} or {"detail":{"error_code":...,"message":...}}.
  const body = (await response.json().catch(() => null)) as { message?: unknown; detail?: { error_code?: unknown; message?: unknown } | string } | null;
  const detail = body && typeof body.detail === "object" ? body.detail : null;
  const code = typeof detail?.error_code === "string" ? detail.error_code.slice(0, 60) : null;
  const raw = detail?.message ?? body?.message ?? (typeof body?.detail === "string" ? body.detail : null);
  const message = typeof raw === "string" ? raw.replace(/\s+/g, " ").slice(0, 240) : null;
  throw new GnaniVoiceError(step, response.status, code, message);
}

export async function cloneVoice(config: GnaniSttConfig, audio: Uint8Array, mimeType: string, fetchImpl: Fetch = fetch): Promise<SpeakerEmbedding> {
  const form = new FormData();
  const ext = mimeType.includes("wav") ? "wav" : "mp3";
  form.append("audio_file", new Blob([audio], { type: mimeType }), `voice-sample.${ext}`);
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/api/v1/tts/voice-clone/embeddings`, {
      method: "POST",
      headers: { "X-API-Key-ID": config.apiKey },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new ProviderUnavailable("gnani", "Could not reach Gnani voice cloning.");
  }
  if (!response.ok) await fail(response, "clone");
  const json = (await response.json().catch(() => null)) as { data?: { voice_clone_embedding?: unknown } } | null;
  const parsed = speakerEmbedding.safeParse(json?.data?.voice_clone_embedding);
  if (!parsed.success) throw new ProviderUnavailable("gnani", "Gnani voice cloning returned an unexpected response.");
  return parsed.data;
}

export async function speakInVoice(config: GnaniSttConfig, text: string, voice: SpeakerEmbedding, fetchImpl: Fetch = fetch): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/api/v1/tts/inference`, {
      method: "POST",
      headers: { "X-API-Key-ID": config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model: "vachana-vc-v1",
        speaker_embedding: voice,
        audio_config: { sample_rate: VOICE_SAMPLE_RATE, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
      }),
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new ProviderUnavailable("gnani", "Could not reach Gnani text-to-speech.");
  }
  if (!response.ok) await fail(response, "speak");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100) throw new ProviderUnavailable("gnani", "Gnani returned empty audio.");
  return bytes;
}
