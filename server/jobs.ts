import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { ProviderUnavailable } from "./agent/errors.js";
import { WhatsAppHttpError } from "./whatsapp/client.js";

export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 2 * 60 * 1000;
export type Job = { id: string; type: string; attempts: number; payload: Record<string, unknown>; checkpoint: Record<string, unknown> };
export type Handler = (job: Job, save: (checkpoint: Record<string, unknown>) => Promise<void>) => Promise<void>;

export function isRetryable(error: unknown) {
  if (error instanceof ProviderUnavailable) return true;
  if (error instanceof WhatsAppHttpError) return error.retryable;
  // Firestore/gRPC transient codes: UNAVAILABLE(14), DEADLINE_EXCEEDED(4), ABORTED(10), RESOURCE_EXHAUSTED(8).
  const code = (error as { code?: unknown })?.code;
  return code === 14 || code === 4 || code === 10 || code === 8 || code === "unavailable" || code === "deadline-exceeded";
}

/** Firestore-backed queue (no Redis, no Blaze-only services). Lease-based, bounded retries, dead-letter. */
export class JobQueue {
  constructor(private db: Firestore, private now: () => number = Date.now) {}

  async recoverExpiredLeases() {
    const stuck = await this.db.collection("jobs").where("status", "==", "processing")
      .where("leaseUntil", "<", Timestamp.fromMillis(this.now())).limit(50).get();
    await Promise.all(stuck.docs.map((d) => d.ref.update({ status: "queued", leaseUntil: null, updatedAt: Timestamp.fromMillis(this.now()) })));
    return stuck.size;
  }

  async claim(): Promise<Job | null> {
    const due = await this.db.collection("jobs").where("status", "==", "queued")
      .where("runAfter", "<=", Timestamp.fromMillis(this.now())).orderBy("runAfter").limit(10).get();
    for (const doc of due.docs) {
      const claimed = await this.db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (fresh.get("status") !== "queued") return null;
        const attempts = (fresh.get("attempts") ?? 0) + 1;
        tx.update(doc.ref, { status: "processing", attempts, leaseUntil: Timestamp.fromMillis(this.now() + LEASE_MS), updatedAt: Timestamp.fromMillis(this.now()) });
        return { id: doc.id, type: fresh.get("type"), attempts, payload: fresh.get("payload"), checkpoint: fresh.get("checkpoint") ?? {} } as Job;
      });
      if (claimed) return claimed;
    }
    return null;
  }

  async run(job: Job, handler: Handler, onDead?: (job: Job) => Promise<void>) {
    const ref = this.db.doc(`jobs/${job.id}`);
    const save = async (checkpoint: Record<string, unknown>) => { await ref.update({ checkpoint, updatedAt: Timestamp.fromMillis(this.now()) }); };
    try {
      await handler(job, save);
      await ref.update({ status: "done", leaseUntil: null, lastError: null, updatedAt: Timestamp.fromMillis(this.now()) });
      return "done" as const;
    } catch (error) {
      const name = error instanceof Error ? error.name : "UnknownError";
      if (isRetryable(error) && job.attempts < MAX_ATTEMPTS) {
        const delay = [1000, 3000, 9000][job.attempts - 1] * (0.8 + Math.random() * 0.4);
        await ref.update({ status: "queued", leaseUntil: null, lastError: name, runAfter: Timestamp.fromMillis(this.now() + delay), updatedAt: Timestamp.fromMillis(this.now()) });
        return "retry" as const;
      }
      await ref.update({ status: "dead", leaseUntil: null, lastError: name, updatedAt: Timestamp.fromMillis(this.now()) });
      if (onDead) await onDead(job).catch(() => undefined);
      return "dead" as const;
    }
  }

  /** Admin replay: re-runs a dead job through the same idempotent path. */
  async replay(jobId: string) {
    await this.db.doc(`jobs/${jobId}`).update({ status: "queued", attempts: 0, runAfter: Timestamp.fromMillis(this.now()), updatedAt: Timestamp.fromMillis(this.now()) });
  }
}
