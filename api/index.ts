// Vercel serverless entry: serves the trusted ledger API (/api/*), /health and the
// WhatsApp webhook (/webhooks/whatsapp) on the same domain as the frontend.
// Required Vercel env: FIREBASE_SERVICE_ACCOUNT (service-account JSON). Optional: ALLOWED_ORIGIN.
import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let handler: Promise<Handler> | undefined;

function allowedOrigin() {
  if (process.env.ALLOWED_ORIGIN) return process.env.ALLOWED_ORIGIN;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : "";
}

async function load(): Promise<Handler> {
  const [{ createApi }, { adminAuth, store }, { createRuntime }] = await Promise.all([
    import("../server/app.js"),
    import("../server/admin.js"),
    import("../server/runtime.js"),
  ]);
  // WhatsApp is switched off: the assistant lives in the website (/api/assistant).
  // vercel.json no longer routes /webhooks/*. To bring WhatsApp back, restore that rewrite
  // and set WHATSAPP_ENABLED=true; the queue then drains right after Meta's webhook.
  const whatsappEnabled = process.env.WHATSAPP_ENABLED === "true";
  let runtime: ReturnType<typeof createRuntime> | undefined;
  return createApi(store, adminAuth, allowedOrigin(), {
    ...(whatsappEnabled
      ? {
          background: {
            schedule: (task: Promise<unknown>) => waitUntil(task),
            runtime: () => (runtime ??= createRuntime(store)),
            budgetMs: 45_000,
          },
        }
      : {}),
  }) as unknown as Handler;
}

export default async function api(req: IncomingMessage, res: ServerResponse) {
  try {
    handler ??= load();
    (await handler)(req, res);
  } catch (error) {
    handler = undefined;
    console.error("api_init_failed", error instanceof Error ? error.message : "unknown");
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: {
          code: "SERVER_NOT_CONFIGURED",
          message:
            "The Udhaar server isn’t set up yet. Add FIREBASE_SERVICE_ACCOUNT in Vercel project settings and redeploy.",
        },
      }),
    );
  }
}
