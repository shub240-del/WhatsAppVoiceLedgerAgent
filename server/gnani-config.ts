type Environment = Readonly<Record<string, string | undefined>>;

// Server-only. Never import this module into the frontend.
// Source: https://docs.gnani.ai/api/STT/speech-to-text (Prisma STT REST, header X-API-Key-ID).
export const GNANI_LANGUAGES = [
  "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "ta-IN", "te-IN",
] as const;
export const GNANI_MODELS = ["prisma-v3.0", "prisma-v2.5"] as const;
export const GNANI_FORMATS = ["verbatim", "transcribe", "codemix", "transliterate"] as const;
/** Gnani STT REST rejects audio longer than this. */
export const GNANI_MAX_AUDIO_MS = 30_000;

export type GnaniSttConfig = {
  apiKey: string;
  baseUrl: string;
  model: (typeof GNANI_MODELS)[number];
  /** 1–4 language codes (v3.0) sent as a comma-separated `language_code`. */
  languages: string[];
  format: (typeof GNANI_FORMATS)[number];
  timeoutMs: number;
};

export function requireGnaniApiKey(env: Environment = process.env): string {
  const key = env.GNANI_API_KEY?.trim();
  if (!key) throw new Error("GNANI_API_KEY is missing from the server environment.");
  return key;
}

/** Validated STT settings, or a list of problems. Never includes the key in errors. */
export function gnaniSttConfig(env: Environment = process.env):
  | { config: GnaniSttConfig; problems: [] }
  | { config: null; problems: string[] } {
  const problems: string[] = [];
  const apiKey = env.GNANI_API_KEY?.trim() ?? "";
  if (!apiKey) problems.push("GNANI_API_KEY is not set.");
  else if (/\s/.test(apiKey)) problems.push("GNANI_API_KEY contains spaces or line breaks; paste only the key.");

  const baseUrl = (env.GNANI_BASE_URL?.trim() || "https://api.vachana.ai").replace(/\/+$/, "");
  try {
    if (new URL(baseUrl).protocol !== "https:") problems.push("GNANI_BASE_URL must use https.");
  } catch {
    problems.push("GNANI_BASE_URL is not a valid URL.");
  }

  const model = (env.GNANI_STT_MODEL?.trim() || "prisma-v3.0") as GnaniSttConfig["model"];
  if (!GNANI_MODELS.includes(model)) problems.push(`GNANI_STT_MODEL must be one of ${GNANI_MODELS.join(", ")}.`);

  const languages = (env.GNANI_STT_LANGUAGES?.trim() || "hi-IN,en-IN")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  const maxLanguages = model === "prisma-v2.5" ? 1 : 4;
  if (!languages.length || languages.length > maxLanguages)
    problems.push(`GNANI_STT_LANGUAGES must list 1–${maxLanguages} language codes for ${model}.`);
  const unknown = languages.filter((l) => !(GNANI_LANGUAGES as readonly string[]).includes(l));
  if (unknown.length) problems.push(`Unknown language code(s): ${unknown.join(", ")}.`);

  const format = (env.GNANI_STT_FORMAT?.trim() || "verbatim") as GnaniSttConfig["format"];
  if (!GNANI_FORMATS.includes(format)) problems.push(`GNANI_STT_FORMAT must be one of ${GNANI_FORMATS.join(", ")}.`);
  if ((format === "codemix" || format === "transliterate") && model !== "prisma-v3.0")
    problems.push(`GNANI_STT_FORMAT=${format} needs GNANI_STT_MODEL=prisma-v3.0.`);

  if (problems.length) return { config: null, problems };
  return { config: { apiKey, baseUrl, model, languages, format, timeoutMs: 20_000 }, problems: [] };
}

export function gnaniEnvironmentStatus(env: Environment = process.env) {
  const credentialsConfigured = Boolean(env.GNANI_API_KEY?.trim());
  const { config, problems } = gnaniSttConfig(env);
  return {
    credentialsConfigured,
    state: !credentialsConfigured ? "missing_credentials" : config ? "configured" : "invalid",
    model: config?.model ?? null,
    languages: config?.languages ?? null,
    problems,
  } as const;
}
