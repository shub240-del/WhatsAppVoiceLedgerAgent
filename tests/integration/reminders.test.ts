import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { adminApp, clear, seedShop } from "./helpers";
import { runReminders, type ReminderSender } from "../../server/reminders";

const { db, close } = adminApp("reminder-tests");
after(close);
const SUNDAY_6PM = Date.parse("2026-11-08T12:35:00Z");
let sent: Parameters<ReminderSender["send"]>[0][] = [];
const sender: ReminderSender = { send: async (input) => { sent.push(input); return { wamid: `wamid.r.${sent.length}`, channel: "template" }; } };

beforeEach(async () => {
  await clear();
  sent = [];
  await seedShop(db, "a", [
    { id: "owes", name: "Ramesh", balance: 34000, phone: "+919811111111" },
    { id: "zero", name: "Sunita", balance: 0, phone: "+919822222222" },
    { id: "nophone", name: "Mukesh", balance: 500 },
    { id: "optout", name: "Geeta", balance: 900, phone: "+919833333333" },
    { id: "noconsent", name: "Raju", balance: 700, phone: "+919844444444" },
  ]);
  await db.doc("shops/shop-a").update({ remindersEnabled: true, upiVpa: "shop@okaxis" });
  await db.doc("shops/shop-a/reminderPreferences/owes").set({ status: "opted_in" });
  await db.doc("shops/shop-a/reminderPreferences/optout").set({ status: "opted_out" });
});
const logs = async () => Object.fromEntries((await db.collection("shops/shop-a/reminderLogs").get()).docs.map((d) => [d.get("customerId"), d.get("skipReason") ?? d.get("status")]));

test("production policy gate (NOT_APPROVED) sends nothing and records exact skip reasons", async () => {
  const r = await runReminders(db, SUNDAY_6PM, { sender });
  assert.equal(r.ran, true);
  assert.equal(sent.length, 0);
  assert.deepEqual(await logs(), { owes: "policy_blocked", zero: "zero_balance", nophone: "no_phone", optout: "opted_out", noconsent: "no_opt_in" });
  assert.equal((await db.doc("shops/shop-a/reminderJobs/2026-11-08").get()).get("policyGateState"), "NOT_APPROVED");
});
test("not due outside Sunday 18:00 IST", async () => {
  assert.equal((await runReminders(db, Date.parse("2026-11-08T12:00:00Z"))).ran, false);
  assert.equal((await db.collection("shops/shop-a/reminderLogs").get()).size, 0);
});
test("rerun on the same Sunday never double-processes (idempotent per shop)", async () => {
  const policy = { enabled: true, gate: "TEST_ONLY_GO" };
  await runReminders(db, SUNDAY_6PM, { sender, policy });
  await runReminders(db, SUNDAY_6PM + 600_000, { sender, policy });
  assert.equal(sent.length, 1);
});
test("with an approved gate (test-only), one message per eligible customer, own data and UPI link only", async () => {
  await runReminders(db, SUNDAY_6PM, { sender, policy: { enabled: true, gate: "TEST_ONLY_GO" } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "+919811111111");
  assert.match(sent[0].text, /Ramesh ji/);
  for (const other of ["Sunita", "Mukesh", "Geeta", "Raju"]) assert.doesNotMatch(sent[0].text, new RegExp(other));
  assert.equal(new URL(sent[0].upiLink!).searchParams.get("am"), "340.00");
  assert.equal(sent[0].amountWords, "teen sau chaalees rupaye");
  const link = (await db.collection("shops/shop-a/paymentLinks").get()).docs[0];
  assert.equal(link.get("status"), "unconfirmed");
  assert.equal((await db.doc("shops/shop-a/customers/owes").get()).get("balancePaise"), 34000); // a link is never a payment
});
test("shop with reminders disabled is skipped as shop_disabled", async () => {
  await db.doc("shops/shop-a").update({ remindersEnabled: false });
  await runReminders(db, SUNDAY_6PM, { sender, policy: { enabled: true, gate: "TEST_ONLY_GO" } });
  assert.equal((await logs()).owes, "shop_disabled");
  assert.equal(sent.length, 0);
});
