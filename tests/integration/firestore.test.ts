import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { LedgerService } from "../../server/ledger";

if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("Tests require the Firestore emulator. Live project writes are forbidden.");
const projectId = "demo-udhaar-test";
const app = initializeApp({ projectId }, "ledger-tests");
const db = getFirestore(app);
const ledger = new LedgerService(db);
let env: RulesTestEnvironment;

before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  env = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port), rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => {
  await env?.cleanup();
  await db.terminate();
  await deleteApp(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  const batch = db.batch();
  for (const suffix of ["a", "b"]) {
    batch.set(db.doc(`owners/owner-${suffix}`), {
      shopId: `shop-${suffix}`,
      active: true,
      role: "owner",
    });
    batch.set(db.doc(`shops/shop-${suffix}`), {
      active: true,
      name: `Shop ${suffix}`,
      remindersEnabled: false,
    });
    batch.set(db.doc(`shops/shop-${suffix}/customers/customer-${suffix}`), {
      name: "Ramesh",
      balancePaise: 0,
      active: true,
    });
  }
  await batch.commit();
});
const credit = (amountPaise = 34000) => ({
  action: "add_credit",
  customerId: "customer-a",
  amountPaise,
});
const balance = async () =>
  (await db.doc("shops/shop-a/customers/customer-a").get()).get("balancePaise");

