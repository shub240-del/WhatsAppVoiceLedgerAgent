import { test } from "node:test";
import assert from "node:assert/strict";
import { drainQueue, type Runtime } from "../../server/runtime";
import type { Job } from "../../server/jobs";

const job = (id: string): Job => ({ id, type: "inbound_message", attempts: 1, payload: {}, checkpoint: {} });

function fakeRuntime(script: { jobs: (Job | null)[]; outcomes: ("done" | "retry" | "dead")[] }) {
  const calls = { recovered: 0, run: [] as string[] };
  const runtime: Runtime = {
    queue: {
      recoverExpiredLeases: async () => { calls.recovered++; return 0; },
      claim: async () => script.jobs.shift() ?? null,
      run: async (j: Job) => { calls.run.push(j.id); return script.outcomes.shift() ?? "done"; },
    } as unknown as Runtime["queue"],
    handler: async () => {},
    onDead: async () => {},
  };
  return { runtime, calls };
}

test("drains every queued job, recovering expired leases first", async () => {
  const { runtime, calls } = fakeRuntime({ jobs: [job("a"), job("b")], outcomes: ["done", "done"] });
  const r = await drainQueue(runtime, { budgetMs: 10_000, sleep: async () => {} });
  assert.deepEqual(r, { done: 2, retried: 0, dead: 0, stoppedBy: "empty" });
  assert.equal(calls.recovered, 1);
  assert.deepEqual(calls.run, ["a", "b"]);
});

test("waits for a retried job inside the budget instead of abandoning it", async () => {
  // a fails transiently, the queue is briefly empty during backoff, then a comes back and succeeds.
  const { runtime, calls } = fakeRuntime({ jobs: [job("a"), null, job("a")], outcomes: ["retry", "done"] });
  let slept = 0;
  const r = await drainQueue(runtime, { budgetMs: 30_000, sleep: async (ms) => { slept += ms; } });
  assert.deepEqual(r, { done: 1, retried: 1, dead: 0, stoppedBy: "empty" });
  assert.equal(slept, 2_000);
  assert.deepEqual(calls.run, ["a", "a"]);
});

test("stops at the time budget and the job cap", async () => {
  let t = 0;
  const slow = fakeRuntime({ jobs: [job("a"), job("b"), job("c")], outcomes: [] });
  slow.runtime.queue.run = (async () => { t += 6_000; return "done"; }) as Runtime["queue"]["run"];
  assert.equal((await drainQueue(slow.runtime, { budgetMs: 10_000, now: () => t })).stoppedBy, "deadline");
  const many = fakeRuntime({ jobs: [job("a"), job("b"), job("c")], outcomes: [] });
  assert.equal((await drainQueue(many.runtime, { budgetMs: 10_000, maxJobs: 2 })).stoppedBy, "max_jobs");
});
