// Structured JSON logs. Never pass secrets, tokens, transcripts or phone numbers here.
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, string | number | boolean | null> = {}) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
