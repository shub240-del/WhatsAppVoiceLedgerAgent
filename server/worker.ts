import { store } from "./admin.js";
import { LedgerService } from "./ledger.js";
import { geminiConfig, integrationStatuses, whatsappConfig } from "./config.js";
import { GeminiParser } from "./agent/gemini.js";
import { VoiceAgent } from "./agent/voice-agent.js";
import { MetaWhatsAppClient } from "./whatsapp/client.js";
import { JobQueue } from "./jobs.js";
import { createHandlers } from "./handlers.js";
import { runReminders } from "./reminders.js";
import { log } from "./log.js";
import { gnaniSttConfig } from "./gnani-config.js";
import { GnaniSpeechToText } from "./gnani-stt.js";

for (const s of integrationStatuses()) log("info", "integration_status", { provider: s.provider, state: s.state });
const wa = whatsappConfig();
if (!wa.config) {
  log("error", "worker_not_started", { reason: "WhatsApp configuration is required to reply to owners." });
  process.exit(1);
}
const gemini = geminiConfig();
const gnani = gnaniSttConfig();
if (!gnani.config) log("warn", "stt_not_configured", { problems: gnani.problems.join(" ") });
const whatsapp = new MetaWhatsAppClient(wa.config);
const agent = new VoiceAgent({
  db: store,
  ledger: new LedgerService(store),
  parser: gemini.config ? new GeminiParser(gemini.config) : null,
  stt: gnani.config ? new GnaniSpeechToText(gnani.config) : null,
  whatsapp,
});
const queue = new JobQueue(store);
const { handler, onDead } = createHandlers(store, agent, whatsapp);
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

let lastRecovery = 0, lastReminderCheck = 0;
while (!stopping) {
  try {
    if (Date.now() - lastRecovery > 30_000) { await queue.recoverExpiredLeases(); lastRecovery = Date.now(); }
    if (Date.now() - lastReminderCheck > 60_000) {
      lastReminderCheck = Date.now();
      const r = await runReminders(store, Date.now()); // policy-gated: logs skip reasons only
      if (r.ran && r.shops) log("info", "reminders_planned", { runKey: r.runKey, shops: r.shops });
    }
    const job = await queue.claim();
    if (!job) { await new Promise((r) => setTimeout(r, 1000)); continue; }
    const started = Date.now();
    const outcome = await queue.run(job, handler, onDead);
    log("info", "job_finished", { jobId: job.id, type: job.type, outcome, attempts: job.attempts, ms: Date.now() - started });
  } catch (error) {
    log("error", "worker_loop_error", { error: error instanceof Error ? error.name : "UnknownError" });
    await new Promise((r) => setTimeout(r, 2000));
  }
}
log("info", "worker_stopped");
