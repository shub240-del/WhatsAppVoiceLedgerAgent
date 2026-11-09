// Deterministic, integer-only amount parsing for Hindi, Hinglish, English, Marathi and Gujarati.
// All arithmetic happens in paise. The model's amount is never trusted without
// an independent server parse of the quoted transcript phrase.

const HINDI_1_99 = [
  "", "ek", "do", "teen", "chaar", "paanch", "chhah", "saat", "aath", "nau", "das",
  "gyaarah", "baarah", "terah", "chaudah", "pandrah", "solah", "satrah", "athaarah", "unnees", "bees",
  "ikkees", "baaees", "teis", "chaubees", "pachchees", "chhabbees", "sattaaees", "atthaaees", "untees", "tees",
  "iktees", "battees", "taintees", "chauntees", "paintees", "chhattees", "saintees", "adtees", "untaalees", "chaalees",
  "iktaalees", "bayaalees", "taintaalees", "chavaalees", "paintaalees", "chhiyaalees", "saintaalees", "adtaalees", "unchaas", "pachaas",
  "ikyaavan", "baavan", "tirpan", "chauvan", "pachpan", "chhappan", "sattaavan", "atthaavan", "unsath", "saath",
  "iksath", "baasath", "tirsath", "chausath", "painsath", "chhiyaasath", "sadsath", "adsath", "unhattar", "sattar",
  "ikhattar", "bahattar", "tihattar", "chauhattar", "pachhattar", "chhihattar", "satattar", "athattar", "unyaasi", "assi",
  "ikyaasi", "bayaasi", "tiraasi", "chauraasi", "pachaasi", "chhiyaasi", "sattaasi", "atthaasi", "navaasi", "nabbe",
  "ikyaanave", "baanave", "tiraanave", "chauraanave", "pachaanave", "chhiyaanave", "sattaanave", "atthaanave", "ninyaanave",
];

