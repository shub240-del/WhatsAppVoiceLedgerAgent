import { test } from "node:test";
import assert from "node:assert/strict";
import { gnaniEnvironmentStatus, gnaniSttConfig } from "../../server/gnani-config";
import { GnaniAccountError, GnaniSpeechToText, silentWav, verifyGnaniKey } from "../../server/gnani-stt";
import { ProviderUnavailable, UnusableAudio } from "../../server/agent/errors";

const KEY = "local-gnani-test-key";
const config = gnaniSttConfig({ GNANI_API_KEY: KEY }).config!;

function fakeFetch(status: number, body: unknown, seen: { url?: string; headers?: Headers; form?: FormData } = {}) {
  return (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.headers = new Headers(init.headers);
    seen.form = init.body as FormData;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

test("defaults follow Gnani docs: prisma-v3.0, Hindi + English code-switching, official base URL", () => {
  assert.deepEqual(
    { model: config.model, languages: config.languages, format: config.format, baseUrl: config.baseUrl },
    { model: "prisma-v3.0", languages: ["hi-IN", "en-IN"], format: "verbatim", baseUrl: "https://api.vachana.ai" },
  );
  const status = gnaniEnvironmentStatus({ GNANI_API_KEY: KEY });
  assert.equal(status.state, "configured");
  assert.ok(!JSON.stringify(status).includes(KEY));
});

test("invalid settings are reported without echoing the key", () => {
  for (const [env, problem] of [
    [{}, /GNANI_API_KEY is not set/],
    [{ GNANI_API_KEY: "two words" }, /spaces or line breaks/],
    [{ GNANI_API_KEY: KEY, GNANI_STT_LANGUAGES: "xx-IN" }, /Unknown language/],
    [{ GNANI_API_KEY: KEY, GNANI_STT_MODEL: "prisma-v2.5", GNANI_STT_LANGUAGES: "hi-IN,en-IN" }, /1–1 language/],
    [{ GNANI_API_KEY: KEY, GNANI_BASE_URL: "http://api.vachana.ai" }, /https/],
  ] as const) {
    const r = gnaniSttConfig(env);
    assert.equal(r.config, null);
    assert.match(r.problems.join(" "), problem);
    assert.ok(!r.problems.join(" ").includes(KEY));
  }
});

test("transcribe sends the documented multipart request and maps the response", async () => {
  const seen: { url?: string; headers?: Headers; form?: FormData } = {};
  const stt = new GnaniSpeechToText(config, fakeFetch(200, { success: true, transcript: " रमेश को 340 का उधार ", detected_language_code: "hi-IN" }, seen));
  const out = await stt.transcribe(new Uint8Array([1, 2, 3]), ["hi-IN"], "audio/ogg; codecs=opus");
  assert.deepEqual(out, { text: "रमेश को 340 का उधार", language: "hi-IN", confidence: null, durationMs: null });
  assert.equal(seen.url, "https://api.vachana.ai/stt/v3");
  assert.equal(seen.headers?.get("X-API-Key-ID"), KEY);
  assert.ok(seen.headers?.get("X-API-Request-ID"));
  assert.equal(seen.form?.get("language_code"), "hi-IN,en-IN");
  assert.equal(seen.form?.get("model"), "prisma-v3.0");
  assert.equal((seen.form?.get("audio_file") as File).name, "voice.ogg");
});

test("Gnani errors map to retry, unusable-audio or account problems", async () => {
  const run = (status: number, body: unknown) => new GnaniSpeechToText(config, fakeFetch(status, body)).transcribe(new Uint8Array([1]), [], "audio/ogg");
  await assert.rejects(run(400, { success: false, error: { type: "MAX_AUDIO_DURATION_EXCEEDED" } }), (e: unknown) => e instanceof UnusableAudio && e.reason === "too_long");
  await assert.rejects(run(401, { detail: { error_code: "INVALID_API_KEY" } }), (e: unknown) => e instanceof GnaniAccountError && e.code === "invalid_key");
  await assert.rejects(run(402, { detail: {} }), (e: unknown) => e instanceof GnaniAccountError && e.code === "insufficient_credit");
  await assert.rejects(run(403, { detail: { error_code: "SCOPE_NOT_ALLOWED" } }), (e: unknown) => e instanceof GnaniAccountError && e.code === "scope_not_allowed");
  await assert.rejects(run(429, { detail: { error_code: "RATE_LIMITED" } }), ProviderUnavailable);
  await assert.rejects(run(504, {}), ProviderUnavailable);
  await assert.rejects(new GnaniSpeechToText(config).transcribe(new Uint8Array([1]), [], "video/mp4"), UnusableAudio);
});

test("live key check: silence accepted means the key works; 401 means it does not", async () => {
  assert.equal((await verifyGnaniKey(config, fakeFetch(200, { success: true, transcript: "" }))).ok, true);
  assert.equal((await verifyGnaniKey(config, fakeFetch(400, { success: false, error: { type: "NO_SPEECH" } }))).ok, true);
  assert.deepEqual(await verifyGnaniKey(config, fakeFetch(401, { detail: { error_code: "INVALID_API_KEY" } })), {
    ok: false, reason: "invalid_key", detail: "Gnani rejected the API key (check GNANI_API_KEY).",
  });
  const wav = silentWav();
  assert.equal(Buffer.from(wav.slice(0, 4)).toString(), "RIFF");
  assert.equal(wav.byteLength, 44 + 16_000 * 2);
});
