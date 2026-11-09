/**
 * The WhatsApp demo's bot. Runs entirely in the browser with a pretend khata, so visitors can
 * type or speak real sentences. Reply wording mirrors server/agent/messages.ts exactly.
 * Nothing here touches the server or anyone's real data.
 */
export type DemoCustomer = { name: string; paise: number };
export type DemoEntry = { id: number; name: string; paise: number; reversed: boolean };
type Pending =
  | { kind: "new"; name: string; paise: number; notes: string }
  | { kind: "advance"; name: string; paise: number };
export type DemoState = {
  customers: DemoCustomer[];
  entries: DemoEntry[];
  pending: Pending | null;
  nextId: number;
};
export type DemoEvent = "credit" | "payment" | "new_customer" | "undo" | "balance" | null;
export type DemoTurn = { state: DemoState; reply: string; event: DemoEvent; options: string[]; changed: string | null };

export const HINT = "Galat ho to 'GALAT' likhein (10 minute ke andar).";
const rupees = (paise: number) => `₹${(Math.abs(paise) / 100).toLocaleString("en-IN")}`;

export function demoStart(): DemoState {
  return {
    customers: [
      { name: "Ramesh", paise: 90000 },
      { name: "Sunita", paise: 65000 },
      { name: "Priya", paise: 12000 },
    ],
    entries: [
      { id: 1, name: "Ramesh", paise: 90000, reversed: false },
      { id: 2, name: "Sunita", paise: 65000, reversed: false },
      { id: 3, name: "Priya", paise: 12000, reversed: false },
    ],
    pending: null,
    nextId: 4,
  };
}

export const DEMO_HELP =
  "Namaste! Main aapka Udhaar khata hoon. Aise bolein ya likhein:\n- 'Ramesh ko 340 ka udhaar likh do'\n- 'Sunita ne 200 diye'\n- 'Ramesh ka kitna baaki hai'\nGalti ho to 'GALAT' likhein (10 minute ke andar).";

const YES = /^(1|haan|han|ha|yes|ji|haan ji|theek|ok|okay|sahi)$/;
const NO = /^(2|nahi|na|no|nahi rehne do|rehne do|cancel)$/;
const UNDO = /^(galat|galti|undo|wrong|hata do|hatao|galat hai|galat entry)$/;
const AMOUNT = String.raw`(?:₹\s*)?(\d[\d,]*)\s*(?:rupaye|rupay|rupees|rs\.?|₹)?`;
const CREDIT = new RegExp(String.raw`^([\p{L}]+(?:\s+[\p{L}]+)?)\s+(?:ko|ka|ke|ki)\s+${AMOUNT}\s*(?:ka|ki|ke)?\s*(?:udhaar|udhar|credit)\b(.*)$`, "u");
const PAYMENT = new RegExp(String.raw`^([\p{L}]+(?:\s+[\p{L}]+)?)\s+(?:ne|se)\s+${AMOUNT}\s*(?:diye|diya|de diye|de gaye|mile|mila|jama|wapas|chukaye)\b`, "u");
const BALANCE = /^([\p{L}]+(?:\s+[\p{L}]+)?)\s+(?:ka|ki|ke)\s+(?:kitna|kitne|kitni)?\s*(?:baaki|baki|udhaar|udhar|hisaab|hisab)\b/u;
const COUNTS = /^(ek|do|teen|char|chaar|paanch|panch|aadha|\d+(?:\.\d+)?\s*(?:kg|g|l|litre|packet|pkt)?)\s+/i;

const clean = (s: string) => s.toLowerCase().replace(/[.!?।]+$/u, "").replace(/\s+/g, " ").trim();
const title = (s: string) => s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));
const toPaise = (digits: string) => Math.round(Number(digits.replace(/,/g, "")) * 100);

/** "do Maggi aur doodh likh do" -> "Maggi, doodh" (items are notes only, never amounts). */
function itemsFrom(tail: string) {
  const text = tail
    .replace(/^[\s,–-]+/, "")
    .replace(/\b(likh do|likh dena|likho|likh lo|kar do|daal do)\b/g, "")
    .trim();
  if (!text) return "";
  return text
    .split(/\s*(?:,|\baur\b|&)\s*/)
    .map((i) => i.trim().replace(COUNTS, ""))
    .filter(Boolean)
    .join(", ");
}

function find(state: DemoState, name: string) {
  return state.customers.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
}
function withBalance(state: DemoState, name: string, delta: number): DemoState {
  const exists = find(state, name);
  const customers = exists
    ? state.customers.map((c) => (c === exists ? { ...c, paise: c.paise + delta } : c))
    : [...state.customers, { name, paise: delta }];
  return {
    ...state,
    customers,
    entries: [{ id: state.nextId, name: exists?.name ?? name, paise: delta, reversed: false }, ...state.entries],
    nextId: state.nextId + 1,
    pending: null,
  };
}
const turn = (state: DemoState, reply: string, event: DemoEvent = null, changed: string | null = null, options: string[] = []): DemoTurn => ({
  state,
  reply,
  event,
  options,
  changed,
});

