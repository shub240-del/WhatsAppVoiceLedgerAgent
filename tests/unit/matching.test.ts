import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeName, phraseInTranscript, resolveCustomer, transliterate } from "../../server/matching";

const shop = [
  { id: "r1", name: "Ramesh", displayLabel: "Mandir ke paas" },
  { id: "r2", name: "Ramesh", displayLabel: "Dudhwala" },
  { id: "s1", name: "Suresh" },
  { id: "m1", name: "Mukesh", aliases: ["Munna"] },
  { id: "g1", name: "Geeta" },
];
test("Devanagari names transliterate to the Latin key", () => {
  assert.equal(transliterate("रमेश"), "ramesh");
  assert.equal(normalizeName("रमेश"), normalizeName("Ramesh"));
  assert.equal(normalizeName("सुरेश जी"), normalizeName("Suresh"));
});
test("honorifics and particles are ignored", () => assert.equal(normalizeName("Suresh bhai ko"), "sures"));
test("duplicate names are never auto-picked", () => {
  const r = resolveCustomer("Ramesh", shop);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.kind === "ambiguous" && [...r.options].sort(), ["r1", "r2"]);
});
test("a label disambiguates duplicate names", () => assert.deepEqual(resolveCustomer("Ramesh dudhwala", shop), { kind: "unique", id: "r2", score: 1 }));
test("similar names (Suresh/Mukesh/Ramesh) do not cross-match", () => {
  assert.equal(resolveCustomer("Suresh", shop).kind, "unique");
  assert.equal((resolveCustomer("Suresh", shop) as { id: string }).id, "s1");
  assert.equal((resolveCustomer("Mukesh", shop) as { id: string }).id, "m1");
});
test("aliases resolve", () => assert.equal((resolveCustomer("Munna", shop) as { id: string }).id, "m1"));
test("spelling variants resolve (Gita/Geeta)", () => assert.equal((resolveCustomer("Gita", shop) as { id: string }).id, "g1"));
test("unknown names return none, never a guess", () => assert.equal(resolveCustomer("Prakash", shop).kind, "none"));
test("low-score near misses are offered as options, not chosen", () => {
  const r = resolveCustomer("Rakesh", [{ id: "x", name: "Ramesh" }]);
  assert.equal(r.kind, "none");
});
test("evidence phrases must occur in the transcript", () => {
  assert.equal(phraseInTranscript("Ramesh", "Ramesh ko 340 likh do"), true);
  assert.equal(phraseInTranscript("Suresh", "Ramesh ko 340 likh do"), false);
  assert.equal(phraseInTranscript("", "anything"), false);
});
