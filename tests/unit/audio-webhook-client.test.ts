import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { oggOpusDurationMs, validateAudio } from "../../server/audio";
import { UnusableAudio } from "../../server/agent/errors";
import { parseMessage, verifySignature } from "../../server/whatsapp/webhook";
import { MetaWhatsAppClient, WhatsAppHttpError } from "../../server/whatsapp/client";
import { isRetryable } from "../../server/jobs";
import { ProviderUnavailable } from "../../server/agent/errors";

/** Minimal OGG/Opus container: OpusHead page + final page with granule = ms * 48. */
function ogg(ms: number, size = 2000) {
  const page = (granule: bigint, body: string) => {
    const header = Buffer.alloc(27);
    header.write("OggS", 0, "latin1");
    header.writeBigUInt64LE(granule, 6);
    return Buffer.concat([header, Buffer.from(body, "latin1")]);
  };
  const head = page(0n, "OpusHead");
  const filler = Buffer.alloc(Math.max(0, size - 70), 1);
  return new Uint8Array(Buffer.concat([head, filler, page(BigInt(ms * 48), "data")]));
}
test("OGG/Opus duration is read from the final granule position", () => assert.equal(oggOpusDurationMs(ogg(8000)), 8000));
test("valid WhatsApp voice note passes validation", () => assert.deepEqual(validateAudio(ogg(8000), "audio/ogg; codecs=opus"), { mime: "audio/ogg", durationMs: 8000 }));
const rejects = (bytes: Uint8Array, mime: string, reason: string) =>
  assert.throws(() => validateAudio(bytes, mime), (e: unknown) => e instanceof UnusableAudio && e.reason === reason);
test("audio over 30 seconds is rejected (3-minute note)", () => rejects(ogg(180_000), "audio/ogg", "too_long"));
test("empty audio is rejected", () => rejects(new Uint8Array(10), "audio/ogg", "empty"));
test("corrupt OGG is rejected", () => rejects(new Uint8Array(500).fill(7), "audio/ogg", "corrupt"));
test("unsupported formats are rejected", () => rejects(ogg(1000), "video/mp4", "unsupported_format"));
test("OGG without Opus codec is rejected", () => {
  const bytes = ogg(1000);
  Buffer.from(bytes.buffer).write("XXXXHead", 27, "latin1");
  rejects(bytes, "audio/ogg", "unsupported_codec");
});
test("oversized audio (>16 MB) is rejected", () => rejects(new Uint8Array(16 * 1024 * 1024 + 1), "audio/mpeg", "too_large"));

const secret = "test-app-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
test("valid Meta signature over the raw body is accepted", () => assert.equal(verifySignature(Buffer.from("{}"), sign("{}"), secret), true));
test("tampered body, wrong secret, malformed or missing header are rejected", () => {
  assert.equal(verifySignature(Buffer.from('{"a":1}'), sign("{}"), secret), false);
  assert.equal(verifySignature(Buffer.from("{}"), sign("{}"), "other"), false);
  assert.equal(verifySignature(Buffer.from("{}"), "sha256=zz", secret), false);
  assert.equal(verifySignature(Buffer.from("{}"), undefined, secret), false);
});
test("inbound audio, text, reply-context and interactive messages are parsed", () => {
  const audio = parseMessage({ id: "wamid.A", from: "919876543210", timestamp: "1762560000", type: "audio", audio: { id: "MEDIA1", mime_type: "audio/ogg; codecs=opus" } });
  assert.equal(audio?.messageType, "audio");
  assert.equal(audio?.from, "+919876543210");
  assert.equal(audio?.mediaId, "MEDIA1");
  const reply = parseMessage({ id: "wamid.B", from: "919876543210", timestamp: "1762560000", type: "text", text: { body: "GALAT" }, context: { id: "wamid.C" } });
  assert.equal(reply?.contextWamid, "wamid.C");
  assert.equal(parseMessage({ id: "wamid.D", from: "919876543210", timestamp: "1", type: "interactive", interactive: { button_reply: { title: "1" } } })?.text, "1");
  assert.equal(parseMessage({ id: "wamid.E", from: "919876543210", timestamp: "1", type: "sticker" })?.messageType, "other");
});
test("malformed sender, id or timestamp is dropped", () => {
  assert.equal(parseMessage({ id: "wamid.A", from: "abc", timestamp: "1", type: "text" }), null);
  assert.equal(parseMessage({ id: "<script>", from: "919876543210", timestamp: "1", type: "text" }), null);
  assert.equal(parseMessage({ id: "wamid.A", from: "919876543210", timestamp: "soon", type: "text" }), null);
});

