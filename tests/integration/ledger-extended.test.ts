import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { adminApp, clear, seedShop } from "./helpers";
import { LedgerService } from "../../server/ledger";
import { verifyShopBalances } from "../../server/integrity";

const { db, close } = adminApp("ledger-extended");
after(close);
const ledger = new LedgerService(db);
let k = 0;
const key = () => `test-key-${++k}-xxxxxx`;
const add = (action: "add_credit" | "add_payment", amountPaise: number, extra = {}) => ledger.execute("owner-a", { action, customerId: "c", amountPaise, ...extra }, key()) as Promise<{ entryId: string; balancePaise: number }>;
const bal = async () => (await db.doc("shops/shop-a/customers/c").get()).get("balancePaise");

beforeEach(async () => {
  await clear();
  await seedShop(db, "a", [{ id: "c", name: "Ramesh" }]);
  await seedShop(db, "b", [{ id: "c", name: "Ramesh" }]);
});

test("₹10, ₹340 credits and ₹1,000 payment produce exact balances", async () => {
  assert.equal((await add("add_credit", 1000)).balancePaise, 1000);
  assert.equal((await add("add_credit", 34000)).balancePaise, 35000);
  assert.equal((await add("add_payment", 35000)).balancePaise, 0); // full settlement
  assert.equal((await add("add_credit", 200000)).balancePaise, 200000);
  assert.equal((await add("add_payment", 100000)).balancePaise, 100000); // partial
  assert.equal((await verifyShopBalances(db, "shop-a")).mismatches.length, 0);
});
test("edit = reversal + new entry + revision record; original untouched", async () => {
  const { entryId } = await add("add_credit", 34000);
  const before = (await db.doc(`shops/shop-a/ledgerEntries/${entryId}`).get()).data();
  const r = await ledger.editEntry("owner-a", { entryId, type: "credit", amountPaise: 43000, reason: "Wrong amount spoken" }, key());
  assert.equal(r.balancePaise, 43000);
  assert.deepEqual((await db.doc(`shops/shop-a/ledgerEntries/${entryId}`).get()).data(), before);
  const revision = await db.doc(`shops/shop-a/entryRevisions/${entryId}`).get();
  assert.equal(revision.get("newEntryId"), r.newEntryId);
  assert.equal(revision.get("editedBy"), "owner-a");
  assert.equal((await db.collection("shops/shop-a/ledgerEntries").get()).size, 3);
  assert.equal((await verifyShopBalances(db, "shop-a")).mismatches.length, 0);
});
test("edit requires a reason, refuses double edits and is idempotent", async () => {
  const { entryId } = await add("add_credit", 34000);
  await assert.rejects(ledger.editEntry("owner-a", { entryId, type: "credit", amountPaise: 100, reason: "" }, key()));
  const k1 = key();
  const a = await ledger.editEntry("owner-a", { entryId, type: "payment", amountPaise: 100, reason: "Was a payment", confirmAdvance: true }, k1);
  const b = await ledger.editEntry("owner-a", { entryId, type: "payment", amountPaise: 100, reason: "Was a payment", confirmAdvance: true }, k1);
  assert.deepEqual(a, b);
  await assert.rejects(ledger.editEntry("owner-a", { entryId, type: "credit", amountPaise: 5, reason: "Again please" }, key()), /already been reversed/);
});
test("edit cannot target another shop's entry", async () => {
  const { entryId } = await add("add_credit", 34000);
  await assert.rejects(ledger.editEntry("owner-b", { entryId, type: "credit", amountPaise: 1, reason: "Cross shop" }, key()), /not found/);
});
test("zero, negative, fractional and unsafe amounts are rejected without writes", async () => {
  for (const amountPaise of [0, -100, 1.5, Number.MAX_SAFE_INTEGER + 2]) await assert.rejects(add("add_credit", amountPaise));
  assert.equal((await db.collection("shops/shop-a/ledgerEntries").get()).size, 0);
});
test("incorrect customer id and cross-shop customer ids are rejected", async () => {
  await assert.rejects(ledger.execute("owner-a", { action: "add_credit", customerId: "missing", amountPaise: 100 }, key()), /not found/);
  await assert.rejects(ledger.execute("owner-a", { action: "add_credit", customerId: "../../shops/shop-b/customers/c", amountPaise: 100 }, key()));
  assert.equal((await db.doc("shops/shop-b/customers/c").get()).get("balancePaise"), 0);
});
test("customer update changes descriptive fields and matching keys only, with audit", async () => {
  await add("add_credit", 1000);
  await ledger.updateCustomer("owner-a", "c", { name: "Ramesh Kumar", aliases: ["Pappu", "रमेश"], displayLabel: "Gali 2" });
  const c = await db.doc("shops/shop-a/customers/c").get();
  assert.equal(c.get("name"), "Ramesh Kumar");
  assert.deepEqual(c.get("normalizedAliases"), ["papu", "rames"]);
  assert.equal(c.get("balancePaise"), 1000);
  await assert.rejects(ledger.updateCustomer("owner-a", "c", { balancePaise: 0 }));
  assert.ok((await db.collection("shops/shop-a/auditLogs").where("action", "==", "update_customer").get()).size === 1);
});
test("reminder consent is recorded with timestamp, source and audit; opt-out wins", async () => {
  await ledger.setReminderConsent("owner-a", "c", { status: "opted_in" });
  let pref = await db.doc("shops/shop-a/reminderPreferences/c").get();
  assert.equal(pref.get("status"), "opted_in");
  assert.equal(pref.get("optInSource"), "owner_attested_dashboard");
  await ledger.setReminderConsent("owner-a", "c", { status: "opted_out" });
  pref = await db.doc("shops/shop-a/reminderPreferences/c").get();
  assert.equal(pref.get("status"), "opted_out");
  assert.ok(pref.get("optedOutAt"));
  await assert.rejects(ledger.setReminderConsent("owner-b", "missing", { status: "opted_in" }));
});
test("integrity check detects a tampered cached balance", async () => {
  await add("add_credit", 34000);
  await db.doc("shops/shop-a/customers/c").update({ balancePaise: 1 });
  const r = await verifyShopBalances(db, "shop-a");
  assert.deepEqual(r.mismatches, [{ customerId: "c", cachedPaise: 1, ledgerPaise: 34000 }]);
});
test("WhatsApp-sourced writes record source and message id", async () => {
  const r = (await ledger.executeWith("owner-a", { action: "add_credit", customerId: "c", amountPaise: 500 }, key(), { source: "whatsapp", sourceMessageId: "wamid.X" })) as { entryId: string };
  const e = await db.doc(`shops/shop-a/ledgerEntries/${r.entryId}`).get();
  assert.equal(e.get("source"), "whatsapp");
  assert.equal(e.get("sourceMessageId"), "wamid.X");
});
test("concurrent payment and credit on one customer serialise correctly", async () => {
  await add("add_credit", 100000);
  await Promise.all([add("add_payment", 30000), add("add_credit", 5000), add("add_payment", 20000)]);
  assert.equal(await bal(), 55000);
  assert.equal((await verifyShopBalances(db, "shop-a")).mismatches.length, 0);
});
