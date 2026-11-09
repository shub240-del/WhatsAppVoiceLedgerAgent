import { test } from "node:test";
import assert from "node:assert/strict";
import { demoReply, demoStart, HINT } from "../../src/lib/demo-bot";

const say = (lines: string[]) => {
  let state = demoStart();
  const replies: string[] = [];
  for (const l of lines) {
    const t = demoReply(state, l);
    state = t.state;
    replies.push(t.reply);
  }
  return { state, replies };
};
const bal = (s: ReturnType<typeof demoStart>, n: string) => s.customers.find((c) => c.name === n)?.paise;

test("udhaar with items: exact assistant wording and the new balance", () => {
  const { state, replies } = say(["Ramesh ko 340 ka udhaar, do Maggi aur doodh"]);
  assert.equal(replies[0], `Ramesh: +₹340 (Maggi, doodh). Total baaki: ₹1,240. ${HINT}`);
  assert.equal(bal(state, "Ramesh"), 124000);
});

test("payment, and a payment above the balance asks about advance first", () => {
  const { state, replies } = say(["Sunita ne 200 diye", "Sunita ne 2000 diye", "nahi"]);
  assert.equal(replies[0], `Sunita: ₹200 mile. Total baaki: ₹450. ${HINT}`);
  assert.match(replies[1], /₹2,000 baaki \(₹450\) se zyada hai\. Advance maanein\?/);
  assert.equal(replies[2], "Theek hai, kuch save nahi kiya.");
  assert.equal(bal(state, "Sunita"), 45000);
});

test("a new name is only added after 'Haan', and GALAT undoes it", () => {
  const { state, replies } = say(["Kishore ko 250 ka udhaar", "1", "GALAT"]);
  assert.match(replies[0], /“Kishore” naam ka koi customer nahi hai/);
  assert.match(replies[1], /^Kishore naye customer jud gaye\. Kishore: \+₹250\. Total baaki: ₹250\./);
  assert.equal(replies[2], "₹250 ka entry hata diya (reversal darj hua). Kishore ji ka baaki ab ₹0 hai.");
  assert.equal(bal(state, "Kishore"), 0);
  const { state: s2 } = say(["Kishore ko 250 ka udhaar", "2"]);
  assert.equal(bal(s2, "Kishore"), undefined);
});

test("balance lists recent entries; cancelled ones are marked", () => {
  const { replies } = say(["Ramesh ko 340 ka udhaar", "galat", "Ramesh ka kitna baaki hai?"]);
  assert.equal(replies[2], "Ramesh ji ka baaki ₹900 hai.\nPichli entries:\n1) Udhaar ₹340 (hata diya)\n2) Udhaar ₹900");
});

test("nothing to undo, and nonsense, change nothing", () => {
  const { state, replies } = say(["galat", "kal barish hogi"]);
  assert.equal(replies[0], "Aisi koi entry nahi mili. Kuch nahi badla.");
  assert.match(replies[1], /Samajh nahi aaya, kuch save nahi hua/);
  assert.deepEqual(state.customers, demoStart().customers);
});
