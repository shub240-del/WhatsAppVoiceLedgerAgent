import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenText } from "../../src/lib/speech";

test("replies are read with amounts in words a Hindi voice says clearly", () => {
  assert.equal(spokenText("Ramesh: +₹340 (Maggi). Total baaki: ₹1,240."), "Ramesh: 340 rupaye (Maggi). Total baaki: 1240 rupaye.");
  assert.equal(spokenText("Kaun sa customer?\n1) Ramesh"), "Kaun sa customer?. 1) Ramesh");
});
