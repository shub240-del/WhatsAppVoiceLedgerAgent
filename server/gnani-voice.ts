import { z } from "zod";
import { ProviderUnavailable, UnusableAudio } from "./agent/errors.js";
import type { GnaniSttConfig } from "./gnani-config.js";
import { GnaniAccountError } from "./gnani-stt.js";

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

function fail(status: number, what: string): never {
  switch (status) {
    case 401:
      throw new GnaniAccountError("invalid_key", "Gnani rejected the API key (check GNANI_API_KEY).");
    case 402:
      throw new GnaniAccountError("insufficient_credit", "Gnani account has insufficient credit.");
    case 403:
      throw new GnaniAccountError("scope_not_allowed", "This Gnani key is not allowed to use voice cloning.");
    case 400:
    case 413:
    case 422:
      throw new UnusableAudio("unusable");
    default:
      throw new ProviderUnavailable("gnani", `Gnani ${what} returned ${status}.`);
  }
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
  if (!response.ok) fail(response.status, "voice cloning");
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
  if (!response.ok) fail(response.status, "text-to-speech");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100) throw new ProviderUnavailable("gnani", "Gnani returned empty audio.");
  return bytes;
}
