import { test } from "node:test";
import assert from "node:assert/strict";
import { rupeesToPaise } from "../../src/lib/money";
import { displayPhone, toE164 } from "../../src/lib/phone";

test("amounts accept how owners type them and stay exact in paise", () => {
  assert.equal(rupeesToPaise("340"), 34000);
  assert.equal(rupeesToPaise("1,200"), 120000);
  assert.equal(rupeesToPaise("₹ 500"), 50000);
  assert.equal(rupeesToPaise("Rs. 50.50"), 5050);
  assert.equal(rupeesToPaise(" 1,00,000.5 "), 10000050);
  for (const bad of ["", "abc", "0", "12.345", "-5", "1e3"]) assert.throws(() => rupeesToPaise(bad));
});

test("phone numbers accept 10-digit Indian mobiles and normalize to E.164", () => {
  assert.equal(toE164(""), null);
  assert.equal(toE164("98765 43210"), "+919876543210");
  assert.equal(toE164("098765-43210"), "+919876543210");
  assert.equal(toE164("91 9876543210"), "+919876543210");
  assert.equal(toE164("+91 98765 43210"), "+919876543210");
  assert.equal(toE164("+14155550123"), "+14155550123");
  for (const bad of ["12345", "5876543210", "phone"]) assert.throws(() => toE164(bad));
  assert.equal(displayPhone("+919876543210"), "98765 43210");
});