const config = { accessToken: "token-xyz", phoneNumberId: "1234567", businessAccountId: "1", appSecret: "s", verifyToken: "v", graphVersion: "v21.0" };
type Call = { url: string; init: RequestInit };
const fakeFetch = (responses: Response[], calls: Call[]) => (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return responses.shift()!; }) as typeof fetch;
test("sendText posts the documented Cloud API payload with reply context", async () => {
  const calls: Call[] = [];
  const client = new MetaWhatsAppClient(config, fakeFetch([Response.json({ messages: [{ id: "wamid.OUT" }] })], calls));
  assert.deepEqual(await client.sendText("+919876543210", "hello", { replyTo: "wamid.IN" }), { messageId: "wamid.OUT" });
  assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/1234567/messages");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body, { messaging_product: "whatsapp", recipient_type: "individual", to: "919876543210", type: "text", text: { preview_url: false, body: "hello" }, context: { message_id: "wamid.IN" } });
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer token-xyz");
});
test("media fetch is two-step and refuses untrusted hosts (token never leaves Meta)", async () => {
  const calls: Call[] = [];
  const evil = new MetaWhatsAppClient(config, fakeFetch([Response.json({ url: "https://attacker.example/x", mime_type: "audio/ogg" })], calls));
  await assert.rejects(evil.fetchMedia("MEDIA1"), (e: unknown) => e instanceof UnusableAudio && e.reason === "untrusted_media_host");
  assert.equal(calls.length, 1);
  const ok = new MetaWhatsAppClient(config, fakeFetch([Response.json({ url: "https://lookaside.fbsbx.com/m", mime_type: "audio/ogg", file_size: 4 }), new Response(new Uint8Array([1, 2, 3, 4]))], calls));
  const media = await ok.fetchMedia("MEDIA1");
  assert.equal(media.bytes.byteLength, 4);
});
test("oversized media is refused before download", async () => {
  const calls: Call[] = [];
  const client = new MetaWhatsAppClient(config, fakeFetch([Response.json({ url: "https://lookaside.fbsbx.com/m", mime_type: "audio/ogg", file_size: 20_000_000 })], calls));
  await assert.rejects(client.fetchMedia("MEDIA1"), UnusableAudio);
  assert.equal(calls.length, 1);
});
test("Graph errors are classified retryable (429/5xx/130429) vs permanent", async () => {
  const run = async (res: Response) => {
    const client = new MetaWhatsAppClient(config, fakeFetch([res], []));
    try { await client.sendText("+911234567890", "x"); } catch (e) { return e as WhatsAppHttpError; }
    throw new Error("expected failure");
  };
  assert.equal((await run(new Response("{}", { status: 503 }))).retryable, true);
  assert.equal((await run(Response.json({ error: { code: 130429 } }, { status: 400 }))).retryable, true);
  assert.equal((await run(Response.json({ error: { code: 131026 } }, { status: 400 }))).retryable, false);
  assert.equal((await run(new Response("{}", { status: 401 }))).retryable, false);
});
test("job retry classification: providers, Firestore transient codes, permanent errors", () => {
  assert.equal(isRetryable(new ProviderUnavailable("gemini", "x")), true);
  assert.equal(isRetryable(Object.assign(new Error("x"), { code: 14 })), true);
  assert.equal(isRetryable(new WhatsAppHttpError(400, 131026, false)), false);
  assert.equal(isRetryable(new Error("bug")), false);
});
