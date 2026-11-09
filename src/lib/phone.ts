/**
 * Turns how owners type phone numbers ("98765 43210", "098765-43210", "+91 98765 43210")
 * into E.164. Returns null for an empty field. Throws a plain-language error otherwise.
 */
export function toE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/[\s().-]/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  throw new Error("Enter a 10-digit mobile number, like 98765 43210.");
}

/** Shows +91 numbers the way owners read them: 98765 43210. */
export function displayPhone(e164?: string | null) {
  if (!e164) return "";
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `${m[1]} ${m[2]}` : e164;
}
