import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { VoiceAgent, type Checkpoint } from "./agent/voice-agent.js";
import { msg } from "./agent/messages.js";
import type { InboundPayload } from "./whatsapp/webhook.js";
import type { WhatsAppGateway } from "./whatsapp/client.js";
import type { Handler, Job } from "./jobs.js";

export function createHandlers(db: Firestore, agent: VoiceAgent, whatsapp: WhatsAppGateway, now: () => number = Date.now) {
  const handler: Handler = async (job, save) => {
    const payload = job.payload as unknown as InboundPayload;
    if (job.type === "inbound_message") {
      return agent.process(payload, job.checkpoint as Checkpoint, (c) => save(c as Record<string, unknown>));
    }
    if (job.type === "unknown_sender") {
      // Fixed reply, no data, at most once per number per day.
      const ref = db.doc(`unknownSenders/${payload.from}`);
      const last = (await ref.get()).get("lastRepliedAt") as Timestamp | undefined;
      if (last && now() - last.toMillis() < 86400_000) return;
      if (!(job.checkpoint as Checkpoint).replyWamid) {
        const { messageId } = await whatsapp.sendText(payload.from, msg.unknownSender);
        await save({ replyWamid: messageId });
      }
      await ref.set({ lastRepliedAt: Timestamp.fromMillis(now()) });
    }
  };
  const onDead = async (job: Job) => {
    const payload = job.payload as unknown as InboundPayload;
    if (job.type === "inbound_message" && !(job.checkpoint as Checkpoint).replyWamid) {
      await whatsapp.sendText(payload.from, msg.busy, { replyTo: payload.wamid });
    }
  };
  return { handler, onDead };
}
