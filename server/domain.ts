import { z } from "zod";

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function ensure(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new ServiceError(status, code, message);
}

export const documentId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const reason = z.string().trim().min(3).max(500);
const common = {
  customerId: documentId,
  amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  notes: z.string().trim().max(1000).default(""),
  confirmLargeAmount: z.boolean().default(false),
};
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_credit"), ...common }).strict(),
  z
    .object({
      action: z.literal("add_payment"),
      ...common,
      confirmAdvance: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal("get_balance"), customerId: documentId }).strict(),
  z
    .object({
      action: z.literal("find_entries"),
      customerId: documentId.optional(),
      amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      cursor: documentId.optional(),
    })
    .strict(),
  z.object({ action: z.literal("undo_entry"), entryId: documentId, reason }).strict(),
  z.object({ action: z.literal("undo_last"), reason }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export type WriteAction = Exclude<Action, { action: "get_balance" | "find_entries" }>;
export type LedgerEntry = {
  id: string;
  customerId: string;
  type: "credit" | "payment" | "reversal";
  signedAmountPaise: number;
  createdBy: string;
  createdAt: { toMillis(): number };
  reversesEntryId?: string;
};

export function checkedBalance(balance: number, delta: number) {
  ensure(
    Number.isSafeInteger(balance) && Number.isSafeInteger(delta),
    409,
    "INVALID_MONEY",
    "Invalid stored integer amount.",
  );
  const next = balance + delta;
  ensure(
    Number.isSafeInteger(next),
    409,
    "BALANCE_OVERFLOW",
    "Balance exceeds the safe integer limit.",
  );
  return next;
}

export function validateAmount(
  action: Extract<Action, { action: "add_credit" | "add_payment" }>,
  balance: number,
) {
  ensure(
    action.amountPaise <= 10_000_000 || action.confirmLargeAmount,
    409,
    "CONFIRM_LARGE_AMOUNT",
    "Amounts above ₹1,00,000 require explicit confirmation.",
  );
  ensure(
    action.action !== "add_payment" || action.amountPaise <= balance || action.confirmAdvance,
    409,
    "CONFIRM_ADVANCE",
    "Payment exceeds the outstanding balance. Explicitly confirm an advance.",
  );
  return checkedBalance(
    balance,
    action.action === "add_credit" ? action.amountPaise : -action.amountPaise,
  );
}

export function selectUndo(entries: LedgerEntry[], reversedIds: Set<string>, now: number) {
  const candidates = entries.filter(
    (e) =>
      e.type !== "reversal" &&
      !reversedIds.has(e.id) &&
      now - e.createdAt.toMillis() >= 0 &&
      now - e.createdAt.toMillis() <= 600_000,
  );
  ensure(
    candidates.length > 0,
    409,
    "NO_RECENT_ENTRY",
    "No undoable entry in the last 10 minutes. Search the ledger instead.",
  );
  ensure(
    candidates.length === 1,
    409,
    "CHOOSE_ENTRY",
    "Several recent entries exist. Choose an exact entry in the ledger.",
  );
  return candidates[0];
}

export function parseRupees(text: string) {
  ensure(
    /^\d{1,10}(\.\d{1,2})?$/.test(text),
    400,
    "INVALID_AMOUNT",
    "Enter a positive amount with at most two decimal places.",
  );
  const [rupees, fraction = ""] = text.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  ensure(
    Number.isSafeInteger(paise) && paise > 0,
    400,
    "INVALID_AMOUNT",
    "Amount must be positive integer paise.",
  );
  return paise;
}
