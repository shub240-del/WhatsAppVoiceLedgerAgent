import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

export const STALE_MS = 24 * 60 * 60 * 1000;
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** Meta signs the raw request body: X-Hub-Signature-256: sha256=<hex HMAC>. */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string) {
  if (!header || !/^sha256=[0-9a-f]{64}$/.test(header)) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type InboundPayload = {
  shopId: string | null; ownerUid: string | null; wamid: string; from: string;
  messageType: "text" | "audio" | "other"; text: string | null; mediaId: string | null;
  mimeType: string | null; contextWamid: string | null; sentAt: number;
};

type RawMessage = {
  id?: unknown; from?: unknown; timestamp?: unknown; type?: unknown;
  text?: { body?: unknown }; audio?: { id?: unknown; mime_type?: unknown };
  context?: { id?: unknown }; interactive?: { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } };
  button?: { text?: unknown };
};
type RawStatus = { id?: unknown; status?: unknown; timestamp?: unknown; errors?: { code?: unknown }[] };

const WAMID = /^[A-Za-z0-9_.=:+\/-]{1,256}$/;
const str = (v: unknown) => (typeof v === "string" ? v : null);

export function parseMessage(m: RawMessage): Omit<InboundPayload, "shopId" | "ownerUid"> | null {
  const wamid = str(m.id), from = str(m.from), ts = Number(m.timestamp);
  if (!wamid || !WAMID.test(wamid) || !from || !/^\d{8,15}$/.test(from) || !Number.isFinite(ts)) return null;
  const type = str(m.type);
  const interactiveText = str(m.interactive?.button_reply?.title) ?? str(m.interactive?.list_reply?.title) ?? str(m.button?.text);
  const text = type === "text" ? str(m.text?.body) : interactiveText;
  const isAudio = type === "audio" || type === "voice";
  return {
    wamid, from: `+${from}`,
    messageType: isAudio ? "audio" : text ? "text" : "other",
    text: text ? text.slice(0, 2000) : null,
    mediaId: isAudio ? str(m.audio?.id) : null,
    mimeType: isAudio ? str(m.audio?.mime_type) : null,
    contextWamid: str(m.context?.id),
    sentAt: ts * 1000,
  };
}

export type IngestResult = { enqueued: number; duplicates: number; stale: number; invalid: number; statuses: number };

/** Persists events and enqueues jobs. Heavy work happens asynchronously in the worker. */
export async function ingestWebhook(db: Firestore, payload: unknown, now = Date.now()): Promise<IngestResult> {
  const result: IngestResult = { enqueued: 0, duplicates: 0, stale: 0, invalid: 0, statuses: 0 };
  const body = payload as { object?: unknown; entry?: { changes?: { value?: { messages?: RawMessage[]; statuses?: RawStatus[] } }[] }[] };
  if (body?.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) { result.invalid++; return result; }
  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      for (const raw of change.value?.messages ?? []) {
        const message = parseMessage(raw);
        if (!message) { result.invalid++; continue; }
        if (now - message.sentAt > STALE_MS) { result.stale++; continue; }
        const outcome = await enqueueInbound(db, message, now);
        result[outcome]++;
      }
      for (const status of change.value?.statuses ?? []) {
        const id = str(status.id), state = str(status.status);
        if (!id || !WAMID.test(id) || !state || !["sent", "delivered", "read", "failed"].includes(state)) { result.invalid++; continue; }
        await db.doc(`outboundMessages/${sha(id)}`).set(
          { wamid: id, status: state, statusAt: Timestamp.fromMillis(Number(status.timestamp) * 1000 || now), errorCode: status.errors?.[0]?.code ?? null },
          { merge: true },
        );
        result.statuses++;
      }
    }
  }
  return result;
}

async function enqueueInbound(db: Firestore, message: Omit<InboundPayload, "shopId" | "ownerUid">, now: number) {
  const phone = await db.doc(`ownerPhones/${message.from}`).get();
  const known = phone.exists && phone.get("active") !== false;
  const payload: InboundPayload = { ...message, shopId: known ? phone.get("shopId") : null, ownerUid: known ? phone.get("uid") : null };
  const id = sha(message.wamid);
  return db.runTransaction(async (tx) => {
    const dedupe = db.doc(`inboundMessages/${id}`);
    if ((await tx.get(dedupe)).exists) return "duplicates" as const;
    const at = Timestamp.fromMillis(now);
    tx.create(dedupe, { wamid: message.wamid, shopId: payload.shopId, receivedAt: at });
    tx.create(db.doc(`jobs/${id}`), {
      type: known ? "inbound_message" : "unknown_sender", status: "queued", attempts: 0,
      runAfter: at, leaseUntil: null, payload, checkpoint: {}, lastError: null, createdAt: at, updatedAt: at,
    });
    if (known) {
      tx.create(db.doc(`shops/${payload.shopId}/whatsappMessages/${id}`), {
        shopId: payload.shopId, wamid: message.wamid, direction: "in", type: message.messageType,
        contextWamid: message.contextWamid, createdAt: at,
      });
    }
    return "enqueued" as const;
  });
}
