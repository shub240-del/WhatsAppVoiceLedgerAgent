import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getAggregateFromServer,
  sum,
  count,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export type Customer = {
  id: string;
  name: string;
  displayLabel: string;
  phone?: string;
  balancePaise: number;
};
export type Entry = {
  id: string;
  customerId: string;
  type: "credit" | "payment" | "reversal";
  signedAmountPaise: number;
  notes?: string;
  reason?: string;
  reversesEntryId?: string;
  revisesEntryId?: string;
  sourceMessageId?: string | null;
  createdBy: string;
  source: string;
  createdAt?: { toDate(): Date };
};
export type Shop = { id: string; name: string; language: string };
export function useWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reversals, setReversals] = useState<Set<string>>(new Set());
  const [totals, setTotals] = useState({ balance: 0, customers: 0, entries: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [customerPage, setCustomerPage] = useState(50);
  const [entryPage, setEntryPage] = useState(50);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const [hasMoreEntries, setHasMoreEntries] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
      }),
    [],
  );
  useEffect(() => {
    let active = true;
    setLoadedFor(null);
    setShop(null);
    setCustomers([]);
    setEntries([]);
    setError("");
    setReversals(new Set());
    setTotals({ balance: 0, customers: 0, entries: 0 });
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    async function load() {
      try {
        const membership = await getDoc(doc(db, "owners", user!.uid));
        if (
          !membership.exists() ||
          membership.get("active") !== true ||
          membership.get("role") !== "owner"
        ) {
          throw new Error(
            "Your login is valid, but owner membership is not provisioned. Ask your administrator to link this account to a shop.",
          );
        }
        const shopId = membership.get("shopId") as string;
        const shopSnapshot = await getDoc(doc(db, "shops", shopId));
        if (!shopSnapshot.exists() || shopSnapshot.get("active") !== true)
          throw new Error("Your shop is inactive or unavailable.");
        const customerRef = collection(db, "shops", shopId, "customers");
        const entryRef = collection(db, "shops", shopId, "ledgerEntries");
        const [customerDocs, entryDocs, customerStats, entryStats] =
          await Promise.all([
            getDocs(query(customerRef, orderBy("name"), limit(customerPage + 1))),
            getDocs(query(entryRef, orderBy("createdAt", "desc"), limit(entryPage + 1))),
            getAggregateFromServer(customerRef, { customers: count() }),
            getAggregateFromServer(entryRef, { entries: count() }),
          ]);
        // sum() aggregation requires Firestore Blaze plan. Fall back to summing
        // the loaded customer page (may undercount on large shops — accurate for Spark).
        let balance = 0;
        try {
          const balanceStats = await getAggregateFromServer(
            query(customerRef, where("balancePaise", ">", 0)),
            { balance: sum("balancePaise") },
          );
          balance = balanceStats.data().balance ?? 0;
        } catch {
          // Spark plan or quota exceeded: derive from loaded customers.
          balance = customerDocs.docs
            .slice(0, customerPage)
            .reduce((acc, d) => acc + (Number(d.get("balancePaise")) || 0), 0);
        }
        const entryRows = entryDocs.docs
          .slice(0, entryPage)
          .map((d) => ({ ...d.data(), id: d.id }) as Entry);
        const reversed = new Set<string>();
        // Exact reversal lookups also cover originals older than the currently loaded page.
        await Promise.all(
          entryRows
            .filter((e) => e.type !== "reversal")
            .map(async (e) => {
              if ((await getDoc(doc(db, "shops", shopId, "reversals", e.id))).exists())
                reversed.add(e.id);
            }),
        );
        if (!active) return;
        setShop({
          id: shopId,
          name: shopSnapshot.get("name"),
          language: shopSnapshot.get("language"),
        });
        setCustomers(
          customerDocs.docs
            .slice(0, customerPage)
            .map((d) => ({ ...d.data(), id: d.id }) as Customer),
        );
        setEntries(entryRows);
        setReversals(reversed);
        setHasMoreCustomers(customerDocs.size > customerPage);
        setHasMoreEntries(entryDocs.size > entryPage);
        setTotals({ ...customerStats.data(), balance, ...entryStats.data() });
        setLoadedFor(user!.uid);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load the shop.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [user, revision, customerPage, entryPage]);
  const visible = Boolean(user && loadedFor === user.uid);
  return {
    user,
    authReady,
    shop: visible ? shop : null,
    customers: visible ? customers : [],
    entries: visible ? entries : [],
    reversals: visible ? reversals : new Set<string>(),
    totals: visible ? totals : { balance: 0, customers: 0, entries: 0 },
    error,
    loading,
    hasMoreCustomers,
    hasMoreEntries,
    refresh: () => setRevision((r) => r + 1),
    loadCustomers: () => setCustomerPage((n) => n + 50),
    loadEntries: () => setEntryPage((n) => n + 50),
  };
}
