import type { Proposal } from "../agent/schema.js";
import { decide, type Decision } from "../agent/decide.js";
import type { EvonParser } from "../agent/gemini.js";
import type { MatchCustomer } from "../matching.js";

// Fixed evaluation shop. Two "Ramesh" on purpose; "Pappu" is an alias of Rakesh.
export const EVAL_CUSTOMERS: MatchCustomer[] = [
  { id: "r1", name: "Ramesh", displayLabel: "Doodh wala", aliases: [] },
  { id: "r2", name: "Ramesh", displayLabel: "School road", aliases: [] },
  { id: "s1", name: "Sunita", displayLabel: "", aliases: ["Sunita didi"] },
  { id: "m1", name: "Mahesh", displayLabel: "", aliases: [] },
  { id: "g1", name: "Ganesh", displayLabel: "", aliases: [] },
  { id: "b1", name: "Bhavesh", displayLabel: "", aliases: [] },
  { id: "p1", name: "Rakesh", displayLabel: "", aliases: ["Pappu"] },
  { id: "n1", name: "Meena", displayLabel: "", aliases: [] },
];
export const EVAL_TODAY = "2026-11-10";

/** What the app finally does, after server validation. This is what the owner experiences. */
export function outcome(d: Decision): string {
  switch (d.kind) {
    case "ledger":
      return d.state.action === "get_balance"
        ? `balance:${d.state.customerId}`
        : `${d.state.action}:${d.state.customerId}:${d.state.amountPaise}`;
    case "ask":
      return `ask:${d.missing}`;
    case "find":
      return `find:${d.filters.purpose}:${d.filters.customerId}`;
    case "undo_last":
      return "undo_last";
    case "undo_option":
      return `undo_option:${d.option}`;
    case "reject":
      return `reject:${d.reason}`;
  }
}

const P = (over: Partial<Proposal>): Proposal => ({
  action: "add_credit", customer_candidate_id: null, amount_paise: null, items: null,
  evidence: { customer_phrase: null, amount_phrase: null }, find: { purpose: null, date_from: null, date_to: null },
  entry_option: null, missing: null, intent: null, language: "hinglish", ...over,
});

export type EvalCase = { id: number; label: string; transcript: string; language: string; expected: string; ideal: Proposal };