// Common alternate spellings heard in Hinglish transcripts.
const VARIANTS: Record<string, number> = {
  tin: 3, char: 4, panch: 5, chhe: 6, che: 6, chah: 6, chhay: 6, aath: 8, dus: 10,
  gyara: 11, gyarah: 11, bara: 12, barah: 12, tera: 13, chauda: 14, pandra: 15, sola: 16,
  satra: 17, athara: 18, atharah: 18, unnis: 19, bis: 20, ikkis: 21, bais: 22, chaubis: 24,
  pachis: 25, pachchis: 25, tis: 30, chalis: 40, chaalis: 40, pachas: 50, sath: 60,
  satar: 70, sattar: 70, asi: 80, nabe: 90, nabbe: 90,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7,
  "आठ": 8, "नौ": 9, "दस": 10, "बीस": 20, "पच्चीस": 25, "तीस": 30, "चालीस": 40, "पचास": 50,
  "साठ": 60, "सत्तर": 70, "अस्सी": 80, "नब्बे": 90,
  // Marathi (romanised as Gnani/LLMs transcribe it). "-she" = hundreds: ekshe vees = 120.
  don: 2, paach: 5, saha: 6, daha: 10, akra: 11, pandhra: 15, athra: 18, ekonis: 19, vees: 20,
  ekvees: 21, pannas: 50, ainshi: 80, aenshi: 80, navvad: 90, shambhar: 100,
  ekshe: 100, donshe: 200, teenshe: 300, charshe: 400, chaarshe: 400, paachshe: 500, sahashe: 600,
  satshe: 700, saatshe: 700, aathshe: 800, naushe: 900, dedhshe: 150, adichshe: 250,
  // Gujarati. "-so" = hundreds: basso = 200, panchso = 500.
  be: 2, tran: 3, chha: 6, nav: 9, agiyar: 11, ter: 13, chaud: 14, pandar: 15, sol: 16,
  trees: 30, sitter: 70, sittar: 70, ensi: 80, nevu: 90,
  ekso: 100, basso: 200, transo: 300, charso: 400, panchso: 500, chhaso: 600,
  satso: 700, athso: 800, navso: 900, dodhso: 150, adhiso: 250,
};
const MULTIPLIERS: Record<string, number> = {
  sau: 100, hundred: 100, "सौ": 100,
  hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000, thousand: 1000, "हजार": 1000, "हज़ार": 1000,
  lakh: 100_000, lac: 100_000, lakhs: 100_000, "लाख": 100_000,
  crore: 10_000_000, karod: 10_000_000, "करोड़": 10_000_000,
};
// Fractions in paise-of-one-unit: dhai = 2.5, dedh = 1.5.
const FRACTIONS: Record<string, number> = { dhai: 250, dhaai: 250, dedh: 150, dedth: 150, "ढाई": 250, "डेढ़": 150 };
const MODIFIERS: Record<string, number> = { saade: 50, sade: 50, sadhe: 50, "साढ़े": 50, sava: 25, savaa: 25, "सवा": 25, paune: -25, "पौने": -25 };
const CURRENCY = new Set([
  "rupaye", "rupay", "rupee", "rupees", "rupiya", "rupiye", "rupya", "rupaya", "rupaiya", "rupyache", "rs", "inr", "₹",
  "रुपये", "रुपए", "रुपया",
]);
// Words that are also common non-number words ("likh do", "ke saath", Gujarati "be", Marathi "don").
const WEAK = new Set(["do", "ek", "sath", "saath", "one", "be", "don", "bar", "sol", "ter", "nav", "दो", "एक"]);
// A number directly followed by a unit is a quantity ("teen packet", "do kilo"), never the amount.
const UNITS = new Set([
  "kilo", "kg", "kgs", "kilogram", "gram", "grams", "gm", "gms", "g", "litre", "liter", "litres", "ltr", "lit",
  "ml", "packet", "packets", "pkt", "pack", "dozen", "darjan", "piece", "pieces", "pcs", "pc", "nag", "bottle",
  "bottles", "bori", "bag", "bags", "thaili", "box", "dabba", "dabbe", "pav", "pao", "paav", "meter", "metre",
  "plate", "cup", "glass", "jar", "pouch", "tin", "strip", "tablet", "tablets", "anda", "ande", "egg", "eggs",
  "किलो", "पैकेट", "लीटर", "दर्जन",
]);
// Words that mark the following number as the bill total ("total 340", "kul 85").
const TOTAL_MARKERS = new Set(["total", "totel", "tottal", "kul", "ekun", "kul milakar", "टोटल", "कुल"]);

function squash(word: string) {
  return word.replace(/aa/g, "a").replace(/ee/g, "i").replace(/ii/g, "i").replace(/oo/g, "u").replace(/w/g, "v");
}
const NUMBER_WORDS = new Map<string, number>();
HINDI_1_99.forEach((word, n) => word && NUMBER_WORDS.set(squash(word), n));
for (const [word, n] of Object.entries(VARIANTS)) NUMBER_WORDS.set(squash(word), n);

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
function tokenize(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/₹/g, " ₹ ")
    .replace(/(\d)([a-z\u0900-\u097f])/g, "$1 $2")
    .replace(/([a-z\u0900-\u097f])(\d)/g, "$1 $2");
  return normalized.split(/[^a-z0-9.₹\u0900-\u097f]+/).filter(Boolean);
}

function lookup(token: string, table: Record<string, number>) {
  return table[token] ?? table[squash(token)];
}

type Group = { paise: number; weakOnly: boolean; currency: boolean; marked: boolean };

