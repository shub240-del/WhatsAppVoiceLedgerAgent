import { z } from "zod";

export const AGENT_ACTIONS = [
  "add_credit", "add_payment", "get_balance", "undo_last", "find_entries", "undo_entry", "ask_clarification",
] as const;
export const MISSING = ["amount", "customer", "entry_choice", "confirmation"] as const;

// Exactly one action object. Arrays (multiple actions) and unknown keys fail.
export const proposalSchema = z
  .object({
    action: z.enum(AGENT_ACTIONS),
    customer_candidate_id: z.string().max(128).nullable(),
    amount_paise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    items: z.string().max(300).nullable(),
    evidence: z
      .object({ customer_phrase: z.string().max(120).nullable(), amount_phrase: z.string().max(120).nullable() })
      .strict(),
    find: z
      .object({
        purpose: z.enum(["undo", "view"]).nullable(),
        date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      })
      .strict(),
    entry_option: z.number().int().min(1).max(5).nullable(),
    missing: z.enum(MISSING).nullable(),
    intent: z.enum(["add_credit", "add_payment", "get_balance"]).nullable(),
    language: z.enum(["hi", "en", "hinglish", "mr", "gu"]),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;

const nullableString = (description: string) => ({ type: ["string", "null"], description });
// JSON Schema for Gemini structured output (subset documented as supported).
export const proposalJsonSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: [...AGENT_ACTIONS] },
    customer_candidate_id: nullableString("id copied exactly from the supplied candidate list, else null"),
    amount_paise: { type: ["integer", "null"], minimum: 1, description: "rupees x 100; null if no amount was spoken" },
    items: nullableString("goods mentioned, as notes only; never used to infer an amount"),
    evidence: {
      type: "object",
      properties: {
        customer_phrase: nullableString("exact words from the transcript naming the customer"),
        amount_phrase: nullableString("exact words from the transcript stating the amount"),
      },
      required: ["customer_phrase", "amount_phrase"],
    },
    find: {
      type: "object",
      properties: {
        purpose: { type: ["string", "null"], enum: ["undo", "view", null] },
        date_from: nullableString("YYYY-MM-DD in Asia/Kolkata"),
        date_to: nullableString("YYYY-MM-DD in Asia/Kolkata"),
      },
      required: ["purpose", "date_from", "date_to"],
    },
    entry_option: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    missing: { type: ["string", "null"], enum: [...MISSING, null] },
    intent: { type: ["string", "null"], enum: ["add_credit", "add_payment", "get_balance", null], description: "for ask_clarification: the entry the owner is trying to make" },
    language: { type: "string", enum: ["hi", "en", "hinglish", "mr", "gu"] },
  },
  required: ["action", "customer_candidate_id", "amount_paise", "items", "evidence", "find", "entry_option", "missing", "intent", "language"],
} as const;
