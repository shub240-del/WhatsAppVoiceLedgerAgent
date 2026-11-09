import { randomUUID } from "node:crypto";
import { Timestamp, type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { ServiceError } from "../domain.js";
import type { LedgerService } from "../ledger.js";
import type { SpeechToText } from "../adapters.js";
import { MAX_AUDIO_MS, validateAudio } from "../audio.js";
import { extractAmounts, formatRupees, parseAmountPhrase } from "../money-words.js";
import { resolveCustomer, transliterate, type MatchCustomer } from "../matching.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";
import { sha, type InboundPayload } from "../whatsapp/webhook.js";
import { decide, nextStep, type Decision, type FindFilters, type OpState } from "./decide.js";
import { InvalidModelOutput, UnusableAudio } from "./errors.js";
import type { EvonParser } from "./gemini.js";
import { msg } from "./messages.js";
import { sttLanguages } from "../languages.js";

export const PENDING_TTL_MS = 15 * 60 * 1000;
type Option = { key: number; id: string; label: string };
type ConfirmKind = "advance" | "large";

export type StoredDecision =
  | { kind: "none" }
  | { kind: "reply"; text: string }
  | { kind: "opt"; optedOut: boolean }
  | { kind: "ledger"; state: OpState; resolves: string | null }
  | { kind: "ask"; missing: "customer" | "amount" | "entry_choice" | "confirmation"; state: OpState | null; options: Option[]; question: string; confirmKind: ConfirmKind | null; resolves: string | null }
  | { kind: "cancel"; pendingId: string }
  | { kind: "undo"; entryId: string | null; resolves: string | null }
  | { kind: "find"; filters: FindFilters };

export type Checkpoint = { transcript?: string; decision?: StoredDecision; replyText?: string; entryId?: string | null; pendingId?: string | null; replyWamid?: string };
export type AgentDeps = {
  db: Firestore; ledger: LedgerService; parser: EvonParser | null; stt: SpeechToText | null; whatsapp: WhatsAppGateway; now?: () => number;
  /** "web" = the in-app assistant: no WhatsApp opt-in/out commands, entries tagged source "assistant". */
  channel?: "whatsapp" | "web";
};

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);
const latin = (t: string) => transliterate(t).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const UNDO = /^(galat|galti|undo|wrong|hata do|hatao|cancel karo|galat hai|galat entry)$/;
const CANCEL = /^(nahi rehne do|rehne do|nahi|cancel|chhodo|mat likho|no)$/;
const YES = /^(1|haan|han|ha|yes|ji|theek|ok|okay|sahi|haan ji)$/;
const NO = /^(2|nahi|na|no)$/;

export class VoiceAgent {
  private now: () => number;
  constructor(private deps: AgentDeps) {
    this.now = deps.now ?? Date.now;
  }

  private get web() {
    return this.deps.channel === "web";
  }

  private shop(job: InboundPayload) {
    return this.deps.db.doc(`shops/${job.shopId}`);
  }

  async process(job: InboundPayload, checkpoint: Checkpoint, save: (c: Checkpoint) => Promise<void>) {
    const cp: Checkpoint = { ...checkpoint };
    const persist = async (patch: Checkpoint) => { Object.assign(cp, patch); await save(cp); };
    const owner = await this.deps.db.doc(`owners/${job.ownerUid}`).get();
    if (!owner.exists || owner.get("active") !== true || owner.get("shopId") !== job.shopId) return; // membership revoked

    if (cp.transcript === undefined) {
      let transcript: string;
      try {
        transcript = await this.transcript(job);
      } catch (error) {
        if (error instanceof UnusableAudio) {
          const sttMissing = this.web
            ? "Bolkar entry abhi setup nahi hai. Kripya type karein, jaise 'Ramesh ko 340 ka udhaar likh do'."
            : "Voice notes abhi setup nahi hue. Kripya text mein likhein, jaise 'Ramesh ko 340 ka udhaar likh do'.";
          const tooLong = this.web ? "30 second se lamba tha. Chhota bolein, ek entry ek baar." : msg.tooLong;
          await persist({ transcript: "", decision: { kind: "reply", text: error.reason === "too_long" ? tooLong : error.reason === "stt_not_configured" ? sttMissing : msg.unusableAudio } });
          return this.finish(job, cp, persist);
        }
        throw error;
      }
      await persist({ transcript });
    }
    if (!cp.decision) {
      let decision: StoredDecision;
      try {
        decision = await this.decideFor(job, cp.transcript ?? "", this.web ? false : owner.get("waOptedOut") === true);
      } catch (error) {
        if (error instanceof InvalidModelOutput) decision = { kind: "reply", text: msg.invalidModel };
        else throw error; // ProviderUnavailable / Firestore errors -> job retry, nothing written
      }
      await persist({ decision });
    }
    if (cp.replyText === undefined) {
      const { text, entryId, pendingId } = await this.execute(job, cp.decision!, cp.transcript ?? "");
      await persist({ replyText: text, entryId: entryId ?? null, pendingId: pendingId ?? null });
    }
    return this.finish(job, cp, persist);
  }