/** Extracts every distinct amount mentioned in a phrase, in paise. */
export function extractAmounts(text: string): number[] {
  const groups: Group[] = [];
  let total = 0, current = 0, active = false, weakOnly = true, modifier = 0, hasDigits = false;
  let marked = false, previous = "";
  const reset = () => {
    total = 0; current = 0; active = false; weakOnly = true; modifier = 0; hasDigits = false; marked = false;
  };
  const close = (currency = false) => {
    if (active) groups.push({ paise: total + current, weakOnly, currency, marked: marked || currency });
    reset();
  };
  const start = () => {
    if (!active) marked = TOTAL_MARKERS.has(previous);
  };
  for (const token of tokenize(text)) {
    if (UNITS.has(token)) {
      // Quantity, not money: "teen packet", "2 kg". Drop the group instead of recording it.
      if (active) reset();
      previous = token;
      continue;
    }
    if (/^\d{1,12}(\.\d{1,2})?$/.test(token)) {
      if (hasDigits || current !== 0) close();
      start();
      const [whole, fraction = ""] = token.split(".");
      current = Number(whole) * 100 + Number(fraction.padEnd(2, "0")) + modifier;
      modifier = 0; active = true; weakOnly = false; hasDigits = true;
      continue;
    }
    if (/^\d/.test(token)) { close(); continue; }
    const number = NUMBER_WORDS.get(squash(token)) ?? VARIANTS[token];
    const multiplier = lookup(token, MULTIPLIERS);
    const fraction = lookup(token, FRACTIONS);
    const mod = lookup(token, MODIFIERS);
    if (mod !== undefined) { modifier = mod; continue; }
    if (fraction !== undefined) { start(); current += fraction; active = true; weakOnly = false; continue; }
    if (number !== undefined) {
      start();
      current += number * 100 + modifier;
      modifier = 0; active = true;
      if (!WEAK.has(token) && !WEAK.has(squash(token))) weakOnly = false;
      continue;
    }
    if (multiplier !== undefined) {
      // "sava sau" = 1.25 x 100: a modifier with no number applies to an implied one.
      const base = current || 100 + modifier;
      modifier = 0;
      if (multiplier >= 1000) { total += base * multiplier; current = 0; }
      else current = base * multiplier;
      active = true; weakOnly = false; hasDigits = false;
      continue;
    }
    close(CURRENCY.has(token));
    previous = token;
  }
  close();
  const kept = groups.filter((g) => g.paise > 0 && (!g.weakOnly || g.currency));
  // Several numbers but exactly one marked as money ("… 2 Fortune tel, total 360"): that one is the amount.
  const values = [...new Set(kept.map((g) => g.paise))];
  if (values.length > 1) {
    const markedValues = [...new Set(kept.filter((g) => g.marked).map((g) => g.paise))];
    if (markedValues.length === 1) return markedValues;
  }
  return values;
}

/** Returns the single amount in a phrase, or null when absent or ambiguous. */
export function parseAmountPhrase(text: string): number | null {
  const amounts = extractAmounts(text);
  return amounts.length === 1 && Number.isSafeInteger(amounts[0]) ? amounts[0] : null;
}

function underHundred(n: number) {
  return HINDI_1_99[n];
}
function rupeeWords(rupees: number): string {
  if (rupees === 0) return "shunya";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const hundred = Math.floor((rupees % 1000) / 100);
  const rest = rupees % 100;
  if (crore) parts.push(`${rupeeWords(crore)} crore`);
  if (lakh) parts.push(`${underHundred(lakh)} lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} hazaar`);
  if (hundred) parts.push(`${underHundred(hundred)} sau`);
  if (rest) parts.push(underHundred(rest));
  return parts.join(" ");
}

/** Hinglish words for TTS ("teen sau chaalees rupaye"), verified by round-trip parse. */
export function amountToHinglishWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise <= 0) throw new Error("Amount must be positive integer paise.");
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  const words = [rupees ? `${rupeeWords(rupees)} rupaye` : "", remainder ? `${underHundred(remainder)} paise` : ""]
    .filter(Boolean).join(" ");
  if (!remainder && parseAmountPhrase(words) !== paise) throw new Error("Amount words failed verification.");
  return words;
}

/** Indian digit grouping: 126000 paise -> "₹1,260"; 35050 -> "₹350.50". */
export function formatRupees(paise: number) {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toString();
  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  const fraction = abs % 100 ? `.${String(abs % 100).padStart(2, "0")}` : "";
  return `${negative ? "-" : ""}₹${grouped}${fraction}`;
}
