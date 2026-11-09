import { extractAmounts, parseAmountPhrase } from "../money-words.js";
import { normalizeName, phraseInTranscript, resolveCustomer, type MatchCustomer } from "../matching.js";
import type { Proposal } from "./schema.js";

export type OpState = {
  action: "add_credit" | "add_payment" | "get_balance";
  customerId: string | null;
  customerOptions: string[];
  amountPaise: number | null;
  notes: string;
  confirmAdvance: boolean;
  confirmLargeAmount: boolean;
  /** A spoken name that matches nobody in the khata. Only ever saved after the owner says yes. */
  newCustomerName?: string | null;
};
export type FindFilters = {
  customerId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  amountPaise: number | null;
  purpose: "undo" | "view";
};
export type Decision =
  | { kind: "ledger"; state: OpState }
  | { kind: "ask"; missing: "customer" | "amount"; state: OpState }
  | { kind: "undo_last" }
  | { kind: "undo_option"; option: number }
  | { kind: "find"; filters: FindFilters }
  | { kind: "reject"; reason: "multiple" | "unsupported" };

/** Single source of "what is still missing" for both first pass and clarification replies. */
export function nextStep(state: OpState): Decision {
  if (!state.customerId) return { kind: "ask", missing: "customer", state };
  if (state.action !== "get_balance" && !state.amountPaise) return { kind: "ask", missing: "amount", state };
  return { kind: "ledger", state };
}

function istDayBoundary(date: string | null, end: boolean) {
  if (!date) return null;
  const parsed = new Date(`${date}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Hindi/Marathi/Gujarati case markers and honorifics that trail a spoken name ("Ramesh ko", "Sunita ji ne").
const NAME_TAIL = new Set(["ko", "ne", "ka", "ki", "ke", "se", "ji", "la", "na", "ne", "nu", "ni", "no", "che", "chi", "cha", "को", "ने", "का", "की", "के", "से", "जी"]);

/** Turns the quoted customer phrase into a clean display name, or null if it doesn't look like a name. */
export function spokenName(phrase: string | null): string | null {
  if (!phrase || /\d/.test(phrase)) return null;
  const words = phrase.replace(/[^\p{L}\p{M}\s.'-]/gu, " ").split(/\s+/).filter(Boolean);
  while (words.length && NAME_TAIL.has(words[words.length - 1].toLowerCase())) words.pop();
  if (!words.length || words.length > 3) return null;
  const name = words.map((w) => (/^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
  return name.length >= 2 && name.length <= 40 ? name : null;
}

function resolveFor(p: Proposal, transcript: string, customers: MatchCustomer[]) {
  // Evidence must genuinely occur in the transcript; otherwise it is ignored.
  const phrase = p.evidence.customer_phrase && phraseInTranscript(p.evidence.customer_phrase, transcript)
    ? p.evidence.customer_phrase : null;
  const resolution = resolveCustomer(phrase, customers);
  const known = new Set(customers.map((c) => c.id));
  const modelPick = p.customer_candidate_id && known.has(p.customer_candidate_id) ? p.customer_candidate_id : null;
  if (resolution.kind === "unique") {
    // The model's choice must agree with the server's independent match.
    if (modelPick && modelPick !== resolution.id) {
      return { customerId: null, options: [resolution.id, modelPick], newName: null };
    }
    return { customerId: resolution.id, options: [] as string[], newName: null };
  }
  // Nobody plausibly matches: this may be a new customer. Offered to the owner, never created silently.
  const newName = resolution.kind === "none" ? spokenName(phrase) : null;
  return { customerId: null, options: resolution.options, newName };
}

/** How many distinct customer names (or aliases) appear as whole words in the transcript. */
function namedCustomers(transcript: string, customers: MatchCustomer[]) {
  const words = new Set(normalizeName(transcript).split(" "));
  const names = new Set<string>();
  for (const c of customers) {
    for (const n of [c.name, ...(c.aliases ?? [])]) {
      const parts = normalizeName(n).split(" ").filter(Boolean);
      if (parts.length && parts.every((w) => words.has(w))) names.add(normalizeName(c.name));
    }
  }
  return names.size;
}

export function decide(p: Proposal, transcript: string, customers: MatchCustomer[]): Decision {
  const spokenAmounts = extractAmounts(transcript);
  switch (p.action) {
    case "undo_last":
      return { kind: "undo_last" };
    case "undo_entry":
      return p.entry_option ? { kind: "undo_option", option: p.entry_option } : { kind: "find", filters: findFilters(p, transcript, customers, "undo") };
    case "find_entries":
      return { kind: "find", filters: findFilters(p, transcript, customers, p.find.purpose ?? "view") };
    case "get_balance": {
      const { customerId, options } = resolveFor(p, transcript, customers);
      return nextStep({ action: "get_balance", customerId, customerOptions: options, amountPaise: null, notes: "", confirmAdvance: false, confirmLargeAmount: false });
    }
    case "add_credit":
    case "add_payment":
    case "ask_clarification": {
      // Two amounts for two different known customers is two entries in one message: refuse, whatever the model says.
      if (spokenAmounts.length > 1 && namedCustomers(transcript, customers) > 1) return { kind: "reject", reason: "multiple" };
      if (p.action === "ask_clarification" && p.missing !== "amount" && p.missing !== "customer") {
        return { kind: "reject", reason: spokenAmounts.length > 1 ? "multiple" : "unsupported" };
      }
      const { customerId, options, newName } = resolveFor(p, transcript, customers);
      let amountPaise: number | null = null;
      const phrase = p.evidence.amount_phrase;
      if (phrase && phraseInTranscript(phrase, transcript)) {
        const parsed = parseAmountPhrase(phrase);
        // Model amount, quoted phrase and the transcript-wide parse must all agree.
        // With several unmarked numbers ("2 Fortune tel 360") nothing is accepted: the owner is asked.
        if (parsed !== null && parsed === p.amount_paise && spokenAmounts.length === 1 && spokenAmounts[0] === parsed) amountPaise = parsed;
      }
      const action = p.action === "ask_clarification" ? p.intent : p.action;
      if (!action) return { kind: "reject", reason: "unsupported" };
      if (action === "get_balance") {
        return nextStep({ action, customerId, customerOptions: options, amountPaise: null, notes: "", confirmAdvance: false, confirmLargeAmount: false });
      }
      return nextStep({
        action, customerId, customerOptions: options, amountPaise,
        notes: (p.items ?? "").slice(0, 300), confirmAdvance: false, confirmLargeAmount: false,
        newCustomerName: customerId ? null : newName,
      });
    }
  }
}

function findFilters(p: Proposal, transcript: string, customers: MatchCustomer[], purpose: "undo" | "view"): FindFilters {
  const { customerId } = resolveFor(p, transcript, customers);
  const phrase = p.evidence.amount_phrase;
  const amount = phrase && phraseInTranscript(phrase, transcript) ? parseAmountPhrase(phrase) : null;
  return {
    customerId,
    dateFrom: istDayBoundary(p.find.date_from, false),
    dateTo: istDayBoundary(p.find.date_to, true),
    amountPaise: amount,
    purpose,
  };
}