  private async finish(job: InboundPayload, cp: Checkpoint, persist: (c: Checkpoint) => Promise<void>) {
    const text = cp.replyText ?? (cp.decision?.kind === "reply" ? cp.decision.text : "");
    if (!text || cp.replyWamid) return;
    const { messageId } = await this.deps.whatsapp.sendText(job.from, text, { replyTo: job.wamid });
    await persist({ replyText: text, replyWamid: messageId });
    const at = Timestamp.fromMillis(this.now());
    const shop = this.shop(job);
    const batch = this.deps.db.batch();
    batch.set(shop.collection("whatsappMessages").doc(sha(messageId)), { shopId: job.shopId, wamid: messageId, direction: "out", type: "text", contextWamid: job.wamid, createdAt: at });
    if (cp.entryId) batch.set(shop.collection("confirmations").doc(sha(messageId)), { wamid: messageId, entryId: cp.entryId, ownerUid: job.ownerUid, createdAt: at });
    if (cp.pendingId) batch.update(shop.collection("pendingClarifications").doc(cp.pendingId), { questionWamid: messageId });
    await batch.commit();
  }

  private async transcript(job: InboundPayload): Promise<string> {
    if (job.messageType === "text") return job.text ?? "";
    if (job.messageType !== "audio" || !job.mediaId) throw new UnusableAudio("unsupported_type");
    if (!this.deps.stt) throw new UnusableAudio("stt_not_configured");
    const media = await this.deps.whatsapp.fetchMedia(job.mediaId);
    const { durationMs } = validateAudio(media.bytes, media.mimeType);
    const shopLanguage = (await this.shop(job).get()).get("language");
    const result = await this.deps.stt.transcribe(media.bytes, sttLanguages(shopLanguage), media.mimeType);
    if ((result.durationMs ?? durationMs ?? 0) > MAX_AUDIO_MS) throw new UnusableAudio("too_long");
    if (result.confidence !== null && result.confidence < 0.7) throw new UnusableAudio("low_confidence");
    if (words(result.text).length < 2) throw new UnusableAudio("empty_transcript");
    return result.text;
  }

  private async customers(job: InboundPayload): Promise<(MatchCustomer & { balancePaise: number })[]> {
    const snap = await this.shop(job).collection("customers").where("active", "==", true).limit(1000).get();
    return snap.docs.map((d) => ({ id: d.id, name: d.get("name"), displayLabel: d.get("displayLabel") ?? "", aliases: d.get("aliases") ?? [], balancePaise: d.get("balancePaise") ?? 0 }));
  }

  private async activePending(job: InboundPayload) {
    const snap = await this.shop(job).collection("pendingClarifications")
      .where("ownerUid", "==", job.ownerUid).where("status", "==", "awaiting_owner").limit(5).get();
    let active: QueryDocumentSnapshot | null = null;
    let expired = false;
    for (const doc of snap.docs) {
      if ((doc.get("expiresAt") as Timestamp).toMillis() <= this.now()) {
        await doc.ref.update({ status: "expired", resolvedAt: Timestamp.fromMillis(this.now()) });
        expired = true;
      } else if (!active || doc.get("createdAt").toMillis() > active.get("createdAt").toMillis()) active = doc;
    }
    return { active, expired };
  }

