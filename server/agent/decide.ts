import { extractAmounts, parseAmountPhrase } from "../money-words";
import { phraseInTranscript, resolveCustomer, type MatchCustomer } from "../matching";
import type { Proposal } from "./schema";

export type OpState = {
  action: "add_credit" | "add_payment" | "get_balance";
  customerId: string | null;
  customerOptions: string[];
  amountPaise: number | null;
  notes: string;
  confirmAdvance: boolean;
  confirmLargeAmount: boolean;
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
      return { customerId: null, options: [resolution.id, modelPick] };
    }
    return { customerId: resolution.id, options: [] as string[] };
  }
  return { customerId: null, options: resolution.options };
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
      if (spokenAmounts.length > 1) return { kind: "reject", reason: "multiple" };
      if (p.action === "ask_clarification" && p.missing !== "amount" && p.missing !== "customer") {
        return { kind: "reject", reason: "unsupported" };
      }
      const { customerId, options } = resolveFor(p, transcript, customers);
      let amountPaise: number | null = null;
      const phrase = p.evidence.amount_phrase;
      if (phrase && phraseInTranscript(phrase, transcript)) {
        const parsed = parseAmountPhrase(phrase);
        // Model amount, quoted phrase and the transcript-wide parse must all agree.
        if (parsed !== null && parsed === p.amount_paise && spokenAmounts[0] === parsed) amountPaise = parsed;
      }
      const action = p.action === "ask_clarification" ? p.intent : p.action;
      if (!action) return { kind: "reject", reason: "unsupported" };
      if (action === "get_balance") {
        return nextStep({ action, customerId, customerOptions: options, amountPaise: null, notes: "", confirmAdvance: false, confirmLargeAmount: false });
      }
      return nextStep({
        action, customerId, customerOptions: options, amountPaise,
        notes: (p.items ?? "").slice(0, 300), confirmAdvance: false, confirmLargeAmount: false,
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
