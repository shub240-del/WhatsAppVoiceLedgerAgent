import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../../server/agent/decide";
import { proposalSchema } from "../../server/agent/schema";
import { EVAL_CASES, EVAL_CUSTOMERS, outcome, runParserEval } from "../../server/eval/parser-cases";
import { SYSTEM_INSTRUCTION } from "../../server/agent/gemini";

test("eval set covers the spec: ≥15 cases incl. Marathi, Gujarati, missing amount, new customer, garbled", () => {
  assert.ok(EVAL_CASES.length >= 15);
  for (const lang of ["mr", "gu"]) assert.ok(EVAL_CASES.some((c) => c.language === lang));
  for (const e of ["ask:amount", "ask:customer", "reject:unsupported", "find:undo:m1", "balance:m1"]) assert.ok(EVAL_CASES.some((c) => c.expected === e), e);
});

for (const c of EVAL_CASES) {
  test(`server layer: case ${c.id} (${c.label}) → ${c.expected}`, () => {
    assert.ok(proposalSchema.safeParse(c.ideal).success, "ideal proposal must match the schema");
    assert.equal(outcome(decide(c.ideal, c.transcript, EVAL_CUSTOMERS)), c.expected);
  });
}

test("every few-shot example in the prompt is a schema-valid proposal", () => {
  const examples = SYSTEM_INSTRUCTION.split("\n").filter((l) => l.startsWith("{"));
  assert.equal(examples.length, 9);
  for (const e of examples) assert.ok(proposalSchema.safeParse(JSON.parse(e)).success, e);
});

test("runParserEval scores a perfect parser 16/16 and records errors as failures", async () => {
  const byTranscript = new Map(EVAL_CASES.map((c) => [c.transcript, c.ideal]));
  const perfect = await runParserEval({ propose: async (ctx) => byTranscript.get(ctx.transcript)! });
  assert.equal(perfect.filter((r) => r.pass).length, EVAL_CASES.length);
  const broken = await runParserEval({ propose: async () => { throw new Error("quota"); } }, EVAL_CASES.slice(0, 2));
  assert.deepEqual(broken.map((r) => r.got), ["error", "error"]);
});
