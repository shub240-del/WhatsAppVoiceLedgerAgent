type Environment = Readonly<Record<string, string | undefined>>;

// Server-only. Use the application's key explicitly; never fall back to host/sandbox keys.
export function requireGeminiApiKey(env: Environment = process.env): string {
  const key = env.APP_GEMINI_API_KEY?.trim();
  if (!key) throw new Error("APP_GEMINI_API_KEY is missing from the server environment.");
  return key;
}

export function geminiEnvironmentStatus(env: Environment = process.env) {
  const credentialsConfigured = Boolean(env.APP_GEMINI_API_KEY?.trim());
  return {
    credentialsConfigured,
    // A credential is not a model selection, a verified adapter, or permission to make paid calls.
    state: credentialsConfigured ? "awaiting_model_selection" : "missing_credentials",
  } as const;
}
