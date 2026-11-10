// Test-only page: renders the real workspace with a fake signed-in shop (no Firebase calls).
import ReactDOM from "react-dom/client";
import "../../src/index.css";
import "../../src/a11y.css";
import Dashboard from "../../src/Dashboard";
import { auth } from "../../src/lib/firebase";
import type { Customer, Entry, useWorkspace } from "../../src/lib/useWorkspace";

const at = (min: number) => ({ toDate: () => new Date(Date.UTC(2026, 10, 9, 6, 0) - min * 60_000) });
const params = new URLSearchParams(location.search);
const guest = params.has("guest");
const empty = params.has("empty") || params.has("new") || guest;
window.__requests = [];
Object.defineProperty(auth, "currentUser", { get: () => ({ getIdToken: async () => "test-token" }) });
window.fetch = (async (url: string, init: RequestInit) => {
  window.__requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(JSON.stringify({ shopId: "s1", created: true }), { status: 201, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
// ?story: the same shop as the WhatsApp demo after its three entries (used for the walkthrough video).
const story = params.has("story");
const customers: Customer[] = empty
  ? []
  : story
    ? [
        { id: "c1", name: "Ramesh", displayLabel: "Near the temple", phone: "+919876543210", balancePaise: 113000 },
        { id: "c2", name: "Sunita", displayLabel: "Gali no. 3", phone: "+919812345678", balancePaise: 45000 },
        { id: "c3", name: "Priya", displayLabel: "", balancePaise: 27000 },
      ]
    : [
      { id: "c1", name: "Ramesh", displayLabel: "Near the temple", phone: "+919876543210", balancePaise: 124000 },
      { id: "c2", name: "Sunita", displayLabel: "", balancePaise: 45000 },
      { id: "c3", name: "Imran", displayLabel: "Gali no. 3", balancePaise: -20000 },
      { id: "c4", name: "Priya", displayLabel: "", balancePaise: 0 },
    ];
const entries: Entry[] = empty
  ? []
  : story
    ? [
        { id: "e1", customerId: "c3", type: "credit", signedAmountPaise: 15000, notes: "doodh, bread", createdBy: "u", source: "assistant", createdAt: at(1) },
        { id: "e2", customerId: "c2", type: "payment", signedAmountPaise: -20000, createdBy: "u", source: "assistant", createdAt: at(2) },
        { id: "e3", customerId: "c1", type: "credit", signedAmountPaise: 23000, notes: "2 kilo chawal, 1 Surf", createdBy: "u", source: "assistant", createdAt: at(4) },
        { id: "e4", customerId: "c1", type: "credit", signedAmountPaise: 90000, notes: "Atta 10kg", createdBy: "u", source: "manual", createdAt: at(1500) },
      ]
    : [
      { id: "e1", customerId: "c1", type: "credit", signedAmountPaise: 34000, notes: "Maggi, doodh", createdBy: "u", source: "assistant", createdAt: at(5) },
      { id: "e2", customerId: "c2", type: "payment", signedAmountPaise: -20000, createdBy: "u", source: "assistant", createdAt: at(40) },
      { id: "e3", customerId: "c3", type: "payment", signedAmountPaise: -50000, createdBy: "u", source: "manual", createdAt: at(300) },
      { id: "e4", customerId: "c1", type: "credit", signedAmountPaise: 90000, notes: "Atta 10kg", createdBy: "u", source: "manual", createdAt: at(1500) },
    ];
const data = {
  user: guest ? null : { uid: "u1", email: "owner@example.com" },
  authReady: true,
  shop: params.has("new") || guest ? null : { id: "s1", name: "Sharma Kirana", language: "hinglish" },
  customers,
  entries,
  reversals: new Set<string>(story ? [] : ["e3"]),
  totals: { balance: customers.reduce((n, c) => n + c.balancePaise, 0), customers: customers.length, entries: entries.length },
  error: "",
  needsShop: params.has("new"),
  loading: false,
  hasMoreCustomers: false,
  hasMoreEntries: false,
  refresh: () => {},
  loadCustomers: () => {},
  loadEntries: () => {},
};
const fake = (() => data) as unknown as typeof useWorkspace;

ReactDOM.createRoot(document.getElementById("root")!).render(<Dashboard useData={fake} />);
