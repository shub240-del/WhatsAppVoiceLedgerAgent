import { createHash, randomUUID } from "node:crypto";
import { FieldPath, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { normalizeName } from "./matching.js";
import {
  actionSchema,
  checkedBalance,
  documentId,
  ensure,
  selectUndo,
  validateAmount,
  type Action,
  type LedgerEntry,
  type WriteAction,
} from "./domain.js";

export type WriteContext = { source: "dashboard" | "whatsapp" | "assistant"; sourceMessageId?: string };

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
const aliasesSchema = z.array(z.string().trim().min(1).max(60)).max(10);
const customerFields = {
  name: z.string().trim().min(1).max(100),
  displayLabel: z.string().trim().max(150),
  phone: phoneSchema.nullable(),
  aliases: aliasesSchema,
};
export const editEntrySchema = z
  .object({
    entryId: documentId,
    type: z.enum(["credit", "payment"]),
    amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    notes: z.string().trim().max(1000).default(""),
    reason: z.string().trim().min(3).max(500),
    confirmLargeAmount: z.boolean().default(false),
    confirmAdvance: z.boolean().default(false),
  })
  .strict();

function matchingFields(name: string, aliases: string[]) {
  return {
    normalizedName: normalizeName(name),
    normalizedAliases: [...new Set(aliases.map(normalizeName).filter(Boolean))],
  };
}
const validKey = (key?: string): key is string => Boolean(key && /^[a-zA-Z0-9_-]{8,128}$/.test(key));

export class LedgerService {
  private now: () => number;
  constructor(private db: Firestore, options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  async createCustomer(uid: string, input: unknown, key?: string) {
    const data = z
      .object({
        name: customerFields.name,
        displayLabel: customerFields.displayLabel.default(""),
        phone: phoneSchema.optional(),
        aliases: aliasesSchema.default([]),
      })
      .strict()
      .parse(input);
    ensure(
      key && /^[a-zA-Z0-9_-]{8,128}$/.test(key),
      400,
      "IDEMPOTENCY_REQUIRED",
      "A valid Idempotency-Key is required.",
    );
    const hash = createHash("sha256").update(`${uid}:customer:${key}`).digest("hex");
    const fingerprint = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const id = randomUUID();
    return this.db.runTransaction(async (tx) => {
      const { shop, shopId } = await this.scope(tx, uid);
      const op = shop.collection("operations").doc(hash);
      const existing = await tx.get(op);
      if (existing.exists) {
        ensure(
          existing.get("fingerprint") === fingerprint,
          409,
          "IDEMPOTENCY_CONFLICT",
          "This key was used for a different customer.",
        );
        return existing.get("result");
      }
      const now = Timestamp.now();
      tx.create(shop.collection("customers").doc(id), {
        ...data,
        ...matchingFields(data.name, data.aliases),
        shopId,
        active: true,
        balancePaise: 0,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(shop.collection("reminderPreferences").doc(id), {
        shopId,
        customerId: id,
        status: "unknown",
        optedInAt: null,
        optedOutAt: null,
      });
      tx.create(shop.collection("auditLogs").doc(id), {
        shopId,
        action: "create_customer",
        actorId: uid,
        targetId: id,
        createdAt: now,
      });
      const result = { customerId: id };
      tx.create(op, { shopId, fingerprint, result, actorId: uid, createdAt: now });
      return result;
    });
  }

  private async scope(tx: Transaction, uid: string) {
    const ownerRef = this.db.doc(`owners/${documentId.parse(uid)}`);
    const owner = await tx.get(ownerRef);
    ensure(
      owner.exists && owner.get("active") === true && owner.get("role") === "owner",
      403,
      "OWNER_REQUIRED",
      "An active shop owner account is required.",
    );
    const shopId = documentId.parse(owner.get("shopId"));
    const shop = this.db.doc(`shops/${shopId}`);
    const shopDoc = await tx.get(shop);
    ensure(
      shopDoc.exists && shopDoc.get("active") === true,
      403,
      "SHOP_INACTIVE",
      "This shop is not active.",
    );
    return { shop, shopId, ownerRef };
  }

  async execute(uid: string, input: unknown, key?: string) {
    return this.executeWith(uid, input, key, { source: "dashboard" });
  }

  async executeWith(uid: string, input: unknown, key: string | undefined, context: WriteContext) {
    const action = actionSchema.parse(input);
    if (action.action === "get_balance" || action.action === "find_entries") {
      return this.read(uid, action);
    }
    ensure(
      key && /^[a-zA-Z0-9_-]{8,128}$/.test(key),
      400,
      "IDEMPOTENCY_REQUIRED",
      "A valid Idempotency-Key is required.",
    );
    return this.write(uid, action, key, context);
  }

  private async write(uid: string, action: WriteAction, key: string, context: WriteContext) {
    const fingerprint = createHash("sha256").update(JSON.stringify(action)).digest("hex");
    const operationId = createHash("sha256").update(`${uid}:${key}`).digest("hex");
    const entryId = randomUUID();
    return this.db.runTransaction(async (tx) => {
      const { shop, shopId, ownerRef } = await this.scope(tx, uid);
      const operation = shop.collection("operations").doc(operationId);
      const existing = await tx.get(operation);
      if (existing.exists) {
        ensure(
          existing.get("fingerprint") === fingerprint,
          409,
          "IDEMPOTENCY_CONFLICT",
          "This key was used for a different operation.",
        );
        return existing.get("result");
      }
      const entries = shop.collection("ledgerEntries");
      const reversals = shop.collection("reversals");
      let original: LedgerEntry | undefined;
      if (action.action === "undo_last") {
        // All owner writes also touch ownerRef, serializing concurrent undo/add operations.
        const recent = await tx.get(
          entries
            .where("createdBy", "==", uid)
            .where("createdAt", ">=", Timestamp.fromMillis(this.now() - 600_000))
            .orderBy("createdAt", "desc")
            .limit(101),
        );
        ensure(
          recent.size < 101,
          409,
          "CHOOSE_ENTRY",
          "Too many recent entries. Choose an exact entry.",
        );
        const rows = recent.docs.map((d) => ({ ...d.data(), id: d.id }) as LedgerEntry);
        const reversedIds = new Set<string>();
        for (const row of rows.filter((r) => r.type !== "reversal")) {
          if ((await tx.get(reversals.doc(row.id))).exists) reversedIds.add(row.id);
        }
        original = selectUndo(rows, reversedIds, this.now());
      } else if (action.action === "undo_entry") {
        const snapshot = await tx.get(entries.doc(action.entryId));
        ensure(snapshot.exists, 404, "ENTRY_NOT_FOUND", "Entry not found in this shop.");
        original = { ...snapshot.data(), id: snapshot.id } as LedgerEntry;
      }
      if (original) {
        ensure(
          original.type !== "reversal",
          409,
          "REVERSAL_NOT_UNDOABLE",
          "A reversal cannot itself be reversed.",
        );
        ensure(
          !(await tx.get(reversals.doc(original.id))).exists,
          409,
          "ALREADY_REVERSED",
          "This entry has already been reversed.",
        );
      }
      const customerId = original?.customerId ?? ("customerId" in action ? action.customerId : "");
      documentId.parse(customerId);
      const customerRef = shop.collection("customers").doc(customerId);
      const customer = await tx.get(customerRef);
      ensure(
        customer.exists && customer.get("active") !== false,
        404,
        "CUSTOMER_NOT_FOUND",
        "Customer not found in this shop.",
      );
      const before = customer.get("balancePaise");
      const isAdd = action.action === "add_credit" || action.action === "add_payment";
      const delta = original
        ? -original.signedAmountPaise
        : isAdd
          ? action.action === "add_credit"
            ? action.amountPaise
            : -action.amountPaise
          : 0;
      const balancePaise = isAdd ? validateAmount(action, before) : checkedBalance(before, delta);
      const now = Timestamp.now();
      const entry = {
        shopId,
        customerId,
        type: original ? "reversal" : action.action === "add_credit" ? "credit" : "payment",
        signedAmountPaise: delta,
        createdBy: uid,
        createdAt: now,
        source: context.source,
        sourceMessageId: context.sourceMessageId ?? null,
        notes: "notes" in action ? action.notes : "",
        ...(original
          ? { reversesEntryId: original.id, reason: "reason" in action ? action.reason : "" }
          : {}),
      };
      const result = {
        entryId,
        customerId,
        balancePaise,
        signedAmountPaise: delta,
        type: entry.type,
      };
      tx.create(entries.doc(entryId), entry);
      tx.update(customerRef, { balancePaise, updatedAt: now });
      // Originals are immutable. A unique document keyed by original ID prevents double reversal.
      if (original)
        tx.create(reversals.doc(original.id), {
          shopId,
          originalEntryId: original.id,
          reversalEntryId: entryId,
          reason: "reason" in action ? action.reason : "",
          createdBy: uid,
          createdAt: now,
        });
      tx.create(shop.collection("auditLogs").doc(entryId), {
        shopId,
        action: action.action,
        actorId: uid,
        targetId: entryId,
        customerId,
        before: { balancePaise: before },
        after: { balancePaise },
        createdAt: now,
      });
      tx.create(operation, { shopId, fingerprint, result, createdAt: now, actorId: uid });
      tx.update(ownerRef, { lastLedgerWriteAt: now });
      return result;
    });
  }

  private async read(
    uid: string,
    action: Extract<Action, { action: "get_balance" | "find_entries" }>,
  ) {
    return this.readEntries(uid, action);
  }

  /** Edit = reversal of the original + a new entry, linked by an entryRevisions record. */
  async editEntry(uid: string, input: unknown, key?: string) {
    const edit = editEntrySchema.parse(input);
    ensure(validKey(key), 400, "IDEMPOTENCY_REQUIRED", "A valid Idempotency-Key is required.");
    const fingerprint = createHash("sha256").update(JSON.stringify({ op: "edit", ...edit })).digest("hex");
    const operationId = createHash("sha256").update(`${uid}:${key}`).digest("hex");
    const reversalId = randomUUID();
    const newEntryId = randomUUID();
    return this.db.runTransaction(async (tx) => {
      const { shop, shopId, ownerRef } = await this.scope(tx, uid);
      const operation = shop.collection("operations").doc(operationId);
      const existing = await tx.get(operation);
      if (existing.exists) {
        ensure(existing.get("fingerprint") === fingerprint, 409, "IDEMPOTENCY_CONFLICT", "This key was used for a different operation.");
        return existing.get("result");
      }
      const originalSnap = await tx.get(shop.collection("ledgerEntries").doc(edit.entryId));
      ensure(originalSnap.exists, 404, "ENTRY_NOT_FOUND", "Entry not found in this shop.");
      const original = { ...originalSnap.data(), id: originalSnap.id } as LedgerEntry;
      ensure(original.type !== "reversal", 409, "REVERSAL_NOT_UNDOABLE", "A reversal cannot be edited.");
      const reversalRef = shop.collection("reversals").doc(original.id);
      ensure(!(await tx.get(reversalRef)).exists, 409, "ALREADY_REVERSED", "This entry has already been reversed.");
      const customerRef = shop.collection("customers").doc(original.customerId);
      const customer = await tx.get(customerRef);
      ensure(customer.exists, 404, "CUSTOMER_NOT_FOUND", "Customer not found in this shop.");
      const before = customer.get("balancePaise");
      const afterReversal = checkedBalance(before, -original.signedAmountPaise);
      const balancePaise = validateAmount(
        {
          action: edit.type === "credit" ? "add_credit" : "add_payment",
          customerId: original.customerId,
          amountPaise: edit.amountPaise,
          notes: edit.notes,
          confirmLargeAmount: edit.confirmLargeAmount,
          ...(edit.type === "payment" ? { confirmAdvance: edit.confirmAdvance } : {}),
        } as Extract<Action, { action: "add_credit" | "add_payment" }>,
        afterReversal,
      );
      const now = Timestamp.now();
      const common = { shopId, customerId: original.customerId, createdBy: uid, createdAt: now, source: "dashboard", sourceMessageId: null };
      const entries = shop.collection("ledgerEntries");
      tx.create(entries.doc(reversalId), {
        ...common, type: "reversal", signedAmountPaise: -original.signedAmountPaise, notes: "",
        reversesEntryId: original.id, reason: edit.reason,
      });
      const signed = edit.type === "credit" ? edit.amountPaise : -edit.amountPaise;
      tx.create(entries.doc(newEntryId), { ...common, type: edit.type, signedAmountPaise: signed, notes: edit.notes, revisesEntryId: original.id });
      tx.create(reversalRef, { shopId, originalEntryId: original.id, reversalEntryId: reversalId, reason: edit.reason, createdBy: uid, createdAt: now });
      tx.create(shop.collection("entryRevisions").doc(original.id), {
        shopId, originalEntryId: original.id, reversalEntryId: reversalId, newEntryId, editedBy: uid, reason: edit.reason, createdAt: now,
      });
      tx.update(customerRef, { balancePaise, updatedAt: now });
      tx.create(shop.collection("auditLogs").doc(newEntryId), {
        shopId, action: "edit_entry", actorId: uid, targetId: original.id, customerId: original.customerId,
        before: { balancePaise: before, signedAmountPaise: original.signedAmountPaise },
        after: { balancePaise, signedAmountPaise: signed }, reason: edit.reason, createdAt: now,
      });
      const result = { originalEntryId: original.id, reversalEntryId: reversalId, newEntryId, customerId: original.customerId, balancePaise };
      tx.create(operation, { shopId, fingerprint, result, createdAt: now, actorId: uid });
      tx.update(ownerRef, { lastLedgerWriteAt: now });
      return result;
    });
  }

  async updateCustomer(uid: string, customerId: string, input: unknown) {
    documentId.parse(customerId);
    const patch = z.object(customerFields).partial().strict().parse(input);
    ensure(Object.keys(patch).length > 0, 400, "INVALID_INPUT", "No customer fields to update.");
    return this.db.runTransaction(async (tx) => {
      const { shop, shopId } = await this.scope(tx, uid);
      const ref = shop.collection("customers").doc(customerId);
      const snap = await tx.get(ref);
      ensure(snap.exists, 404, "CUSTOMER_NOT_FOUND", "Customer not found in this shop.");
      const name = patch.name ?? snap.get("name");
      const aliases = patch.aliases ?? snap.get("aliases") ?? [];
      const now = Timestamp.now();
      // Balance is never client-editable; only listed descriptive fields change.
      const update = { ...patch, ...matchingFields(name, aliases), updatedAt: now };
      tx.update(ref, update);
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, snap.get(k) ?? null]));
      tx.create(shop.collection("auditLogs").doc(randomUUID()), {
        shopId, action: "update_customer", actorId: uid, targetId: customerId, customerId, before, after: patch, createdAt: now,
      });
      return { customerId };
    });
  }

  async setReminderConsent(uid: string, customerId: string, input: unknown) {
    documentId.parse(customerId);
    const { status } = z.object({ status: z.enum(["opted_in", "opted_out"]) }).strict().parse(input);
    return this.db.runTransaction(async (tx) => {
      const { shop, shopId } = await this.scope(tx, uid);
      const customer = await tx.get(shop.collection("customers").doc(customerId));
      ensure(customer.exists, 404, "CUSTOMER_NOT_FOUND", "Customer not found in this shop.");
      const ref = shop.collection("reminderPreferences").doc(customerId);
      const before = await tx.get(ref);
      const now = Timestamp.now();
      const data = {
        shopId, customerId, status,
        optedInAt: status === "opted_in" ? now : (before.get("optedInAt") ?? null),
        optedOutAt: status === "opted_out" ? now : null,
        optInSource: status === "opted_in" ? "owner_attested_dashboard" : (before.get("optInSource") ?? null),
        updatedAt: now,
      };
      tx.set(ref, data);
      tx.create(shop.collection("auditLogs").doc(randomUUID()), {
        shopId, action: "reminder_consent", actorId: uid, targetId: customerId, customerId,
        before: { status: before.get("status") ?? "unknown" }, after: { status }, createdAt: now,
      });
      return { customerId, status };
    });
  }

  private async readEntries(
    uid: string,
    action: Extract<Action, { action: "get_balance" | "find_entries" }>,
  ) {
    return this.db.runTransaction(async (tx) => {
      const { shop } = await this.scope(tx, uid);
      if (action.action === "get_balance") {
        const customer = await tx.get(shop.collection("customers").doc(action.customerId));
        ensure(customer.exists, 404, "CUSTOMER_NOT_FOUND", "Customer not found in this shop.");
        const recent = await tx.get(
          shop
            .collection("ledgerEntries")
            .where("customerId", "==", action.customerId)
            .orderBy("createdAt", "desc")
            .limit(5),
        );
        return {
          customerId: action.customerId,
          balancePaise: customer.get("balancePaise"),
          entries: recent.docs.map((d) => ({ id: d.id, ...d.data() })),
        };
      }
      let query = shop
        .collection("ledgerEntries")
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (action.customerId) query = query.where("customerId", "==", action.customerId);
      if (action.amountPaise) {
        query = query.where("signedAmountPaise", "in", [action.amountPaise, -action.amountPaise]);
      }
      if (action.dateFrom)
        query = query.where("createdAt", ">=", Timestamp.fromDate(new Date(action.dateFrom)));
      if (action.dateTo)
        query = query.where("createdAt", "<=", Timestamp.fromDate(new Date(action.dateTo)));
      if (action.cursor) {
        const cursor = await tx.get(shop.collection("ledgerEntries").doc(action.cursor));
        ensure(cursor.exists, 400, "INVALID_CURSOR", "Invalid ledger cursor.");
        query = query.startAfter(cursor);
      }
      const docs = await tx.get(query.limit(6));
      const page = docs.docs.slice(0, 5);
      return {
        entries: page.map((d) => ({ id: d.id, ...d.data() })),
        nextCursor: docs.size > 5 ? page[page.length - 1].id : null,
      };
    });
  }
}
