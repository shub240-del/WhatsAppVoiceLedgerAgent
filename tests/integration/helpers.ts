import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Proposal } from "../../server/agent/schema";
import type { EvonParser, ParserContext } from "../../server/agent/gemini";
import type { WhatsAppGateway } from "../../server/whatsapp/client";
import { MemoryFirestore } from "../support/memory-firestore";

// MEMORY_FIRESTORE=1 runs these suites against an in-memory Firestore (tests/support) when the
// emulator cannot be downloaded. The emulator remains the reference: CI should run both.
const MEMORY = process.env.MEMORY_FIRESTORE === "1";
if (!MEMORY && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Integration tests require the Firestore emulator (or MEMORY_FIRESTORE=1). Live project access is forbidden.");
export const PROJECT = "demo-udhaar-test";
let memory: MemoryFirestore | null = null;

export function adminApp(name: string): { app: App; db: Firestore; close: () => Promise<void> } {
  if (MEMORY) {
    memory = new MemoryFirestore();
    return { app: null as unknown as App, db: memory as unknown as Firestore, close: async () => {} };
  }
  const app = initializeApp({ projectId: PROJECT }, name);
  const db = getFirestore(app);
  return { app, db, close: async () => { await db.terminate(); await deleteApp(app); } };
}

export async function clear() {
  if (MEMORY) return memory?.clear();
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

export async function seedShop(db: Firestore, suffix: string, customers: { id: string; name: string; label?: string; balance?: number; phone?: string }[] = []) {
  const shopId = `shop-${suffix}`, uid = `owner-${suffix}`, phone = suffix === "a" ? "+919800000001" : "+919800000002";
  const batch = db.batch();
  batch.set(db.doc(`shops/${shopId}`), { name: `Shop ${suffix}`, active: true, remindersEnabled: false });
  batch.set(db.doc(`owners/${uid}`), { shopId, role: "owner", active: true, phoneE164: phone });
  batch.set(db.doc(`ownerPhones/${phone}`), { uid, shopId, active: true });
  for (const c of customers) {
    batch.set(db.doc(`shops/${shopId}/customers/${c.id}`), { name: c.name, displayLabel: c.label ?? "", aliases: [], active: true, balancePaise: c.balance ?? 0, ...(c.phone ? { phone: c.phone } : {}) });
  }
  await batch.commit();
  return { shopId, uid, phone };
}

export const proposal = (over: Partial<Proposal>): Proposal => ({
  action: "add_credit", customer_candidate_id: null, amount_paise: null, items: null,
  evidence: { customer_phrase: null, amount_phrase: null }, find: { purpose: null, date_from: null, date_to: null },
  entry_option: null, missing: null, intent: null, language: "hinglish", ...over,
});

/** Scripted EVON boundary: transcript -> proposal, or an error to simulate outages. */
export class ScriptedParser implements EvonParser {
  calls: ParserContext[] = [];
  constructor(public script: Record<string, Proposal | Error | (() => Proposal | Error)>) {}
  async propose(context: ParserContext) {
    this.calls.push(context);
    let r = this.script[context.transcript];
    if (typeof r === "function") r = r();
    if (!r) throw new Error(`No scripted proposal for: ${context.transcript}`);
    if (r instanceof Error) throw r;
    return r;
  }
}

export class FakeWhatsApp implements WhatsAppGateway {
  sent: { to: string; body: string; replyTo?: string; id: string }[] = [];
  failNext = 0;
  media = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  private n = 0;
  async fetchMedia(mediaId: string) {
    const m = this.media.get(mediaId);
    if (!m) throw new Error("missing media");
    return m;
  }
  async sendText(to: string, body: string, options: { replyTo?: string } = {}) {
    if (this.failNext > 0) { this.failNext--; const { WhatsAppHttpError } = await import("../../server/whatsapp/client"); throw new WhatsAppHttpError(503, null, true); }
    const id = `wamid.out.${++this.n}`;
    this.sent.push({ to, body, replyTo: options.replyTo, id });
    return { messageId: id };
  }
  last() { return this.sent[this.sent.length - 1]; }
}

export function webhookPayload(from: string, wamid: string, message: Record<string, unknown>, nowMs = Date.now()) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: [{ id: wamid, from: from.replace("+", ""), timestamp: String(Math.floor(nowMs / 1000)), ...message }] } }] }],
  };
}
export const ts = (ms: number) => Timestamp.fromMillis(ms);
