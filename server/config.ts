import { geminiEnvironmentStatus } from "./gemini-config.js";
import { gnaniEnvironmentStatus } from "./gnani-config.js";
import { reminderPolicy } from "./adapters.js";

type Env = Readonly<Record<string, string | undefined>>;
export type IntegrationState = "CONFIGURED" | "NOT_CONFIGURED" | "INVALID" | "BLOCKED_EXTERNALLY" | "DISABLED_BY_POLICY";
export type IntegrationStatus = { provider: string; role: string; state: IntegrationState; detail: string };

export type WhatsAppConfig = {
  accessToken: string; phoneNumberId: string; businessAccountId: string;
  appSecret: string; verifyToken: string; graphVersion: string;
};
export type GeminiConfig = { apiKey: string; model: string };
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const get = (env: Env, key: string) => env[key]?.trim() || "";
const WHATSAPP_KEYS = ["META_ACCESS_TOKEN", "META_PHONE_NUMBER_ID", "META_BUSINESS_ACCOUNT_ID", "META_APP_SECRET", "META_VERIFY_TOKEN", "META_GRAPH_API_VERSION"] as const;

export function whatsappConfig(env: Env = process.env): { config: WhatsAppConfig | null; status: IntegrationStatus } {
  const present = WHATSAPP_KEYS.filter((k) => get(env, k));
  const base = { provider: "whatsapp", role: "Meta WhatsApp Cloud API" };
  if (present.length === 0) return { config: null, status: { ...base, state: "NOT_CONFIGURED", detail: "No META_* variables set." } };
  const missing = WHATSAPP_KEYS.filter((k) => !get(env, k));
  if (missing.length) return { config: null, status: { ...base, state: "INVALID", detail: `Missing: ${missing.join(", ")}` } };
  if (!/^v\d+\.\d+$/.test(get(env, "META_GRAPH_API_VERSION"))) {
    return { config: null, status: { ...base, state: "INVALID", detail: "META_GRAPH_API_VERSION must look like v21.0 (pin the version from Meta's changelog)." } };
  }
  if (!/^\d{5,25}$/.test(get(env, "META_PHONE_NUMBER_ID"))) {
    return { config: null, status: { ...base, state: "INVALID", detail: "META_PHONE_NUMBER_ID must be numeric." } };
  }
  return {
    config: {
      accessToken: get(env, "META_ACCESS_TOKEN"), phoneNumberId: get(env, "META_PHONE_NUMBER_ID"),
      businessAccountId: get(env, "META_BUSINESS_ACCOUNT_ID"), appSecret: get(env, "META_APP_SECRET"),
      verifyToken: get(env, "META_VERIFY_TOKEN"), graphVersion: get(env, "META_GRAPH_API_VERSION"),
    },
    status: { ...base, state: "CONFIGURED", detail: "All variables present. Live connectivity is verified only by a real webhook round trip." },
  };
}

export function geminiConfig(env: Env = process.env): { config: GeminiConfig | null; status: IntegrationStatus } {
  const base = { provider: "gemini", role: "EVON LLM parser" };
  const key = geminiEnvironmentStatus(env).credentialsConfigured;
  // Default: a current stable, fast, low-cost model (ai.google.dev/gemini-api/docs/models).
  // Short sentence -> one JSON action does not need a larger model. Override with APP_GEMINI_MODEL.
  const model = get(env, "APP_GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  if (!key) return { config: null, status: { ...base, state: "NOT_CONFIGURED", detail: "APP_GEMINI_API_KEY not set." } };
  if (!/^[a-z0-9][a-z0-9.\-]{2,80}$/.test(model)) return { config: null, status: { ...base, state: "INVALID", detail: "APP_GEMINI_MODEL has an invalid format." } };
  return {
    config: { apiKey: get(env, "APP_GEMINI_API_KEY"), model },
    status: { ...base, state: "CONFIGURED", detail: `Model ${model}. Key validity is confirmed only by a live call.` },
  };
}

export function integrationStatuses(env: Env = process.env): IntegrationStatus[] {
  const gnani = gnaniEnvironmentStatus(env);
  return [
    whatsappConfig(env).status,
    geminiConfig(env).status,
    { provider: "prisma", role: "Speech-to-text (Gnani Prisma)", state: gnani.state === "configured" ? "CONFIGURED" : gnani.state === "invalid" ? "INVALID" : "NOT_CONFIGURED", detail: gnani.state === "configured" ? `Gnani ${gnani.model}, languages ${gnani.languages?.join(", ")}. Use “Test Gnani key” to confirm it works.` : gnani.problems.join(" ") || "Uses GNANI_API_KEY." },
    { provider: "timbre", role: "Text-to-speech (Gnani Timbre)", state: "NOT_CONFIGURED", detail: "Not needed yet: replies are sent as text. Uses the same GNANI_API_KEY when voice replies are added." },
    { provider: "gnani", role: "Speech AI (PRD 'Gyani')", state: gnani.state === "configured" ? "CONFIGURED" : gnani.state === "invalid" ? "INVALID" : "NOT_CONFIGURED", detail: gnani.state === "configured" ? "GNANI_API_KEY present and settings valid. Live validity is confirmed only by “Test Gnani key”." : gnani.problems.join(" ") },
    { provider: "nvidia", role: "Optional alternative LLM", state: "NOT_CONFIGURED", detail: "Optional. No adapter implemented; Gemini is the active parser." },
    { provider: "reminders", role: "Sunday customer reminders", state: "DISABLED_BY_POLICY", detail: `Policy gate ${reminderPolicy.gate}. Requires written Meta/BSP approval.` },
  ];
}
