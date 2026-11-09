import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceWords, reminderLink } from "../../src/lib/reminder";

test("reminder link goes to the customer's WhatsApp with a polite, exact message", () => {
  const url = new URL(reminderLink({ name: "Ramesh", phone: "+919876543210", balancePaise: 124000 }, "Sharma Kirana"));
  assert.equal(url.origin + url.pathname, "https://wa.me/919876543210");
  const text = url.searchParams.get("text")!;
  assert.match(text, /Namaste Ramesh ji, Sharma Kirana se/);
  assert.match(text, /₹1,240 baaki/);
});

test("without a phone, WhatsApp opens its contact picker", () => {
  assert.match(reminderLink({ name: "Sunita", balancePaise: 5000 }), /^https:\/\/wa\.me\/\?text=/);
});

test("balance wording never says 'owes' a negative amount", () => {
  assert.equal(balanceWords("Ramesh", 34000), "Ramesh now owes ₹340.");
  assert.equal(balanceWords("Sunita", -20000), "Sunita now has ₹200 advance.");
  assert.equal(balanceWords("Imran", 0), "Imran is fully settled.");
});
