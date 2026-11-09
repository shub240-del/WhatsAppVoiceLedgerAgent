// HTTP-level tests of the real Express app against the in-memory Firestore, with a fake token verifier.
// Run: pnpm test:memory. Covers auth, tenant isolation, input abuse, limits and the assistant endpoint.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { createApi } from "../../server/app";
import { MemoryFirestore } from "../support/memory-firestore";
import { proposal, ScriptedParser } from "../integration/helpers";

const memory = new MemoryFirestore();
const db = memory as unknown as Firestore;
const fakeAuth = {
  verifyIdToken: async (token: string) => {
    const m = /^test-token:([A-Za-z0-9_-]+)$/.exec(token);
    if (!m) throw new Error("invalid token");
    return { uid: m[1] };
  },
} as unknown as Auth;
const parser = new ScriptedParser({});
let server: Server;
let base = "";
let n = 0;

before(async () => {
  server = createApi(db, fakeAuth, "https://udhaar.example", { env: {}, assistant: { parser, stt: null } }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => memory.clear());

type Opts = { uid?: string | null; method?: string; body?: unknown; key?: string; headers?: Record<string, string>; raw?: string };
async function call(path: string, o: Opts = {}) {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.uid !== null) headers.Authorization = `Bearer test-token:${o.uid ?? "owner-a"}`;
  if (o.body !== undefined || o.raw !== undefined) headers["Content-Type"] = "application/json";
  if (o.key) headers["Idempotency-Key"] = o.key;
  const res = await fetch(base + path, {
    method: o.method ?? (o.body === undefined && o.raw === undefined ? "GET" : "POST"),
    headers,
    body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
const key = () => `key-${Date.now()}-${++n}`;
async function shop(uid: string, name = "Sharma Store") {
  const r = await call("/api/onboarding/shop", { uid, body: { shopName: name } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.shopId as string;
}
async function customer(uid: string, name: string, label = "") {
  const r = await call("/api/customers", { uid, body: { name, displayLabel: label }, key: key() });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.customerId as string;
}

test("authentication: missing, malformed and forged tokens are rejected with JSON 401", async () => {
  for (const headers of [{}, { Authorization: "Bearer" }, { Authorization: "Basic abc" }, { Authorization: "Bearer forged" }] as Record<string, string>[]) {
    const r = await call("/api/connection", { uid: null, headers });
    assert.equal(r.status, 401);
    assert.ok(r.json.error?.message);
  }
});

test("new owner: no shop yet → 403 everywhere, then self-serve shop creation unlocks the API", async () => {
  assert.equal((await call("/api/customers", { body: { name: "Ramesh" }, key: key() })).status, 403);
  assert.equal((await call("/api/assistant", { body: { turnId: "turn-000001", text: "hi" } })).status, 403);
  await shop("owner-a");
  const again = await call("/api/onboarding/shop", { body: { shopName: "Other name" } });
  assert.equal(again.status, 200);
  assert.equal((await call("/api/connection")).status, 200);
});

test("tenant isolation: owner B cannot read or change owner A's customers or entries by id", async () => {
  await shop("owner-a");
  await shop("owner-b", "Gupta Kirana");
  const ramesh = await customer("owner-a", "Ramesh");
  const credit = await call("/api/ledger/actions", { body: { action: "add_credit", customerId: ramesh, amountPaise: 34000 }, key: key() });
  assert.equal(credit.status, 200);
  const entryId = credit.json.entryId;
  const attempts = [
    call("/api/ledger/actions", { uid: "owner-b", body: { action: "add_payment", customerId: ramesh, amountPaise: 100 }, key: key() }),
    call("/api/ledger/actions", { uid: "owner-b", body: { action: "get_balance", customerId: ramesh } }),
    call("/api/ledger/actions", { uid: "owner-b", body: { action: "undo_entry", entryId, reason: "steal" }, key: key() }),
    call(`/api/customers/${ramesh}`, { uid: "owner-b", method: "PATCH", body: { name: "Hacked", displayLabel: "", phone: null, aliases: [] } }),
    call(`/api/entries/${entryId}/edit`, { uid: "owner-b", body: { type: "credit", amountPaise: 1, reason: "steal", notes: "" }, key: key() }),
  ];
  for (const r of await Promise.all(attempts)) assert.ok([403, 404].includes(r.status), `expected 403/404, got ${r.status} ${JSON.stringify(r.json)}`);
  const own = await call("/api/ledger/actions", { body: { action: "get_balance", customerId: ramesh } });
  assert.equal(own.json.balancePaise, 34000);
});

test("money input abuse is rejected without writes: zero, negative, fractional, string, unsafe, huge", async () => {
  await shop("owner-a");
  const ramesh = await customer("owner-a", "Ramesh");
  for (const amountPaise of [0, -100, 10.5, "500", Number.MAX_SAFE_INTEGER + 2, null, 1e30]) {
    const r = await call("/api/ledger/actions", { body: { action: "add_credit", customerId: ramesh, amountPaise }, key: key() });
    assert.equal(r.status, 400, `amount ${amountPaise} → ${r.status}`);
  }
  const balance = await call("/api/ledger/actions", { body: { action: "get_balance", customerId: ramesh } });
  assert.equal(balance.json.balancePaise, 0);
});

test("idempotency: same key + same body replays; same key + different body conflicts", async () => {
  await shop("owner-a");
  const k = key();
  const a = await call("/api/customers", { body: { name: "Sunita" }, key: k });
  const b = await call("/api/customers", { body: { name: "Sunita" }, key: k });
  assert.equal(a.json.customerId, b.json.customerId);
  const c = await call("/api/customers", { body: { name: "Mahesh" }, key: k });
  assert.equal(c.status, 409);
  assert.equal((await call("/api/customers", { body: { name: "NoKey" } })).status, 400);
});

test("malformed requests: invalid JSON and unknown fields get JSON 400s, never 500", async () => {
  await shop("owner-a");
  const bad = await call("/api/customers", { raw: "{not json", key: key() });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, "INVALID_JSON");
  const extra = await call("/api/customers", { body: { name: "Ramesh", balancePaise: 999999 }, key: key() });
  assert.equal(extra.status, 400);
  const shopPatch = await call("/api/shop", { method: "PATCH", body: { language: "fr" } });
  assert.equal(shopPatch.status, 400);
});

test("oversized bodies get a JSON 413, not a crash (16 kB API limit, 2 MB for assistant audio)", async () => {
  await shop("owner-a");
  const big = await call("/api/customers", { body: { name: "x".repeat(20_000) }, key: key() });
  assert.equal(big.status, 413);
  assert.equal(big.json.error?.code, "PAYLOAD_TOO_LARGE");
  const huge = await call("/api/assistant", { body: { turnId: "turn-000002", audioBase64: "A".repeat(2_200_000), mimeType: "audio/wav" } });
  assert.equal(huge.status, 413);
});

test("assistant: typed credit saves with items, undo reverses, and the reply never mentions WhatsApp", async () => {
  await shop("owner-a");
  const sunita = await customer("owner-a", "Sunita");
  const t = "Sunita ne teen packet Parle-G liya, 85 rupaye";
  parser.script[t] = proposal({ action: "add_credit", customer_candidate_id: sunita, amount_paise: 8500, items: "3 packet Parle-G", evidence: { customer_phrase: "Sunita", amount_phrase: "85 rupaye" } });
  const saved = await call("/api/assistant", { body: { turnId: "turn-credit-1", text: t } });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.kind, "saved");
  assert.equal(saved.json.reply, "Sunita: +₹85 (3 packet Parle-G). Total baaki: ₹85.");
  const undo = await call("/api/assistant", { body: { turnId: "turn-undo-1", text: "galat", replyTo: saved.json.replyId } });
  assert.equal(undo.json.kind, "undone");
  assert.doesNotMatch(JSON.stringify([saved.json, undo.json]), /whatsapp/i);
});

test("assistant: voice without speech-to-text configured gets an honest text reply, not a 500", async () => {
  await shop("owner-a");
  const wav = Buffer.alloc(44 + 32000);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + 32000, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(32000, 40);
  const r = await call("/api/assistant", { body: { turnId: "turn-voice-1", audioBase64: wav.toString("base64"), mimeType: "audio/wav" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.kind, "info");
  assert.match(r.json.reply, /setup nahi|type|likh/i);
  assert.doesNotMatch(r.json.reply, /whatsapp|voice notes/i);
});

test("assistant: garbage audio is reported as unusable audio, not a server error", async () => {
  await shop("owner-a");
  const r = await call("/api/assistant", { body: { turnId: "turn-voice-2", audioBase64: Buffer.from("not really audio at all, just text bytes here").toString("base64"), mimeType: "audio/wav" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.kind, "info");
});

test("rate limit: a burst over 60 requests/minute is throttled with JSON 429", async () => {
  // Own uid: the limiter is per user, so this burst must not throttle the other tests.
  await shop("owner-burst");
  const results = await Promise.all(Array.from({ length: 65 }, () => call("/api/connection", { uid: "owner-burst" })));
  assert.ok(results.some((r) => r.status === 429));
  assert.equal(results.find((r) => r.status === 429)!.json.error.code, "RATE_LIMITED");
});

test("security headers and CORS: only the configured origin is allowed", async () => {
  await shop("owner-a");
  const ok = await call("/api/connection", { headers: { Origin: "https://udhaar.example" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://udhaar.example");
  const evil = await call("/api/connection", { headers: { Origin: "https://evil.example" } });
  assert.notEqual(evil.headers.get("access-control-allow-origin"), "https://evil.example");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.equal(ok.headers.get("x-powered-by"), null);
});

test("shop settings: owner can switch language; it is audited", async () => {
  const shopId = await shop("owner-a");
  const r = await call("/api/shop", { method: "PATCH", body: { language: "mr" } });
  assert.equal(r.status, 200);
  assert.equal((await db.doc(`shops/${shopId}`).get()).get("language"), "mr");
  const audits = await db.collection(`shops/${shopId}/auditLogs`).where("action", "==", "update_shop").get();
  assert.equal(audits.size, 1);
});

test("AI accuracy endpoint without a Gemini key explains the problem instead of failing", async () => {
  await shop("owner-a");
  const r = await call("/api/integrations/gemini/eval", { body: { batch: 0 } });
  assert.equal(r.status, 200);
  assert.match(r.json.problem, /APP_GEMINI_API_KEY/);
});
