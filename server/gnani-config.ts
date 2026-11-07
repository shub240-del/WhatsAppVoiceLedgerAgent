type Environment = Readonly<Record<string, string | undefined>>;

// Shared by future Gnani adapters. Never import this module into the frontend.
// The key alone does not establish an auth scheme, model name, or endpoint.
export function requireGnaniApiKey(env: Environment = process.env): string {
  const key = env.GNANI_API_KEY?.trim();
  if (!key) throw new Error("GNANI_API_KEY is missing from the server environment.");
  return key;
}

export function gnaniEnvironmentStatus(env: Environment = process.env) {
  const credentialsConfigured = Boolean(env.GNANI_API_KEY?.trim());
  return {
    credentialsConfigured,
    // Only a registered, verified adapter can make the integration ready.
    state: credentialsConfigured ? "awaiting_documentation" : "missing_credentials",
  } as const;
}