export function demoReply(state: DemoState, input: string): DemoTurn {
  const text = clean(input);
  if (!text) return turn(state, "Kripya voice note ya text bhejein.");

  // Answers to an open question.
  if (state.pending) {
    const p = state.pending;
    if (YES.test(text)) {
      if (p.kind === "new") {
        const next = withBalance({ ...state, pending: null }, p.name, p.paise);
        const bal = find(next, p.name)!.paise;
        const items = p.notes ? ` (${p.notes})` : "";
        return turn(next, `${p.name} naye customer jud gaye. ${p.name}: +${rupees(p.paise)}${items}. Total baaki: ${rupees(bal)}. ${HINT}`, "new_customer", p.name);
      }
      const next = withBalance({ ...state, pending: null }, p.name, -p.paise);
      const bal = find(next, p.name)!.paise;
      return turn(next, `${p.name}: ${rupees(p.paise)} mile. Total baaki: ${bal < 0 ? "−" : ""}${rupees(bal)}. ${HINT}`, "payment", p.name);
    }
    if (NO.test(text)) return turn({ ...state, pending: null }, "Theek hai, kuch save nahi kiya.");
  }

  if (/^(madad|help|menu|hi|hello|namaste|start)$/.test(text)) return turn(state, DEMO_HELP);

  if (UNDO.test(text)) {
    const last = state.entries.find((e) => e.id > 3 && !e.reversed);
    if (!last) return turn(state, "Aisi koi entry nahi mili. Kuch nahi badla.");
    const customers = state.customers.map((c) => (c.name === last.name ? { ...c, paise: c.paise - last.paise } : c));
    const entries = state.entries.map((e) => (e === last ? { ...e, reversed: true } : e));
    const bal = customers.find((c) => c.name === last.name)!.paise;
    return turn(
      { ...state, customers, entries, pending: null },
      `${rupees(last.paise)} ka entry hata diya (reversal darj hua). ${last.name} ji ka baaki ab ${bal < 0 ? "−" : ""}${rupees(bal)} hai.`,
      "undo",
      last.name,
    );
  }

  let m = text.match(CREDIT);
  if (m) {
    const name = title(m[1]);
    const paise = toPaise(m[2]);
    // Items keep the owner's own spelling ("Maggi", "doodh"); the match itself ran on lowercase.
    const original = input.replace(/[.!?।]+$/u, "").replace(/\s+/g, " ").trim();
    const notes = itemsFrom(m[3] ? original.slice(original.length - m[3].length) : "");
    if (!paise) return turn(state, "Kitne rupaye likhne hain?");
    const known = find(state, name);
    if (!known) {
      return turn(
        { ...state, pending: { kind: "new", name, paise, notes } },
        `“${name}” naam ka koi customer nahi hai. Naya customer “${name}” banakar ${rupees(paise)} udhaar likhun?\n1) Haan\n2) Nahi`,
        null,
        null,
        ["1", "2"],
      );
    }
    const next = withBalance(state, known.name, paise);
    const bal = find(next, known.name)!.paise;
    return turn(next, `${known.name}: +${rupees(paise)}${notes ? ` (${notes})` : ""}. Total baaki: ${rupees(bal)}. ${HINT}`, "credit", known.name);
  }

  m = text.match(PAYMENT);
  if (m) {
    const name = title(m[1]);
    const paise = toPaise(m[2]);
    const known = find(state, name);
    if (!known) return turn(state, "Kaun sa customer? Naam saaf bolein, jaise 'Ramesh ko 340 ka udhaar'.");
    if (paise > known.paise) {
      return turn(
        { ...state, pending: { kind: "advance", name: known.name, paise } },
        `${rupees(paise)} baaki (${rupees(known.paise)}) se zyada hai. Advance maanein?\n1) Haan\n2) Nahi`,
        null,
        null,
        ["1", "2"],
      );
    }
    const next = withBalance(state, known.name, -paise);
    const bal = find(next, known.name)!.paise;
    return turn(next, `${known.name}: ${rupees(paise)} mile. Total baaki: ${rupees(bal)}. ${HINT}`, "payment", known.name);
  }

  m = text.match(BALANCE);
  if (m) {
    const known = find(state, title(m[1]));
    if (!known) return turn(state, "Kaun sa customer? Naam saaf bolein, jaise 'Ramesh ka kitna baaki hai'.");
    const lines = state.entries
      .filter((e) => e.name === known.name)
      .slice(0, 5)
      .map((e, i) => `${i + 1}) ${e.paise > 0 ? "Udhaar" : "Payment"} ${rupees(e.paise)}${e.reversed ? " (hata diya)" : ""}`);
    return turn(
      state,
      `${known.name} ji ka baaki ${known.paise < 0 ? "−" : ""}${rupees(known.paise)} hai.${lines.length ? `\nPichli entries:\n${lines.join("\n")}` : ""}`,
      "balance",
      known.name,
    );
  }

  return turn(state, "Samajh nahi aaya, kuch save nahi hua. Aise bolein: 'Ramesh ko 500 ka udhaar likh do'.");
}
