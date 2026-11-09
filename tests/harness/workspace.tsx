// Test-only page: renders the real workspace with a fake signed-in shop (no Firebase calls).
import ReactDOM from "react-dom/client";
import "../../src/index.css";
import "../../src/a11y.css";
import Dashboard from "../../src/Dashboard";
import type { Customer, Entry, useWorkspace } from "../../src/lib/useWorkspace";

const at = (min: number) => ({ toDate: () => new Date(Date.UTC(2026, 10, 9, 6, 0) - min * 60_000) });
const empty = new URLSearchParams(location.search).has("empty");
const customers: Customer[] = empty
  ? []
  : [
      { id: "c1", name: "Ramesh", displayLabel: "Near the temple", phone: "+919876543210", balancePaise: 124000 },
      { id: "c2", name: "Sunita", displayLabel: "", balancePaise: 45000 },
      { id: "c3", name: "Imran", displayLabel: "Gali no. 3", balancePaise: -20000 },
      { id: "c4", name: "Priya", displayLabel: "", balancePaise: 0 },
    ];
const entries: Entry[] = empty
  ? []
  : [
      { id: "e1", customerId: "c1", type: "credit", signedAmountPaise: 34000, notes: "Maggi, doodh", createdBy: "u", source: "assistant", createdAt: at(5) },
      { id: "e2", customerId: "c2", type: "payment", signedAmountPaise: -20000, createdBy: "u", source: "assistant", createdAt: at(40) },
      { id: "e3", customerId: "c3", type: "payment", signedAmountPaise: -50000, createdBy: "u", source: "manual", createdAt: at(300) },
      { id: "e4", customerId: "c1", type: "credit", signedAmountPaise: 90000, notes: "Atta 10kg", createdBy: "u", source: "manual", createdAt: at(1500) },
    ];
const data = {
  user: { uid: "u1", email: "owner@example.com" },
  authReady: true,
  shop: { id: "s1", name: "Sharma Kirana", language: "hinglish" },
  customers,
  entries,
  reversals: new Set<string>(["e3"]),
  totals: { balance: customers.reduce((n, c) => n + c.balancePaise, 0), customers: customers.length, entries: entries.length },
  error: "",
  needsShop: false,
  loading: false,
  hasMoreCustomers: false,
  hasMoreEntries: false,
  refresh: () => {},
  loadCustomers: () => {},
  loadEntries: () => {},
};
const fake = (() => data) as unknown as typeof useWorkspace;

ReactDOM.createRoot(document.getElementById("root")!).render(<Dashboard useData={fake} />);
