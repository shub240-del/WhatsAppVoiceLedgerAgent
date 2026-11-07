import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUpiLink, dueRunKey, eligibility, istParts, reminderText } from "../../server/reminders";

const base = { balancePaise: 34000, phone: "+919876543210", consent: "opted_in", shopEnabled: true, policyEnabled: true };
test("schedule: Sunday 18:00 IST is due; 17:59 and Monday are not", () => {
  assert.equal(dueRunKey(Date.parse("2026-11-08T12:30:00Z")), "2026-11-08"); // 18:00 IST Sunday
  assert.equal(dueRunKey(Date.parse("2026-11-08T12:29:00Z")), null);
  assert.equal(dueRunKey(Date.parse("2026-11-09T12:30:00Z")), null);
  assert.equal(istParts(Date.parse("2026-11-08T18:31:00Z")).weekday, 1); // after IST midnight
});
test("eligible only with balance, phone, opt-in, shop enabled and policy GO", () => assert.deepEqual(eligibility(base), { eligible: true }));
for (const [patch, reason] of [
  [{ balancePaise: 0 }, "zero_balance"],
  [{ balancePaise: -500 }, "zero_balance"],
  [{ phone: null }, "no_phone"],
  [{ phone: "98765" }, "no_phone"],
  [{ consent: "unknown" }, "no_opt_in"],
  [{ consent: "opted_out" }, "opted_out"],
  [{ shopEnabled: false }, "shop_disabled"],
  [{ policyEnabled: false }, "policy_blocked"],
] as const) {
  test(`reminder skip reason: ${reason} (${JSON.stringify(patch)})`, () => assert.deepEqual(eligibility({ ...base, ...patch }), { eligible: false, reason }));
}
test("UPI link carries only this customer's exact amount", () => {
  const link = buildUpiLink({ vpa: "shop@okaxis", payeeName: "Sharma Store", amountPaise: 35050, note: "Hisaab" });
  const url = new URL(link);
  assert.equal(url.protocol, "upi:");
  assert.equal(url.searchParams.get("am"), "350.50");
  assert.equal(url.searchParams.get("cu"), "INR");
  assert.throws(() => buildUpiLink({ vpa: "bad vpa", payeeName: "x", amountPaise: 1, note: "" }));
  assert.throws(() => buildUpiLink({ vpa: "a@b", payeeName: "x", amountPaise: 0, note: "" }));
});
test("reminder text is polite and contains only that customer", () => {
  const text = reminderText("Ramesh", 126000, "Sharma Store");
  assert.match(text, /Ramesh ji/);
  assert.match(text, /₹1,260/);
  assert.doesNotMatch(text, /turant|warna|legal|police/i);
});