  async decideFor(job: InboundPayload, transcript: string, optedOut: boolean): Promise<StoredDecision> {
    const text = latin(transcript);
    if (!this.web) {
      if (/^(stop|band karo|bandh karo)$/.test(text)) return { kind: "opt", optedOut: true };
      if (optedOut) return /^start$/.test(text) ? { kind: "opt", optedOut: false } : { kind: "none" };
      if (/^start$/.test(text)) return { kind: "reply", text: msg.started };
    }
    if (/^(madad|help|menu)$/.test(text)) return { kind: "reply", text: msg.help() };
    if (!text) return { kind: "reply", text: job.messageType === "other" ? msg.unsupportedType : msg.unusableAudio };

    const shop = this.shop(job);
    if (job.contextWamid) {
      const confirmation = await shop.collection("confirmations").doc(sha(job.contextWamid)).get();
      if (confirmation.exists && UNDO.test(text)) return { kind: "undo", entryId: confirmation.get("entryId"), resolves: null };
      const answered = await shop.collection("pendingClarifications").where("questionWamid", "==", job.contextWamid).limit(1).get();
      const prior = answered.docs[0];
      if (prior && prior.get("status") === "completed") return { kind: "reply", text: msg.alreadyDone };
      if (prior && prior.get("status") === "expired") return { kind: "reply", text: msg.expired };
    }
    const { active, expired } = await this.activePending(job);
    if (active && CANCEL.test(text)) return { kind: "cancel", pendingId: active.id };
    if (UNDO.test(text)) return { kind: "undo", entryId: null, resolves: null };

    const customers = await this.customers(job);
    if (active) {
      const resolved = this.resolvePending(active, text, customers);
      if (resolved) return resolved;
      if (words(text).length <= 3) return { kind: "reply", text: msg.pendingReask(active.get("questionText")) };
      // A clear new command supersedes the pending question (handled when the new decision executes).
    } else if (expired && words(text).length <= 3) {
      return { kind: "reply", text: msg.expired };
    }

    if (!this.deps.parser) return { kind: "reply", text: "AI parser abhi configured nahi hai. Kuch save nahi hua; dashboard se entry karein." };
    const proposal = await this.deps.parser.propose({
      transcript,
      candidates: customers.slice(0, 200).map((c) => ({ id: c.id, name: c.name, label: c.displayLabel ?? "", aliases: c.aliases ?? [] })),
      pendingQuestion: active?.get("questionText") ?? null,
      pendingOptions: ((active?.get("options") ?? []) as Option[]).map(({ key, label }) => ({ key, label })),
      todayIst: new Date(this.now() + 5.5 * 3600_000).toISOString().slice(0, 10),
      shopLanguage: (await this.shop(job).get()).get("language") ?? "hinglish",
    });
    const decision = decide(proposal, transcript, customers);
    if (decision.kind === "undo_option") {
      const option = ((active?.get("options") ?? []) as Option[]).find((o) => o.key === decision.option);
      if (active && active.get("missingField") === "entry_choice" && option) return { kind: "undo", entryId: option.id, resolves: active.id };
      return { kind: "reply", text: msg.unsupported };
    }
    return this.store(decision, customers, null);
  }

  private resolvePending(pending: QueryDocumentSnapshot, text: string, customers: MatchCustomer[]): StoredDecision | null {
    const missing = pending.get("missingField") as string;
    const options = (pending.get("options") ?? []) as Option[];
    const state = pending.get("proposedState") as OpState | null;
    const pick = /^\d$/.test(text) ? options.find((o) => o.key === Number(text)) : undefined;
    if (missing === "entry_choice") return pick ? { kind: "undo", entryId: pick.id, resolves: pending.id } : null;
    if (!state) return null;
    if (missing === "confirmation") {
      if (YES.test(text)) {
        const kind = pending.get("confirmKind") as ConfirmKind;
        return { kind: "ledger", state: { ...state, confirmAdvance: state.confirmAdvance || kind === "advance", confirmLargeAmount: state.confirmLargeAmount || kind === "large" }, resolves: pending.id };
      }
      return NO.test(text) ? { kind: "cancel", pendingId: pending.id } : null;
    }
    if (missing === "customer") {
      let id = pick?.id;
      if (!id && words(text).length <= 4) {
        const scope = options.length ? customers.filter((c) => options.some((o) => o.id === c.id)) : customers;
        const r = resolveCustomer(text, scope);
        if (r.kind === "unique") id = r.id;
      }
      return id ? this.store(nextStep({ ...state, customerId: id }), customers, pending.id) : null;
    }
    if (missing === "amount" && words(text).length <= 6) {
      const amount = parseAmountPhrase(text);
      return amount && extractAmounts(text).length === 1 ? this.store(nextStep({ ...state, amountPaise: amount }), customers, pending.id) : null;
    }
    return null;
  }

