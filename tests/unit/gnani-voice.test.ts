import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneVoice, GnaniVoiceError, speakInVoice } from "../../server/gnani-voice";
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

test("Gnani's exact refusal reaches the owner: status, error code and message; never the key; no fallback voice", async () => {
  const cases: [number, unknown, RegExp][] = [
    [403, { detail: { error_code: "SCOPE_NOT_ALLOWED", message: "Voice cloning is not enabled for this key" } }, /HTTP 403 \(SCOPE_NOT_ALLOWED: Voice cloning is not enabled for this key\): this Gnani key isn't allowed to use voice cloning/],
    [402, { detail: { error_code: "INSUFFICIENT_CREDIT", message: "Top up" } }, /HTTP 402 .*no credit left/],
    [401, { detail: { error_code: "INVALID_API_KEY", message: "bad key" } }, /HTTP 401 .*rejected the API key/],
    [400, { success: false, message: "Unknown model vachana-vc-v1", status_code: 400 }, /HTTP 400 \(Unknown model vachana-vc-v1\)/],
    [429, { detail: { error_code: "RATE_LIMITED", message: "slow down" } }, /HTTP 429 .*rate-limiting/],
    [500, { success: false, message: "boom" }, /HTTP 500 \(boom\): Gnani had an internal error/],
  ];
  for (const [status, body, expected] of cases) {
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await assert.rejects(speakInVoice(config, "namaste", voice, fetchImpl), (e: Error) => {
      assert.ok(e instanceof GnaniVoiceError, `status ${status}: ${e.name}`);
      assert.match(e.message, expected);
      assert.match(e.message, /no other voice was used/);
      assert.ok(!e.message.includes("test-key"));
      return true;
    });
  }
  const clone403 = (async () => new Response(JSON.stringify({ detail: { error_code: "SCOPE_NOT_ALLOWED", message: "x" } }), { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(cloneVoice(config, new Uint8Array(2000), "audio/wav", clone403), /Gnani voice cloning failed — HTTP 403/);
  const odd = (async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(cloneVoice(config, new Uint8Array(2000), "audio/mpeg", odd), ProviderUnavailable);
});
