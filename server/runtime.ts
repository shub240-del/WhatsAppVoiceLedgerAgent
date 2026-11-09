import type { Firestore } from "firebase-admin/firestore";
import { LedgerService } from "./ledger.js";
import { geminiConfig, whatsappConfig } from "./config.js";
import { GeminiParser } from "./agent/gemini.js";
import { VoiceAgent } from "./agent/voice-agent.js";
import { MetaWhatsAppClient } from "./whatsapp/client.js";
import { JobQueue, type Handler, type Job } from "./jobs.js";
import { createHandlers } from "./handlers.js";
import { gnaniSttConfig } from "./gnani-config.js";
import { GnaniSpeechToText } from "./gnani-stt.js";

type Env = Readonly<Record<string, string | undefined>>;

export type Runtime = { queue: QueueLike; handler: Handler; onDead: (job: Job) => Promise<void> };
export type QueueLike = Pick<JobQueue, "claim" | "run" | "recoverExpiredLeases">;

/**
 * Builds the voice pipeline (WhatsApp + Gnani STT + Gemini parser + ledger) from the environment.
 * Shared by the long-running worker and the serverless webhook. Null when WhatsApp is not configured,
 * because without it the bot cannot reply to anyone.
 */
export function createRuntime(db: Firestore, env: Env = process.env): Runtime | null {
  const wa = whatsappConfig(env);
  if (!wa.config) return null;
  const gemini = geminiConfig(env);
  const gnani = gnaniSttConfig(env);
  const whatsapp = new MetaWhatsAppClient(wa.config);
  const agent = new VoiceAgent({
    db,
    ledger: new LedgerService(db),
    parser: gemini.config ? new GeminiParser(gemini.config) : null,
    stt: gnani.config ? new GnaniSpeechToText(gnani.config) : null,
    whatsapp,
  });
  const { handler, onDead } = createHandlers(db, agent, whatsapp);
  return { queue: new JobQueue(db), handler, onDead };
}

export type DrainResult = { done: number; retried: number; dead: number; stoppedBy: "empty" | "deadline" | "max_jobs" };

/**
 * Processes queued jobs until the queue is empty, a job budget is used, or the time budget runs out.
 * Retryable failures are rescheduled by the queue (1–9 s backoff); when only such jobs remain we wait
 * for them inside the budget instead of leaving them for a worker that serverless hosting never runs.
 */
export async function drainQueue(
  runtime: Runtime,
  opts: { budgetMs: number; maxJobs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = { budgetMs: 45_000 },
): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + opts.budgetMs;
  const maxJobs = opts.maxJobs ?? 20;
  const result: DrainResult = { done: 0, retried: 0, dead: 0, stoppedBy: "empty" };
  await runtime.queue.recoverExpiredLeases();
  let runs = 0;
  let idleChecks = 0;
  const awaitingRetry = new Set<string>();
  while (now() < deadline) {
    if (runs >= maxJobs) {
      result.stoppedBy = "max_jobs";
      return result;
    }
    const job = await runtime.queue.claim();
    if (!job) {
      // A job may be waiting out its retry backoff (≤ ~11 s). Give it a few chances within the budget.
      if (awaitingRetry.size > 0 && idleChecks < 6 && now() + 2_000 < deadline) {
        idleChecks++;
        await sleep(2_000);
        continue;
      }
      result.stoppedBy = "empty";
      return result;
    }
    idleChecks = 0;
    runs++;
    const outcome = await runtime.queue.run(job, runtime.handler, runtime.onDead);
    if (outcome === "retry") {
      result.retried++;
      awaitingRetry.add(job.id);
      continue;
    }
    awaitingRetry.delete(job.id);
    if (outcome === "done") result.done++;
    else result.dead++;
  }
  result.stoppedBy = "deadline";
  return result;
}
