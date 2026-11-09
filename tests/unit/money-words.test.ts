import { test } from "node:test";
import assert from "node:assert/strict";
import { amountToHinglishWords, extractAmounts, formatRupees, parseAmountPhrase } from "../../server/money-words";

const cases: [string, number | null][] = [
  ["Ramesh ko 340 rupaye ka udhaar likh do", 34000],
  ["teen sau chaalis", 34000],
  ["teen sau chalis rupaye", 34000],
  ["dhai sau", 25000],
  ["saade paanch sau", 55000],
  ["do hazaar paanch sau", 250000],
  ["dedh hazaar", 150000],
  ["paune do sau", 17500],
  ["sava sau", 12500],
  ["1 lakh 20 hazaar", 12000000],
  ["₹1,260", 126000],
  ["Rs350.50", 35050],
  ["das rupaye", 1000],
  ["Add 500 credit for Ramesh", 50000],
  ["two hundred fifty", 25000],
  ["तीन सौ चालीस", 34000],
  ["३४० रुपये", 34000],
  ["do rupaye", 200],
  ["Ramesh ka kitna baaki hai", null],
  ["Ramesh ko aaj ka samaan udhaar likh do", null],
  ["Ramesh 300 aur Suresh 200", null],
];
for (const [phrase, expected] of cases) {
  test(`amount parser: "${phrase}" -> ${expected}`, () => assert.equal(parseAmountPhrase(phrase), expected));
}
test("multiple amounts are all reported so the agent can refuse multi-entry messages", () => {
  assert.deepEqual(extractAmounts("Ramesh 300 aur Suresh 200").sort(), [20000, 30000]);
});
test("weak words like 'likh do' or 'ke saath' are never treated as amounts", () => {
  assert.deepEqual(extractAmounts("Ramesh ke saath likh do"), []);
});
test("Hinglish amount words round-trip exactly for TTS", () => {
  for (const paise of [100, 34000, 126000, 250000, 999900, 12000000]) {
    assert.equal(parseAmountPhrase(amountToHinglishWords(paise)), paise);
  }
  assert.equal(amountToHinglishWords(34000), "teen sau chaalees rupaye");
  assert.throws(() => amountToHinglishWords(0));
  assert.throws(() => amountToHinglishWords(1.5));
});
test("Indian digit grouping for confirmations", () => {
  assert.equal(formatRupees(126000), "₹1,260");
  assert.equal(formatRupees(12600000), "₹1,26,000");
  assert.equal(formatRupees(35050), "₹350.50");
  assert.equal(formatRupees(-1000), "-₹10");
});

test("quantities with units are not amounts; marked totals win", async () => {
  const { extractAmounts } = await import("../../server/money-words");
  const rupees = (t: string) => extractAmounts(t).map((p) => p / 100);
  assert.deepEqual(rupees("Ramesh ne do kilo chawal aur ek Surf liya, udhaar mein, total 340"), [340]);
  assert.deepEqual(rupees("Sunita didi ne teen packet Parle-G aur ek litre doodh liya, 85 rupaye, udhaar"), [85]);
  assert.deepEqual(rupees("paanch kilo aata 250 rupaye Ramesh"), [250]);
  assert.deepEqual(rupees("2 kg cheeni aur 1 dozen ande, kul 180"), [180]);
  assert.deepEqual(rupees("Ramesh bhaiya 2 Fortune tel 360"), [2, 360]); // unclear: the bot asks
});

test("Marathi and Gujarati amounts", async () => {
  const { extractAmounts } = await import("../../server/money-words");
  const rupees = (t: string) => extractAmounts(t).map((p) => p / 100);
  assert.deepEqual(rupees("Ganesh ne don kilo saakhar ghetli, ekshe vees rupaye baaki"), [120]);
  assert.deepEqual(rupees("paachshe rupaye dile"), [500]);
  assert.deepEqual(rupees("don hajar rupaye"), [2000]);
  assert.deepEqual(rupees("Bhavesh e basso rupiya aapya"), [200]);
  assert.deepEqual(rupees("panchso pachas rupiya"), [550]);
});
