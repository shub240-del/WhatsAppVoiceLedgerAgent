import type { Firestore } from "firebase-admin/firestore";

/** Ledger SUM is authoritative; the cached customer balance must equal it exactly. */
export async function verifyShopBalances(db: Firestore, shopId: string) {
  const shop = db.doc(`shops/${shopId}`);
  const [customers, entries] = await Promise.all([shop.collection("customers").get(), shop.collection("ledgerEntries").get()]);
  const sums = new Map<string, number>();
  for (const e of entries.docs) {
    const amount = e.get("signedAmountPaise");
    if (!Number.isSafeInteger(amount)) throw new Error(`Non-integer amount in entry ${e.id}`);
    sums.set(e.get("customerId"), (sums.get(e.get("customerId")) ?? 0) + amount);
  }
  const mismatches = customers.docs
    .map((c) => ({ customerId: c.id, cachedPaise: c.get("balancePaise") ?? 0, ledgerPaise: sums.get(c.id) ?? 0 }))
    .filter((m) => m.cachedPaise !== m.ledgerPaise);
  return { checked: customers.size, entries: entries.size, mismatches };
}
