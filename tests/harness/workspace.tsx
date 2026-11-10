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
const nativeFetch = window.fetch.bind(window);
Object.defineProperty(auth, "currentUser", { get: () => ({ getIdToken: async () => "test-token" }) });
// A short tone as fake "speech" for the voice studio (1.2 s, 24 kHz mono WAV).
function toneWav(seconds = 1.2, rate = 24000) {
  const n = Math.round(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((i / rate) * 2 * Math.PI * 220) * 8000, true);
  return buf;
}
window.fetch = (async (url: string, init: RequestInit) => {
  const href = String(url);
  // Only same-origin API calls are faked; real assets (video, fonts) load normally.
  if (!href.includes("/api/")) return nativeFetch(url, init);
  const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
  window.__requests.push({ url: href, body: href.includes("voice-studio/voice") ? { ...body, audioBase64: `${body.audioBase64.length} chars` } : body });
  if (href.endsWith("/api/voice-studio/voice"))
    return new Response(JSON.stringify({ voice: { embedding: "QUJDREVGR0hJSktMTU5PUA==", shape: [1, 768], dtype: "torch.bfloat16" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (href.endsWith("/api/voice-studio/speak")) return new Response(toneWav(), { status: 200, headers: { "Content-Type": "audio/wav" } });
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
