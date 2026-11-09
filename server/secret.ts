/**
 * Values pasted into dashboards often pick up invisible characters (non-breaking spaces,
 * zero-width spaces, BOM, smart quotes) or Markdown code fences. Normalize those so a
 * correct key is not rejected. Errors never include any part of the value.
 */
export function normalizeSecret(value: string) {
  return value
    .replace(/^﻿/, "")
    .replace(/[​-‍⁠]/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/\r\n?/g, "\n")
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n/, "")
    .replace(/\n?\s*```$/, "")
    .trim();
}

export type ServiceAccount = { project_id?: string; client_email: string; private_key: string };

export function parseServiceAccount(value: string): ServiceAccount {
  const text = normalizeSecret(value);
  let parsed: Partial<ServiceAccount> & { type?: string };
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const where = error instanceof Error ? (/position \d+/.exec(error.message)?.[0] ?? "") : "";
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT is not valid JSON${where ? ` (${where}, length ${text.length})` : ""}. Paste the whole key file, from { to }.`,
    );
  }
  const missing = (["client_email", "private_key"] as const).filter((k) => !parsed[k]);
  if (missing.length)
    throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing ${missing.join(", ")}. Paste the whole key file.`);
  if (!/-----BEGIN PRIVATE KEY-----/.test(parsed.private_key!))
    throw new Error("FIREBASE_SERVICE_ACCOUNT private_key looks damaged. Generate a new key and paste the whole file.");
  return parsed as ServiceAccount;
}
