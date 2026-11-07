import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiParser, type GenerateRequest } from "../../server/agent/gemini";
import { InvalidModelOutput, ProviderUnavailable } from "../../server/agent/errors";

const valid = {
  action: "add_credit", customer_candidate_id: "c1", amount_paise: 34000, items: null,
  evidence: { customer_phrase: "Ramesh", amount_phrase: "340" }, find: { purpose: null, date_from: null, date_to: null },
  entry_option: null, missing: null, intent: null, language: "hinglish",
};
const ctx = { transcript: "Ramesh ko 340", candidates: [{ id: "c1", name: "Ramesh", label: "", aliases: [] }], pendingQuestion: null, pendingOptions: [], todayIst: "2026-11-08" };
const parser = (replies: (string | Error)[], seen: GenerateRequest[] = []) =>
  new GeminiParser({ apiKey: "unused", model: "test-model", generate: async (req) => { seen.push(req); const r = replies.shift(); if (r instanceof Error) throw r; return { text: r }; } });

test("uses structured JSON output with the declared schema, temperature 0 and a timeout", async () => {
  const seen: GenerateRequest[] = [];
  await parser([JSON.stringify(valid)], seen).propose(ctx);
  assert.equal(seen[0].model, "test-model");
  assert.equal(seen[0].config.responseMimeType, "application/json");
  assert.ok(seen[0].config.responseJsonSchema);
  assert.equal(seen[0].config.temperature, 0);
  assert.ok(seen[0].config.abortSignal instanceof AbortSignal);
  assert.match(String(seen[0].config.systemInstruction), /untrusted data/);
});
test("returns a schema-valid proposal", async () => assert.deepEqual(await parser([JSON.stringify(valid)]).propose(ctx), valid));
test("invalid JSON gets exactly one repair attempt", async () => {
  const seen: GenerateRequest[] = [];
  assert.deepEqual(await parser(["not json", JSON.stringify(valid)], seen).propose(ctx), valid);
  assert.equal(seen.length, 2);
  assert.match(seen[1].contents, /previous reply was invalid/);
});
test("two failures end in InvalidModelOutput (safe fallback, no write)", async () => {
  await assert.rejects(parser(["{}", "[]"]).propose(ctx), InvalidModelOutput);
});
test("two actions (array) are rejected", async () => {
  await assert.rejects(parser([JSON.stringify([valid, valid]), JSON.stringify([valid])]).propose(ctx), InvalidModelOutput);
});
test("unknown tool names and extra fields are rejected", async () => {
  await assert.rejects(parser([JSON.stringify({ ...valid, action: "set_balance" }), JSON.stringify({ ...valid, shop_id: "x" })]).propose(ctx), InvalidModelOutput);
});
test("negative, zero or fractional amounts are rejected", async () => {
  await assert.rejects(parser([JSON.stringify({ ...valid, amount_paise: -5 }), JSON.stringify({ ...valid, amount_paise: 1.5 })]).propose(ctx), InvalidModelOutput);
});
test("provider outage maps to ProviderUnavailable without leaking details", async () => {
  const error = Object.assign(new Error("quota exceeded for key AIza-secret"), { name: "ApiError" });
  await assert.rejects(parser([error]).propose(ctx), (e: unknown) => e instanceof ProviderUnavailable && !String((e as Error).message).includes("AIza"));
});
