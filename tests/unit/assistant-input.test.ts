import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantInput } from "../../server/assistant";
import { validateAudio, wavDurationMs } from "../../server/audio";
import { silentWav } from "../../server/gnani-stt";

const turnId = "0f4c7a8e-1b2c-4d5e-8f90-123456789abc";

test("assistant accepts exactly one of text or audio, with a valid turn id", () => {
  assert.ok(assistantInput.safeParse({ turnId, text: "Ramesh ka kitna baaki hai?" }).success);
  assert.ok(assistantInput.safeParse({ turnId, audioBase64: "UklGRg==", mimeType: "audio/wav" }).success);
  assert.ok(assistantInput.safeParse({ turnId, text: "galat", replyTo: `web.r.${turnId}` }).success);
  for (const bad of [
    { turnId, text: "a", audioBase64: "UklGRg==", mimeType: "audio/wav" },
    { turnId },
    { turnId, audioBase64: "UklGRg==" },
    { turnId, audioBase64: "x", mimeType: "audio/webm" },
    { turnId: "bad id!", text: "hi" },
    { turnId, text: "hi", replyTo: "wamid.123" },
    { turnId, text: "hi", shopId: "someone-else" },
  ]) assert.equal(assistantInput.safeParse(bad).success, false, JSON.stringify(bad));
});

test("website WAV clips are measured from the header and capped at 30 s", () => {
  assert.equal(wavDurationMs(silentWav(1000)), 1000);
  assert.deepEqual(validateAudio(silentWav(2500), "audio/wav"), { mime: "audio/wav", durationMs: 2500 });
  assert.throws(() => validateAudio(silentWav(31_000), "audio/wav"), /too_long/);
  assert.throws(() => validateAudio(new Uint8Array(100).fill(7), "audio/wav"), /corrupt/);
  assert.throws(() => validateAudio(silentWav(500), "audio/webm"), /unsupported_format/);
});