export const EVAL_CASES: EvalCase[] = [
  { id: 1, label: "credit, quantities + amount", transcript: "Sunita didi ne teen packet Parle-G aur ek litre doodh liya, 85 rupaye, udhaar", language: "hinglish",
    expected: "add_credit:s1:8500",
    ideal: P({ customer_candidate_id: "s1", amount_paise: 8500, items: "3 packet Parle-G, 1 litre doodh", evidence: { customer_phrase: "Sunita didi", amount_phrase: "85 rupaye" } }) },
  { id: 2, label: "payment, two Rameshes → ask", transcript: "Ramesh ne paanch sau de diye", language: "hinglish",
    expected: "ask:customer",
    ideal: P({ action: "ask_clarification", missing: "customer", intent: "add_payment", amount_paise: 50000, evidence: { customer_phrase: "Ramesh", amount_phrase: "paanch sau" } }) },
  { id: 3, label: "undo yesterday's entry", transcript: "Kal wala Mahesh ka entry galat tha, hata do", language: "hinglish",
    expected: "find:undo:m1",
    ideal: P({ action: "find_entries", customer_candidate_id: "m1", evidence: { customer_phrase: "Mahesh", amount_phrase: null }, find: { purpose: "undo", date_from: "2026-11-09", date_to: "2026-11-09" } }) },
  { id: 4, label: "Marathi credit", transcript: "Ganesh ne don kilo saakhar ghetli, ekshe vees rupaye baaki", language: "mr",
    expected: "add_credit:g1:12000",
    ideal: P({ customer_candidate_id: "g1", amount_paise: 12000, items: "2 kg saakhar", language: "mr", evidence: { customer_phrase: "Ganesh", amount_phrase: "ekshe vees rupaye" } }) },
  { id: 5, label: "Gujarati payment", transcript: "Bhavesh e basso rupiya aapya", language: "gu",
    expected: "add_payment:b1:20000",
    ideal: P({ action: "add_payment", customer_candidate_id: "b1", amount_paise: 20000, language: "gu", evidence: { customer_phrase: "Bhavesh", amount_phrase: "basso rupiya" } }) },
  { id: 6, label: "missing amount → ask", transcript: "Meena ne do kilo aata liya udhaar mein", language: "hinglish",
    expected: "ask:amount",
    ideal: P({ action: "ask_clarification", missing: "amount", intent: "add_credit", customer_candidate_id: "n1", items: "2 kg aata", evidence: { customer_phrase: "Meena", amount_phrase: null } }) },
  { id: 7, label: "alias + dedh sau", transcript: "Pappu ko dedh sau ka udhaar likh do", language: "hinglish",
    expected: "add_credit:p1:15000",
    ideal: P({ customer_candidate_id: "p1", amount_paise: 15000, evidence: { customer_phrase: "Pappu", amount_phrase: "dedh sau" } }) },
  { id: 8, label: "balance query", transcript: "Mahesh ka hisaab batao", language: "hinglish",
    expected: "balance:m1",
    ideal: P({ action: "get_balance", customer_candidate_id: "m1", evidence: { customer_phrase: "Mahesh", amount_phrase: null } }) },
  { id: 9, label: "two items + total + landmark", transcript: "Ramesh doodh wale ne do kilo chawal aur ek Surf liya, total 340", language: "hinglish",
    expected: "add_credit:r1:34000",
    ideal: P({ customer_candidate_id: "r1", amount_paise: 34000, items: "2 kg chawal, 1 Surf", evidence: { customer_phrase: "Ramesh doodh wale", amount_phrase: "340" } }) },
  { id: 10, label: "dhai hazaar payment", transcript: "Sunita ne dhai hazaar diye", language: "hinglish",
    expected: "add_payment:s1:250000",
    ideal: P({ action: "add_payment", customer_candidate_id: "s1", amount_paise: 250000, evidence: { customer_phrase: "Sunita", amount_phrase: "dhai hazaar" } }) },
  { id: 11, label: "galat → undo last", transcript: "galat", language: "hinglish",
    expected: "undo_last",
    ideal: P({ action: "undo_last" }) },
  { id: 12, label: "new customer → ask", transcript: "Kishore ko 200 ka udhaar likh do", language: "hinglish",
    expected: "ask:customer",
    ideal: P({ action: "ask_clarification", missing: "customer", intent: "add_credit", amount_paise: 20000, evidence: { customer_phrase: "Kishore", amount_phrase: "200" } }) },
  { id: 13, label: "garbled note → refuse", transcript: "haan haan woh kya bola tha theek hai bhai", language: "hinglish",
    expected: "reject:unsupported",
    ideal: P({ action: "ask_clarification" }) },
  { id: 14, label: "sava sau payment", transcript: "Mahesh ne sava sau rupaye diye", language: "hinglish",
    expected: "add_payment:m1:12500",
    ideal: P({ action: "add_payment", customer_candidate_id: "m1", amount_paise: 12500, evidence: { customer_phrase: "Mahesh", amount_phrase: "sava sau rupaye" } }) },
  { id: 15, label: "two customers → refuse", transcript: "Ramesh ko 300 aur Sunita ko 200 likh do", language: "hinglish",
    expected: "reject:multiple",
    ideal: P({ action: "ask_clarification", evidence: { customer_phrase: null, amount_phrase: null } }) },
  { id: 16, label: "packets of Maggi + amount", transcript: "Meena ke liye 5 packet Maggi, 70 rupaye udhaar", language: "hinglish",
    expected: "add_credit:n1:7000",
    ideal: P({ customer_candidate_id: "n1", amount_paise: 7000, items: "5 packet Maggi", evidence: { customer_phrase: "Meena", amount_phrase: "70 rupaye" } }) },
];

export type EvalResult = { id: number; label: string; transcript: string; expected: string; got: string; pass: boolean; error?: string };

/** Runs the live parser on each case and validates the result exactly as production does. */
export async function runParserEval(parser: EvonParser, cases: EvalCase[] = EVAL_CASES, gapMs = 0): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const c of cases) {
    try {
      const proposal = await parser.propose({
        transcript: c.transcript,
        candidates: EVAL_CUSTOMERS.map((x) => ({ id: x.id, name: x.name, label: x.displayLabel ?? "", aliases: x.aliases ?? [] })),
        pendingQuestion: null,
        pendingOptions: [],
        todayIst: EVAL_TODAY,
        shopLanguage: c.language,
      });
      const got = outcome(decide(proposal, c.transcript, EVAL_CUSTOMERS));
      results.push({ id: c.id, label: c.label, transcript: c.transcript, expected: c.expected, got, pass: got === c.expected });
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : "";
      results.push({ id: c.id, label: c.label, transcript: c.transcript, expected: c.expected, got: "error", pass: false, error: `${name}: ${message}`.slice(0, 200) });
    }
    if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
  }
  return results;
}