  private store(decision: Decision, customers: MatchCustomer[], resolves: string | null): StoredDecision {
    switch (decision.kind) {
      case "ledger": return { kind: "ledger", state: decision.state, resolves };
      case "undo_last": return { kind: "undo", entryId: null, resolves };
      case "find": return { kind: "find", filters: decision.filters };
      case "reject": return { kind: "reply", text: decision.reason === "multiple" ? msg.multiple : msg.unsupported };
      case "undo_option": return { kind: "reply", text: msg.unsupported };
      case "ask": {
        if (decision.missing === "amount") return { kind: "ask", missing: "amount", state: decision.state, options: [], question: msg.askAmount, confirmKind: null, resolves };
        const options = decision.state.customerOptions
          .map((id) => customers.find((c) => c.id === id)).filter(Boolean)
          .map((c, i) => ({ key: i + 1, id: c!.id, label: `${c!.name}${c!.displayLabel ? ` – ${c!.displayLabel}` : ""}` }));
        const question = options.length
          ? `Kaun sa customer?\n${options.map((o) => `${o.key}) ${o.label}`).join("\n")}\n${options.map((o) => o.key).join(" ya ")} bhejein.`
          : msg.askCustomerNone;
        return { kind: "ask", missing: "customer", state: decision.state, options, question, confirmKind: null, resolves };
      }
    }
  }

  private key(job: InboundPayload) {
    return `wa-${sha(job.wamid).slice(0, 48)}`;
  }

  /** Executes a stored decision. Every write is idempotent on the inbound message id. */
  async execute(job: InboundPayload, d: StoredDecision, transcript: string): Promise<{ text: string; entryId?: string; pendingId?: string }> {
    const { db, ledger } = this.deps;
    const shop = this.shop(job);
    const pendings = shop.collection("pendingClarifications");
    const at = () => Timestamp.fromMillis(this.now());
    const context = { source: this.web ? ("assistant" as const) : ("whatsapp" as const), sourceMessageId: job.wamid };
    const claim = async (pendingId: string | null) => {
      if (!pendingId) return true;
      return db.runTransaction(async (tx) => {
        const ref = pendings.doc(pendingId);
        const p = await tx.get(ref);
        if (!p.exists) return false;
        if (p.get("ownerReplyWamid") === job.wamid) return true; // our own retry
        if (p.get("status") !== "awaiting_owner" || p.get("expiresAt").toMillis() <= this.now()) return false;
        tx.update(ref, { status: "resolving", ownerReplyWamid: job.wamid, ownerReplyText: transcript.slice(0, 500), updatedAt: at() });
        return true;
      });
    };
    const settle = (pendingId: string | null, status: "completed" | "failed" | "cancelled") =>
      pendingId ? pendings.doc(pendingId).update({ status, resolvedAt: at() }) : Promise.resolve();

    switch (d.kind) {
      case "none": return { text: "" };
      case "reply": return { text: d.text };
      case "opt":
        await db.doc(`owners/${job.ownerUid}`).update({ waOptedOut: d.optedOut, waOptChangedAt: at() });
        return { text: d.optedOut ? msg.stopped : msg.started };
      case "cancel":
        if (!(await claim(d.pendingId))) return { text: msg.alreadyDone };
        await settle(d.pendingId, "cancelled");
        return { text: msg.cancelled };
      case "ask": {
        if (!(await claim(d.resolves))) return { text: msg.alreadyDone };
        const id = sha(`pending:${job.wamid}`).slice(0, 40);
        await db.runTransaction(async (tx) => {
          const ref = pendings.doc(id);
          const existing = await tx.get(ref);
          const others = await tx.get(pendings.where("ownerUid", "==", job.ownerUid).where("status", "==", "awaiting_owner"));
          if (existing.exists) return;
          for (const other of others.docs) tx.update(other.ref, { status: "superseded", resolvedAt: at() });
          if (d.resolves) tx.update(pendings.doc(d.resolves), { status: "completed", resolvedAt: at() });
          tx.create(ref, {
            shopId: job.shopId, ownerUid: job.ownerUid, originalWamid: job.wamid, originalTranscript: transcript.slice(0, 2000),
            proposedState: d.state, missingField: d.missing, options: d.options, confirmKind: d.confirmKind,
            customerContext: d.options.map((o) => o.id), questionText: d.question, questionWamid: null,
            ownerReplyWamid: null, ownerReplyText: null, status: "awaiting_owner",
            expiresAt: Timestamp.fromMillis(this.now() + PENDING_TTL_MS), createdAt: at(), resolvedAt: null,
          });
        });
        return { text: d.question, pendingId: id };
      }
      case "ledger": {
        if (!(await claim(d.resolves))) return { text: msg.alreadyDone };
        const s = d.state;
        const customer = await shop.collection("customers").doc(s.customerId!).get();
        const name = customer.get("name") ?? "Customer";
        try {
          if (s.action === "get_balance") {
            const r = (await ledger.executeWith(job.ownerUid!, { action: "get_balance", customerId: s.customerId }, undefined, context)) as {
              balancePaise: number; entries: { id: string; type: string; signedAmountPaise: number }[];
            };
            const reversed = await Promise.all(r.entries.map((e) => shop.collection("reversals").doc(e.id).get()));
            const lines = r.entries.map((e, i) => `${i + 1}) ${e.type === "credit" ? "Udhaar" : e.type === "payment" ? "Payment" : "Reversal"} ${formatRupees(Math.abs(e.signedAmountPaise))}${reversed[i].exists ? " (hata diya)" : ""}`);
            await settle(d.resolves, "completed");
            return { text: `${name} ji ka baaki ${formatRupees(r.balancePaise)} hai.${lines.length ? `\nPichli entries:\n${lines.join("\n")}` : ""}` };
          }
          const action = s.action === "add_credit"
            ? { action: "add_credit", customerId: s.customerId, amountPaise: s.amountPaise, notes: s.notes, confirmLargeAmount: s.confirmLargeAmount }
            : { action: "add_payment", customerId: s.customerId, amountPaise: s.amountPaise, notes: s.notes, confirmLargeAmount: s.confirmLargeAmount, confirmAdvance: s.confirmAdvance };
          const r = (await ledger.executeWith(job.ownerUid!, action, this.key(job), context)) as { entryId: string; balancePaise: number };
          await settle(d.resolves, "completed");
          return { text: s.action === "add_credit" ? msg.credit(name, s.amountPaise!, r.balancePaise, s.notes) : msg.payment(name, s.amountPaise!, r.balancePaise), entryId: r.entryId };
        } catch (error) {
          if (error instanceof ServiceError && (error.code === "CONFIRM_ADVANCE" || error.code === "CONFIRM_LARGE_AMOUNT")) {
            const kind: ConfirmKind = error.code === "CONFIRM_ADVANCE" ? "advance" : "large";
            const question = kind === "advance" ? msg.advance(s.amountPaise!, customer.get("balancePaise") ?? 0) : msg.large(s.amountPaise!);
            const options = [{ key: 1, id: "yes", label: "Haan" }, { key: 2, id: "no", label: "Nahi" }];
            return this.execute(job, { kind: "ask", missing: "confirmation", state: s, options, question, confirmKind: kind, resolves: d.resolves }, transcript);
          }
          if (error instanceof ServiceError) { await settle(d.resolves, "failed"); return { text: error.status === 404 ? msg.askCustomerNone : msg.systemError }; }
          throw error;
        }
      }
      case "undo": {
        if (!(await claim(d.resolves))) return { text: msg.alreadyDone };
        const reason = this.web ? "Owner correction via voice assistant" : "Owner correction via WhatsApp";
        try {
          const r = (await ledger.executeWith(job.ownerUid!, d.entryId ? { action: "undo_entry", entryId: d.entryId, reason } : { action: "undo_last", reason }, this.key(job), context)) as {
            customerId: string; balancePaise: number; signedAmountPaise: number;
          };
          await settle(d.resolves, "completed");
          const customer = await shop.collection("customers").doc(r.customerId).get();
          return { text: msg.undone(Math.abs(r.signedAmountPaise), customer.get("name") ?? "Customer", r.balancePaise) };
        } catch (error) {
          if (!(error instanceof ServiceError)) throw error;
          await settle(d.resolves, "failed");
          if (error.code === "ALREADY_REVERSED") return { text: msg.alreadyReversed };
          if (error.code === "NO_RECENT_ENTRY") return { text: msg.undoTooOld };
          if (error.code === "CHOOSE_ENTRY") {
            const recent = await shop.collection("ledgerEntries").where("createdBy", "==", job.ownerUid)
              .where("createdAt", ">=", Timestamp.fromMillis(this.now() - 600_000)).orderBy("createdAt", "desc").limit(10).get();
            const undoable = [];
            for (const e of recent.docs) if (e.get("type") !== "reversal" && !(await shop.collection("reversals").doc(e.id).get()).exists) undoable.push(e);
            return this.execute(job, await this.entryChoice(job, undoable.slice(0, 4)), transcript);
          }
          return { text: error.status === 404 ? msg.noEntries : msg.systemError };
        }
      }
      case "find": {
        const f = d.filters;
        const r = (await ledger.executeWith(job.ownerUid!, {
          action: "find_entries",
          ...(f.customerId ? { customerId: f.customerId } : {}),
          ...(f.amountPaise ? { amountPaise: f.amountPaise } : {}),
          ...(f.dateFrom ? { dateFrom: f.dateFrom } : {}),
          ...(f.dateTo ? { dateTo: f.dateTo } : {}),
        }, undefined, context)) as { entries: { id: string; type: string }[] };
        const candidates = [];
        for (const e of r.entries) if (e.type !== "reversal" && !(await shop.collection("reversals").doc(e.id).get()).exists) candidates.push(e.id);
        const docs = await Promise.all(candidates.slice(0, 4).map((id) => shop.collection("ledgerEntries").doc(id).get()));
        if (!docs.length) return { text: msg.noEntries };
        if (f.purpose === "view") {
          const names = await this.names(job, docs.map((x) => x.get("customerId")));
          return { text: docs.map((x, i) => `${i + 1}) ${this.describe(x, names)}`).join("\n") };
        }
        // Even a single match needs an explicit pick: never blindly undo an uncertain entry.
        return this.execute(job, await this.entryChoice(job, docs), transcript);
      }
    }
  }

  private async names(job: InboundPayload, ids: string[]) {
    const unique = [...new Set(ids)];
    const snaps = await Promise.all(unique.map((id) => this.shop(job).collection("customers").doc(id).get()));
    return new Map(snaps.map((s) => [s.id, (s.get("name") as string) ?? "Customer"]));
  }

  private describe(entry: DocumentSnapshot, names: Map<string, string>) {
    const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(entry.get("createdAt").toDate());
    return `${names.get(entry.get("customerId"))} – ${entry.get("type") === "credit" ? "udhaar" : "payment"} ${formatRupees(Math.abs(entry.get("signedAmountPaise")))} (${date})`;
  }

  private async entryChoice(job: InboundPayload, entries: DocumentSnapshot[]): Promise<StoredDecision> {
    if (!entries.length) return { kind: "reply", text: msg.noEntries };
    const names = await this.names(job, entries.map((e) => e.get("customerId")));
    const options = entries.map((e, i) => ({ key: i + 1, id: e.id, label: this.describe(e, names) }));
    const question = `Kaunsi entry hatani hai?\n${options.map((o) => `${o.key}) ${o.label}`).join("\n")}\nNumber bhejein.`;
    return { kind: "ask", missing: "entry_choice", state: null, options, question, confirmKind: null, resolves: null };
  }
}

export const newCorrelationId = () => randomUUID();
