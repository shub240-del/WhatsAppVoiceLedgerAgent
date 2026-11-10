import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneVoice, speakInVoice } from "../../server/gnani-voice";
import { GnaniAccountError } from "../../server/gnani-stt";
import { ProviderUnavailable } from "../../server/agent/errors";
import type { GnaniSttConfig } from "../../server/gnani-config";

const config: GnaniSttConfig = { apiKey: "test-key", baseUrl: "https://api.vachana.ai", model: "prisma-v3.0", languages: ["hi-IN"], format: "verbatim", timeoutMs: 1000 };
const voice = { embedding: "QUJDREVGR0hJSktMTU5PUA==", shape: [1, 768], dtype: "torch.bfloat16" };

test("cloning uploads the sample to Gnani's embeddings endpoint and returns the speaker embedding", async () => {
  let seen: { url: string; headers: Headers; body: FormData } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen = { url, headers: new Headers(init.headers), body: init.body as FormData };
    return new Response(JSON.stringify({ success: true, data: { voice_clone_embedding: voice } }), { status: 200 });
  }) as typeof fetch;
  const out = await cloneVoice(config, new Uint8Array(2000), "audio/wav", fetchImpl);
  assert.deepEqual(out, voice);
  assert.equal(seen!.url, "https://api.vachana.ai/api/v1/tts/voice-clone/embeddings");
  assert.equal(seen!.headers.get("X-API-Key-ID"), "test-key");
  assert.ok(seen!.body.get("audio_file") instanceof Blob);
});

test("speaking sends the text with the cloned voice and asks for 24 kHz mono WAV", async () => {
  let body: Record<string, any> = {};
  const fetchImpl = (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.vachana.ai/api/v1/tts/inference");
    body = JSON.parse(String(init.body));
    return new Response(new Uint8Array(4000), { status: 200, headers: { "Content-Type": "audio/wav" } });
  }) as typeof fetch;
  const audio = await speakInVoice(config, "उधार। बोलो — और हिसाब हो गया।", voice, fetchImpl);
  assert.equal(audio.length, 4000);
  assert.equal(body.model, "vachana-vc-v1");
  assert.deepEqual(body.speaker_embedding, voice);
  assert.equal(body.audio_config.sample_rate, 24000);
  assert.equal(body.audio_config.container, "wav");
});

test("account problems and outages map to clear errors; the key never appears in them", async () => {
  for (const [status, Expected] of [[401, GnaniAccountError], [402, GnaniAccountError], [403, GnaniAccountError], [500, ProviderUnavailable], [429, ProviderUnavailable]] as const) {
    const fetchImpl = (async () => new Response("{}", { status })) as unknown as typeof fetch;
    await assert.rejects(speakInVoice(config, "namaste", voice, fetchImpl), (e: Error) => e instanceof Expected && !e.message.includes("test-key"));
  }
  const odd = (async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(cloneVoice(config, new Uint8Array(2000), "audio/mpeg", odd), ProviderUnavailable);
});