test("rules permit only the owner’s own shop reads", async () => {
  const client = env.authenticatedContext("owner-a").firestore();
  await assertSucceeds(getDoc(doc(client, "owners/owner-a")));
  await assertSucceeds(getDoc(doc(client, "shops/shop-a")));
  await assertSucceeds(getDocs(collection(client, "shops/shop-a/customers")));
  await assertFails(getDoc(doc(client, "owners/owner-b")));
  await assertFails(getDoc(doc(client, "shops/shop-b")));
  await assertFails(getDoc(doc(client, "shops/shop-b/customers/customer-b")));
  await assertFails(getDocs(collection(client, "shops")));
  await assertFails(getDocs(collection(client, "shops/shop-b/ledgerEntries")));
});
test("rules deny all anonymous reads and all direct client mutations", async () => {
  const anon = env.unauthenticatedContext().firestore();
  const owner = env.authenticatedContext("owner-a").firestore();
  await assertFails(getDoc(doc(anon, "shops/shop-a")));
  for (const path of [
    "shops/shop-a",
    "owners/owner-a",
    "shops/shop-a/customers/customer-a",
    "shops/shop-a/ledgerEntries/injected",
    "shops/shop-a/auditLogs/injected",
    "shops/shop-a/reminderPreferences/customer-a",
    "shops/shop-a/reversals/injected",
  ]) {
    await assertFails(setDoc(doc(owner, path), { shopId: "shop-b", amountPaise: 0 }));
    await assertFails(deleteDoc(doc(owner, path)));
  }
  await assertFails(updateDoc(doc(owner, "owners/owner-a"), { shopId: "shop-b" }));
});
test("rules deny unknown, disabled, viewer and inactive-shop identities", async () => {
  await assertFails(getDoc(doc(env.authenticatedContext("unknown").firestore(), "shops/shop-a")));
  for (const fields of [
    { active: false, role: "owner" },
    { active: true, role: "viewer" },
  ]) {
    await db.doc("owners/owner-a").update(fields);
    await assertFails(
      getDoc(
        doc(env.authenticatedContext("owner-a").firestore(), "shops/shop-a/customers/customer-a"),
      ),
    );
  }
  await db.doc("owners/owner-a").update({ active: true, role: "owner" });
  await db.doc("shops/shop-a").update({ active: false });
  await assertFails(
    getDoc(
      doc(env.authenticatedContext("owner-a").firestore(), "shops/shop-a/customers/customer-a"),
    ),
  );
});
test("credit, payment and audit records commit with exact balances", async () => {
  const first = await ledger.execute("owner-a", credit(), "credit-0001");
  assert.equal(first.balancePaise, 34000);
  const paid = await ledger.execute(
    "owner-a",
    { action: "add_payment", customerId: "customer-a", amountPaise: 5050 },
    "payment-0001",
  );
  assert.equal(paid.balancePaise, 28950);
  const entries = await db.collection("shops/shop-a/ledgerEntries").get();
  assert.equal(
    entries.docs.reduce((s, e) => s + e.get("signedAmountPaise"), 0),
    await balance(),
  );
  assert.equal((await db.collection("shops/shop-a/auditLogs").get()).size, 2);
});
test("duplicate keys return the original result; conflicting reuse fails", async () => {
  const a = await ledger.execute("owner-a", credit(), "duplicate-001");
  const b = await ledger.execute("owner-a", credit(), "duplicate-001");
  assert.deepEqual(a, b);
  assert.equal((await db.collection("shops/shop-a/ledgerEntries").get()).size, 1);
  await assert.rejects(
    () => ledger.execute("owner-a", credit(100), "duplicate-001"),
    /different operation/,
  );
  await assert.rejects(() => ledger.execute("owner-a", credit()), /Idempotency/);
});
test("concurrent credits both commit; simultaneous duplicate delivery only commits once", async () => {
  await Promise.all([
    ledger.execute("owner-a", credit(100), "concurrent-01"),
    ledger.execute("owner-a", credit(200), "concurrent-02"),
  ]);
  assert.equal(await balance(), 300);
  const results = await Promise.all([
    ledger.execute("owner-a", credit(50), "concurrent-03"),
    ledger.execute("owner-a", credit(50), "concurrent-03"),
  ]);
  assert.equal(results[0].entryId, results[1].entryId);
  assert.equal(await balance(), 350);
});
test("undo preserves the original and prevents double reversal including concurrent requests", async () => {
  const first = await ledger.execute("owner-a", credit(), "original-0001");
  const before = (await db.doc(`shops/shop-a/ledgerEntries/${first.entryId}`).get()).data();
  const payload = { action: "undo_entry", entryId: first.entryId, reason: "Wrong amount" };
  const results = await Promise.allSettled([
    ledger.execute("owner-a", payload, "reversal-0001"),
    ledger.execute("owner-a", payload, "reversal-0002"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(), 0);
  assert.deepEqual(
    (await db.doc(`shops/shop-a/ledgerEntries/${first.entryId}`).get()).data(),
    before,
  );
  assert.equal((await db.collection("shops/shop-a/ledgerEntries").get()).size, 2);
  const reversal = (await db.collection("shops/shop-a/reversals").get()).docs[0];
  await assert.rejects(
    () =>
      ledger.execute(
        "owner-a",
        { ...payload, entryId: reversal.get("reversalEntryId") },
        "reversal-0003",
      ),
    /itself/,
  );
});
test("undo_last is scoped to the current owner and refuses ambiguous or old entries", async () => {
  const one = await ledger.execute("owner-a", credit(), "recent-entry-01");
  const undo = await ledger.execute(
    "owner-a",
    { action: "undo_last", reason: "Mistaken entry" },
    "recent-undo-01",
  );
  assert.equal(undo.balancePaise, 0);
  await assert.rejects(
    () =>
      ledger.execute(
        "owner-a",
        { action: "undo_last", reason: "Mistaken entry" },
        "recent-undo-02",
      ),
    /No undoable/,
  );
  await ledger.execute("owner-a", credit(1), "recent-entry-02");
  await ledger.execute("owner-a", credit(2), "recent-entry-03");
  await assert.rejects(
    () =>
      ledger.execute(
        "owner-a",
        { action: "undo_last", reason: "Mistaken entry" },
        "recent-undo-03",
      ),
    /Several/,
  );
  assert.ok(one.entryId);
});
test("server rejects cross-shop customer and entry IDs without ledger mutations", async () => {
  await assert.rejects(
    () => ledger.execute("owner-b", credit(), "foreign-shop-01"),
    /Customer not found/,
  );
  const first = await ledger.execute("owner-a", credit(), "foreign-shop-02");
  await assert.rejects(
    () =>
      ledger.execute(
        "owner-b",
        { action: "undo_entry", entryId: first.entryId, reason: "Wrong shop" },
        "foreign-shop-03",
      ),
    /not found/,
  );
  assert.equal((await db.collection("shops/shop-b/ledgerEntries").get()).size, 0);
  await assert.rejects(
    () => ledger.execute("unknown", credit(), "foreign-shop-04"),
    /owner account/,
  );
});
test("financial validation errors and missing customers produce no partial writes", async () => {
  for (const [body, key] of [
    [{ action: "add_payment", customerId: "customer-a", amountPaise: 1 }, "invalid-pay-01"],
    [credit(10000001), "invalid-cap-01"],
    [{ action: "add_credit", customerId: "missing", amountPaise: 1 }, "invalid-cus-01"],
  ] as const)
    await assert.rejects(() => ledger.execute("owner-a", body, key));
  assert.equal(await balance(), 0);
  for (const name of ["ledgerEntries", "auditLogs", "operations"]) {
    assert.equal((await db.collection(`shops/shop-a/${name}`).get()).size, 0);
  }
});
test("a failure after staging the ledger entry rolls the whole transaction back", async () => {
  // Inject a failure at the audit write, after the service has staged the entry and balance.
  const faultingDb = new Proxy(db, {
    get(target, property) {
      if (property === "runTransaction")
        return (work: (tx: any) => Promise<unknown>) =>
          target.runTransaction(async (tx) => {
            const wrapped = new Proxy(tx, {
              get(transaction, member) {
                if (member === "create")
                  return (ref: any, data: unknown) => {
                    if (ref.path.includes("/auditLogs/"))
                      throw new Error("Injected audit storage failure");
                    return transaction.create(ref, data as any);
                  };
                const value = Reflect.get(transaction, member);
                return typeof value === "function" ? value.bind(transaction) : value;
              },
            });
            return work(wrapped);
          });
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await assert.rejects(
    () => new LedgerService(faultingDb).execute("owner-a", credit(), "rollback-test-01"),
    /Injected audit/,
  );
  assert.equal(await balance(), 0);
  for (const name of ["ledgerEntries", "auditLogs", "operations"]) {
    assert.equal((await db.collection(`shops/shop-a/${name}`).get()).size, 0);
  }
});
test("get_balance and paginated find_entries never cross the shop boundary", async () => {
  for (let n = 1; n <= 7; n++) await ledger.execute("owner-a", credit(n), `search-entry-${n}`);
  const result = await ledger.execute("owner-a", {
    action: "get_balance",
    customerId: "customer-a",
  });
  assert.equal(result.balancePaise, 28);
  assert.equal(result.entries.length, 5);
  const first = await ledger.execute("owner-a", { action: "find_entries" });
  const next = await ledger.execute("owner-a", {
    action: "find_entries",
    cursor: first.nextCursor,
  });
  assert.equal(first.entries.length, 5);
  assert.equal(next.entries.length, 2);
  assert.equal(new Set([...first.entries, ...next.entries].map((e) => e.id)).size, 7);
  const filtered = await ledger.execute("owner-a", {
    action: "find_entries",
    customerId: "customer-a",
    amountPaise: 5,
  });
  assert.equal(filtered.entries.length, 1);
  assert.equal((await ledger.execute("owner-b", { action: "find_entries" })).entries.length, 0);
});
test("customer creation is idempotent, audited and reminders are not opted in", async () => {
  const a = await ledger.createCustomer(
    "owner-a",
    { name: "Sunita", displayLabel: "Near school" },
    "customer-key-01",
  );
  const b = await ledger.createCustomer(
    "owner-a",
    { name: "Sunita", displayLabel: "Near school" },
    "customer-key-01",
  );
  assert.equal(a.customerId, b.customerId);
  const customer = await db.doc(`shops/shop-a/customers/${a.customerId}`).get();
  assert.equal(customer.get("balancePaise"), 0);
  const preferences = await db.doc(`shops/shop-a/reminderPreferences/${a.customerId}`).get();
  assert.equal(preferences.get("status"), "unknown");
  assert.equal(preferences.get("optedInAt"), null);
});

test("rules: new read-only shop collections are owner-scoped; server-only collections are denied", async () => {
  const client = env.authenticatedContext("owner-a").firestore();
  for (const name of ["entryRevisions", "reminderJobs", "reminderLogs", "paymentLinks", "pendingClarifications"]) {
    await assertSucceeds(getDocs(collection(client, `shops/shop-a/${name}`)));
    await assertFails(getDocs(collection(client, `shops/shop-b/${name}`)));
    await assertFails(setDoc(doc(client, `shops/shop-a/${name}/x`), { shopId: "shop-a" }));
  }
  for (const path of ["shops/shop-a/operations/x", "shops/shop-a/confirmations/x", "shops/shop-a/whatsappMessages/x", "jobs/x", "webhookEvents/x", "ownerPhones/+919800000001", "inboundMessages/x", "outboundMessages/x"]) {
    await assertFails(getDoc(doc(client, path)));
  }
});
