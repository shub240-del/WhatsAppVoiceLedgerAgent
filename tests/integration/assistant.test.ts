import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { adminApp, clear, seedShop, proposal, ScriptedParser } from "./helpers";
import { runAssistantTurn } from "../../server/assistant";

// Runs against the Firestore emulator (pnpm test:emulators). Same agent as WhatsApp, web channel.
const { db, close } = adminApp("assistant-tests");
after(close);
let parser: ScriptedParser;
let A: { shopId: string; uid: string };
let n = 0;
const turn = (text: string, replyTo?: string) =>
  runAssistantTurn(db, A.uid, { turnId: `turn-${Date.now()}-${++n}`, text, ...(replyTo ? { replyTo } : {}) }, { parser, stt: null });
const credit = (id: string, name: string, rupees: number) =>
  proposal({ action: "add_credit", customer_candidate_id: id, amount_paise: rupees * 100, evidence: { customer_phrase: name, amount_phrase: String(rupees) } });

beforeEach(async () => {
  await clear();
  parser = new ScriptedParser({});
  A = await seedShop(db, "a", [
    { id: "ramesh-1", name: "Ramesh", label: "Mandir ke paas", balance: 92000 },
    { id: "ramesh-2", name: "Ramesh", label: "Dudhwala" },
    { id: "sunita", name: "Sunita", balance: 126000 },
  ]);
});

test("typed udhaar is saved with source 'assistant', and Undo reverses exactly that entry", async () => {
  parser.script["Sunita ko 340 ka udhaar"] = credit("sunita", "Sunita", 340);
  const saved = await turn("Sunita ko 340 ka udhaar");
  assert.equal(saved.kind, "saved");
  assert.match(saved.reply, /₹340/);
  assert.doesNotMatch(saved.reply, /GALAT/);
  const entry = (await db.doc(`shops/${A.shopId}/ledgerEntries/${saved.entryId}`).get()).data()!;
  assert.equal(entry.source, "assistant");
  assert.equal((await db.doc(`shops/${A.shopId}/customers/sunita`).get()).get("balancePaise"), 160000);

  const undone = await turn("galat", saved.replyId!);
  assert.equal(undone.kind, "undone");
  assert.equal((await db.doc(`shops/${A.shopId}/customers/sunita`).get()).get("balancePaise"), 126000);
});

test("ambiguous name asks which Ramesh with options, and the answer completes the entry", async () => {
  parser.script["Ramesh ko 200 ka udhaar"] = proposal({ action: "add_credit", customer_candidate_id: null, amount_paise: 20000, evidence: { customer_phrase: "Ramesh", amount_phrase: "200" } });
  const q = await turn("Ramesh ko 200 ka udhaar");
  assert.equal(q.kind, "question");
  assert.equal(q.options.length, 2);
  const pick = q.options.find((o) => o.label.includes("Dudhwala"))!;
  const done = await turn(String(pick.key), q.replyId!);
  assert.equal(done.kind, "saved");
  assert.equal((await db.doc(`shops/${A.shopId}/customers/ramesh-2`).get()).get("balancePaise"), 20000);
});

test("the same turn id twice writes only one entry", async () => {
  parser.script["Sunita ko 50 ka udhaar"] = credit("sunita", "Sunita", 50);
  const input = { turnId: "fixed-turn-0001", text: "Sunita ko 50 ka udhaar" };
  await runAssistantTurn(db, A.uid, input, { parser, stt: null });
  await runAssistantTurn(db, A.uid, input, { parser, stt: null });
  assert.equal((await db.collection(`shops/${A.shopId}/ledgerEntries`).get()).size, 1);
});
