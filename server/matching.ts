// Server-side customer matching. The model may only pick among candidates the
// server sent, and the server independently re-matches the quoted phrase.

const CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "क़": "k", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f",
};
const VOWELS: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri",
};
const MATRAS: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
};

export function transliterate(text: string): string {
  const chars = [...text.normalize("NFC")];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];
    if (CONSONANTS[c]) {
      out += CONSONANTS[c];
      if (next && MATRAS[next]) { out += MATRAS[next]; i++; }
      else if (next === "्") i++;
      else if (next && (CONSONANTS[next] || next === "ं" || next === "ँ")) out += "a";
      else if (next && !/\s/.test(next)) out += "a";
      // Inherent schwa at word end is dropped (रमेश -> ramesh).
    } else if (VOWELS[c]) out += VOWELS[c];
    else if (c === "ं" || c === "ँ") out += "n";
    else if (c === "़" || c === "ः") continue;
    else out += c;
  }
  return out;
}

const FILLERS = new Set([
  "ji", "jee", "bhai", "bhaiya", "bhaiyya", "didi", "behen", "aunty", "uncle", "seth", "sahab", "saab",
  "ka", "ki", "ke", "ko", "ne", "se", "mr", "mrs", "shri", "smt", "account", "khata", "wale", "wala", "wali",
]);

function phonetic(word: string) {
  return word
    .replace(/aa/g, "a").replace(/ee/g, "i").replace(/ii/g, "i").replace(/oo/g, "u").replace(/uu/g, "u")
    .replace(/w/g, "v").replace(/ph/g, "f").replace(/sh/g, "s").replace(/z/g, "j").replace(/q/g, "k")
    .replace(/ck/g, "k").replace(/(.)\1+/g, "$1")
    .replace(/(.{3,})a$/, "$1");
}

/** Lowercase Latin phonetic key with honorifics/particles removed. */
export function normalizeName(text: string): string {
  return transliterate(text)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter((w) => w && !FILLERS.has(w)).map(phonetic).join(" ");
}

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

export function similarity(a: string, b: string) {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

export type MatchCustomer = { id: string; name: string; displayLabel?: string; aliases?: string[] };
export type Resolution =
  | { kind: "unique"; id: string; score: number }
  | { kind: "ambiguous"; options: string[] }
  | { kind: "none"; options: string[] };

export const MATCH_THRESHOLD = 0.85;

export function rankCustomers(phrase: string, customers: MatchCustomer[]) {
  return customers
    .map((c) => {
      const keys = [c.name, ...(c.aliases ?? []), c.displayLabel ? `${c.name} ${c.displayLabel}` : ""].filter(Boolean);
      return { id: c.id, score: Math.max(...keys.map((k) => similarity(phrase, k))) };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Never auto-picks between two plausible customers (e.g. two "Ramesh"). */
export function resolveCustomer(phrase: string | null | undefined, customers: MatchCustomer[]): Resolution {
  if (!phrase || !normalizeName(phrase)) return { kind: "none", options: [] };
  const ranked = rankCustomers(phrase, customers);
  const plausible = ranked.filter((r) => r.score >= MATCH_THRESHOLD);
  if (plausible.length === 1) {
    const runnerUp = ranked[1]?.score ?? 0;
    if (plausible[0].score - runnerUp >= 0.1) return { kind: "unique", id: plausible[0].id, score: plausible[0].score };
  }
  const near = ranked.filter((r) => r.score >= 0.6).slice(0, 4).map((r) => r.id);
  if (plausible.length >= 1) return { kind: "ambiguous", options: near };
  return { kind: "none", options: near };
}

/** True when the quoted phrase genuinely occurs in the transcript (prevents invented evidence). */
export function phraseInTranscript(phrase: string, transcript: string) {
  const clean = (s: string) => transliterate(s).toLowerCase().replace(/[^a-z0-9₹.\s]/g, " ").replace(/\s+/g, " ").trim();
  const p = clean(phrase);
  return p.length > 0 && clean(transcript).includes(p);
}
