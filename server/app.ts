import { randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";
import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { LedgerService } from "./ledger.js";
import { OnboardingService } from "./onboarding.js";
import { ServiceError, ensure } from "./domain.js";
import { reminderPolicy } from "./adapters.js";
import { integrationStatuses, whatsappConfig } from "./config.js";
import { ingestWebhook, verifySignature } from "./whatsapp/webhook.js";
import { log } from "./log.js";

type Env = Readonly<Record<string, string | undefined>>;
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createApi(store: Firestore, adminAuth: Auth, allowedOrigin: string, options: { env?: Env; now?: () => number } = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const app = express();
  if (!allowedOrigin) throw new Error("ALLOWED_ORIGIN must be the exact frontend origin.");
  const origin = new URL(allowedOrigin);
  if (origin.origin !== allowedOrigin || !["http:", "https:"].includes(origin.protocol)) {
    throw new Error("ALLOWED_ORIGIN must be an exact HTTP(S) origin without a path or wildcard.");
  }
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((req, res, next) => {
    const id = req.get("X-Request-Id");
    res.locals.requestId = id && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    next();
  });

  // --- WhatsApp webhook: no CORS, raw body for signature verification ---
  app.get("/webhooks/whatsapp", (req, res) => {
    const { config } = whatsappConfig(env);
    if (!config) return res.status(503).send("WhatsApp not configured");
    const mode = req.query["hub.mode"], token = req.query["hub.verify_token"], challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && typeof token === "string" && safeEqual(token, config.verifyToken) && typeof challenge === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(challenge)) {
      return res.status(200).type("text/plain").send(challenge);
    }
    return res.sendStatus(403);
  });
  app.post("/webhooks/whatsapp", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const { config } = whatsappConfig(env);
    if (!config) return res.status(503).json({ error: { code: "NOT_CONFIGURED", message: "WhatsApp not configured." } });
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const valid = verifySignature(raw, req.get("X-Hub-Signature-256"), config.appSecret);
    const at = Timestamp.fromMillis(now());
    if (!valid) {
      await store.collection("webhookEvents").add({ receivedAt: at, signatureValid: false, payload: null, expireAt: Timestamp.fromMillis(now() + 30 * 86400_000) }).catch(() => undefined);
      log("warn", "webhook_signature_invalid", { requestId: res.locals.requestId });
      return res.sendStatus(401);
    }
    let payload: unknown;
    try { payload = JSON.parse(raw.toString("utf8")); } catch { return res.sendStatus(400); }
    try {
      const event = await store.collection("webhookEvents").add({ receivedAt: at, signatureValid: true, payload, processedAt: null, expireAt: Timestamp.fromMillis(now() + 30 * 86400_000) });
      const result = await ingestWebhook(store, payload, now());
      await event.update({ processedAt: Timestamp.fromMillis(now()), result });
      log("info", "webhook_ingested", { requestId: res.locals.requestId, ...result });
      return res.status(200).json({ received: true });
    } catch (error) {
      log("error", "webhook_ingest_failed", { requestId: res.locals.requestId, error: error instanceof Error ? error.name : "UnknownError" });
      return res.sendStatus(500); // Meta retries; dedupe makes the retry safe
    }
  });

  app.use(cors({ origin: allowedOrigin, methods: ["GET", "POST", "PATCH", "PUT"], allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"], exposedHeaders: ["X-Request-Id"] }));
  app.use(express.json({ limit: "16kb" }));
  const ledger = new LedgerService(store);
  const onboarding = new OnboardingService(store);
  const budgets = new Map<string, { count: number; reset: number }>();

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", async (req, res, next) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      ensure(token, 401, "AUTH_REQUIRED", "Sign in to continue.");
      let uid: string;
      try {
        uid = (await adminAuth.verifyIdToken(token, true)).uid;
      } catch {
        throw new ServiceError(401, "INVALID_TOKEN", "Your session has expired. Sign in again.");
      }
      const t = now();
      // Bounded single-process guard. Use a shared edge limiter before scaling to multiple API replicas.
      for (const [key, value] of budgets) if (value.reset <= t) budgets.delete(key);
      const budget = budgets.get(uid) || { count: 0, reset: t + 60_000 };
      ensure(++budget.count <= 60, 429, "RATE_LIMITED", "Too many requests. Please wait a minute.");
      budgets.set(uid, budget);
      res.locals.uid = uid;
      next();
    } catch (error) {
      next(error);
    }
  });
  const route = (handler: (req: express.Request, res: express.Response) => Promise<unknown>) =>
    async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try { await handler(req, res); } catch (error) { next(error); }
    };
  app.post("/api/onboarding/shop", route(async (req, res) => {
    const result = await onboarding.createShop(res.locals.uid, req.body);
    res.status(result.created ? 201 : 200).json(result);
  }));
  app.get("/api/owner/phone", route(async (_req, res) => {
    res.json(await onboarding.ownerPhone(res.locals.uid));
  }));
  app.put("/api/owner/phone", route(async (req, res) => {
    res.json(await onboarding.setOwnerPhone(res.locals.uid, req.body));
  }));
  app.post("/api/ledger/actions", route(async (req, res) => {
    res.json(await ledger.execute(res.locals.uid, req.body, req.get("Idempotency-Key")));
  }));
  app.post("/api/customers", route(async (req, res) => {
    res.status(201).json(await ledger.createCustomer(res.locals.uid, req.body, req.get("Idempotency-Key")));
  }));
  app.patch("/api/customers/:id", route(async (req, res) => {
    res.json(await ledger.updateCustomer(res.locals.uid, String(req.params.id), req.body));
  }));
  app.put("/api/customers/:id/reminder-consent", route(async (req, res) => {
    res.json(await ledger.setReminderConsent(res.locals.uid, String(req.params.id), req.body));
  }));
  app.post("/api/entries/:id/edit", route(async (req, res) => {
    res.json(await ledger.editEntry(res.locals.uid, { ...req.body, entryId: String(req.params.id) }, req.get("Idempotency-Key")));
  }));
  app.get("/api/connection", route(async (_req, res) => {
    const owner = await store.doc(`owners/${res.locals.uid}`).get();
    ensure(owner.exists && owner.get("active") === true && owner.get("role") === "owner", 403, "OWNER_REQUIRED", "Owner membership has not been provisioned.");
    const shop = await store.doc(`shops/${owner.get("shopId")}`).get();
    ensure(shop.exists && shop.get("active") === true, 403, "SHOP_INACTIVE", "Shop is not active.");
    res.json({ connected: true, shopId: shop.id, integrations: integrationStatuses(env), reminders: reminderPolicy });
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "The request fields are invalid." } });
    if (error instanceof ServiceError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error instanceof SyntaxError) return res.status(400).json({ error: { code: "INVALID_JSON", message: "Invalid JSON request." } });
    // Never return provider responses, transcripts, credentials or stack traces.
    log("error", "request_failed", { requestId: res.locals.requestId ?? null, error: error instanceof Error ? error.name : "UnknownError" });
    res.status(500).json({ error: { code: "INTERNAL", message: "The operation could not be completed. Retry using the same request key." } });
  });
  return app;
}
