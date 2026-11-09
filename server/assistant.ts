import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { LedgerService } from "./ledger.js";
import { geminiConfig } from "./config.js";
import { GeminiParser, type EvonParser } from "./agent/gemini.js";
import { VoiceAgent, type Checkpoint } from "./agent/voice-agent.js";
import type { SpeechToText } from "./adapters.js";
import type { WhatsAppGateway } from "./whatsapp/client.js";
import type { InboundPayload } from "./whatsapp/webhook.js";
import { gnaniSttConfig } from "./gnani-config.js";
import { GnaniSpeechToText } from "./gnani-stt.js";
import { ensure } from "./domain.js";
import { msg, UNDO_HINT } from "./agent/messages.js";

type Env = Readonly<Record<string, string | undefined>>;

// Turn ids come from the browser (one UUID per message) so a retried request never double-writes:
// ledger idempotency keys and pending-question ids are derived from it.
const TURN_ID = /^[A-Za-z0-9-]{8,64}$/;
const REPLY_ID = /^web\.[A-Za-z0-9.-]{8,80}$/;
export const MAX_AUDIO_BASE64 = 1_400_000; // ~1 MB of audio: 30 s of 16 kHz mono WAV is ~960 kB

export const assistantInput = z
  .object({
    turnId: z.string().regex(TURN_ID),
    text: z.string().trim().min(1).max(500).optional(),
    audioBase64: z.string().max(MAX_AUDIO_BASE64).optional(),
    mimeType: z.enum(["audio/wav", "audio/x-wav", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac"]).optional(),
    /** The bot reply this message answers (e.g. "galat" on a confirmation, or "2" for an option). */
    replyTo: z.string().regex(REPLY_ID).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.text) !== Boolean(v.audioBase64), "Send either text or audio.")
  .refine((v) => !v.audioBase64 || v.mimeType, "mimeType is required with audio.");

export type AssistantTurn = {
  turnId: string;
  /** What the shop owner said or typed, as understood (transcript for voice). */
  heard: string;
  reply: string;
  /** Id of this reply; send it back as replyTo to answer or undo it. */
  replyId: string | null;
  kind: "saved" | "question" | "undone" | "info";
  entryId: string | null;
  options: { key: number; label: string }[];
};

/**
 * Gateway that keeps replies in memory instead of sending WhatsApp messages, and serves the
 * uploaded audio as the "media". Lets the in-app assistant reuse the WhatsApp agent unchanged.
 */
class CaptureGateway implements WhatsAppGateway {
  sent: { to: string; text: string; messageId: string }[] = [];
  constructor(private turnId: string, private audio: Uint8Array | null, private mime: string | null) {}
  async sendText(to: string, text: string) {
    const messageId = `web.r.${this.turnId}`;
    this.sent.push({ to, text, messageId });
    return { messageId };
  }
  async fetchMedia() {
    ensure(this.audio && this.mime, 400, "NO_AUDIO", "No audio was sent.");
    return { bytes: this.audio!, mimeType: this.mime! };
  }
}

export type AssistantDeps = { parser: EvonParser | null; stt: SpeechToText | null };

export function assistantDeps(env: Env = process.env): AssistantDeps {
  const gemini = geminiConfig(env);
  const gnani = gnaniSttConfig(env);
  return {
    parser: gemini.config ? new GeminiParser(gemini.config) : null,
    stt: gnani.config ? new GnaniSpeechToText(gnani.config) : null,
  };
}

export async function runAssistantTurn(db: Firestore, uid: string, input: unknown, deps: AssistantDeps): Promise<AssistantTurn> {
  const data = assistantInput.parse(input);
  const owner = await db.doc(`owners/${uid}`).get();
  ensure(owner.exists && owner.get("active") === true && owner.get("role") === "owner", 403, "OWNER_REQUIRED", "Create your shop first.");
  const shopId = owner.get("shopId") as string;

  const audio = data.audioBase64 ? new Uint8Array(Buffer.from(data.audioBase64, "base64")) : null;
  const gateway = new CaptureGateway(data.turnId, audio, data.mimeType ?? null);
  const agent = new VoiceAgent({ db, ledger: new LedgerService(db), parser: deps.parser, stt: deps.stt, whatsapp: gateway, channel: "web" });
  const payload: InboundPayload = {
    shopId, ownerUid: uid, wamid: `web.${data.turnId}`, from: `web:${uid}`,
    messageType: audio ? "audio" : "text", text: data.text ?? null,
    mediaId: audio ? `web.${data.turnId}` : null, mimeType: data.mimeType ?? null,
    contextWamid: data.replyTo ?? null, sentAt: Date.now(),
  };
  let checkpoint: Checkpoint = {};
  await agent.process(payload, {}, async (c) => { checkpoint = { ...c }; });

  const decision = checkpoint.decision;
  // WhatsApp wording ("reply to this message with GALAT") is replaced by an Undo button on the website.
  const reply = (checkpoint.replyText ?? (decision?.kind === "reply" ? decision.text : "") ?? "")
    .replace(UNDO_HINT, "")
    .trim();
  const kind: AssistantTurn["kind"] = checkpoint.entryId
    ? "saved"
    : decision?.kind === "ask" || checkpoint.pendingId
      ? "question"
      : decision?.kind === "undo" && ![msg.alreadyReversed, msg.undoTooOld, msg.noEntries, msg.systemError, msg.alreadyDone].includes(reply)
        ? "undone"
        : "info";
  return {
    turnId: data.turnId,
    heard: data.text ?? checkpoint.transcript ?? "",
    reply,
    replyId: checkpoint.replyWamid ?? null,
    kind,
    entryId: checkpoint.entryId ?? null,
    options: decision?.kind === "ask" ? decision.options.map(({ key, label }) => ({ key, label })) : [],
  };
}
