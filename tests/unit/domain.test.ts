import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionSchema,
  checkedBalance,
  parseRupees,
  selectUndo,
  validateAmount,
  type LedgerEntry,
} from "../../server/domain";
import { reminderPolicy } from "../../server/adapters";
import { geminiConfig, integrationStatuses, whatsappConfig } from "../../server/config";
import { rupeesToPaise } from "../../src/lib/money";
import { gnaniEnvironmentStatus, requireGnaniApiKey } from "../../server/gnani-config";
import { geminiEnvironmentStatus, requireGeminiApiKey } from "../../server/gemini-config";

test("money conversion uses exact integer paise", () => {
  for (const [value, expected] of [
    ["340", 34000],
    ["350.50", 35050],
    ["0.01", 1],
    ["0.10", 10],
    ["1.2", 120],
  ] as const) {
    assert.equal(parseRupees(value), expected);
    assert.equal(rupeesToPaise(value), expected);
  }
});
test("invalid and nonpositive money is rejected in server and client parsers", () => {
  for (const value of ["0", "-10", "NaN", "Infinity", "1.001", "1e3", "", ".5", "1,000", "3abc"]) {
    assert.throws(() => parseRupees(value));
    // The dashboard accepts how owners type money ("1,000"); it still sends exact paise.
    if (value !== "1,000") assert.throws(() => rupeesToPaise(value));
  }
  assert.equal(rupeesToPaise("1,000"), 100000);
});
test("credit and payment calculations are exact", () => {
  assert.equal(
    validateAmount(
      actionSchema.parse({ action: "add_credit", customerId: "a", amountPaise: 34000 }) as any,
      92000,
    ),
    126000,
  );
  assert.equal(
    validateAmount(
      actionSchema.parse({ action: "add_payment", customerId: "a", amountPaise: 20000 }) as any,
      126000,
    ),
    106000,
  );
});
test("large amounts and advance payments require separate explicit confirmation", () => {
  const credit = { action: "add_credit", customerId: "c", amountPaise: 10_000_001 };
  assert.throws(
    () => validateAmount(actionSchema.parse(credit) as any, 0),
    /explicit confirmation/,
  );
  assert.equal(
    validateAmount(actionSchema.parse({ ...credit, confirmLargeAmount: true }) as any, 0),
    10_000_001,
  );
  const payment = { action: "add_payment", customerId: "c", amountPaise: 200 };
  assert.throws(() => validateAmount(actionSchema.parse(payment) as any, 100), /advance/);
  assert.equal(
    validateAmount(actionSchema.parse({ ...payment, confirmAdvance: true }) as any, 100),
    -100,
  );
});
test("safe integer bounds and corrupted balances fail closed", () => {
  assert.throws(() => checkedBalance(Number.MAX_SAFE_INTEGER, 1));
  assert.throws(() => checkedBalance(0.1, 1));
  assert.throws(() => checkedBalance(NaN, 1));
});
test("schema rejects multi-actions, foreign shop fields, unknown actions, floats and path injection", () => {
  for (const input of [
    [{ action: "add_credit" }, { action: "add_payment" }],
    { action: "add_credit", customerId: "c", amountPaise: 1, shopId: "another" },
    { action: "set_balance", customerId: "c", amountPaise: 0 },
    { action: "add_credit", customerId: "c", amountPaise: 1.1 },
    { action: "add_credit", customerId: "../other", amountPaise: 1 },
    { action: "undo_entry", entryId: "a", reason: "" },
  ])
    assert.equal(actionSchema.safeParse(input).success, false);
});
const row = (id: string, time: number, type: LedgerEntry["type"] = "credit"): LedgerEntry => ({
  id,
  customerId: "c",
  createdBy: "owner",
  signedAmountPaise: 100,
  type,
  createdAt: { toMillis: () => time },
});
test("undo requires exactly one eligible entry in the ten-minute window", () => {
  const now = 1_000_000;
  assert.equal(selectUndo([row("a", now - 599999)], new Set(), now).id, "a");
  assert.throws(() => selectUndo([row("a", now - 600001)], new Set(), now), /Search/);
  assert.throws(() => selectUndo([row("a", now), row("b", now)], new Set(), now), /Several/);
  assert.throws(() => selectUndo([row("a", now)], new Set(["a"]), now));
  assert.throws(() => selectUndo([row("r", now, "reversal")], new Set(), now));
});
test("integration classifier reports external providers honestly and never echoes secrets", () => {
  const env = { APP_GEMINI_API_KEY: "local-gemini-test-credential", GNANI_API_KEY: "local-gnani-test-credential", PRISMA_API_KEY: "local-prisma-test" };
  const statuses = integrationStatuses(env);
  const state = (p: string) => statuses.find((s) => s.provider === p)?.state;
  assert.equal(state("gemini"), "INVALID"); // key without model
  assert.equal(state("prisma"), "CONFIGURED"); // Gnani Prisma STT via GNANI_API_KEY
  assert.equal(state("timbre"), "NOT_CONFIGURED"); // voice replies not built yet
  assert.equal(state("gnani"), "CONFIGURED");
  assert.equal(state("whatsapp"), "NOT_CONFIGURED");
  assert.equal(state("reminders"), "DISABLED_BY_POLICY");
  const text = JSON.stringify(statuses);
  for (const secret of Object.values(env)) assert.ok(!text.includes(secret));
  assert.deepEqual(reminderPolicy, { enabled: false, gate: "NOT_APPROVED" });
  assert.ok(Object.isFrozen(reminderPolicy));
});
test("Gnani uses one server-only key and rejects absent or whitespace-only credentials", () => {
  for (const env of [{}, { GNANI_API_KEY: "" }, { GNANI_API_KEY: "  " }, { VITE_GNANI_API_KEY: "public-test-value" }]) {
    assert.throws(() => requireGnaniApiKey(env), /missing from the server/);
    assert.equal(gnaniEnvironmentStatus(env).credentialsConfigured, false);
  }
  assert.equal(requireGnaniApiKey({ GNANI_API_KEY: " local-test-credential " }), "local-test-credential");
});
test("Gemini requires the application secret and an explicit model, never host or sandbox keys", () => {
  for (const env of [{}, { APP_GEMINI_API_KEY: "  " }, { GEMINI_API_KEY: "host", GOOGLE_API_KEY: "host" }, { VITE_GEMINI_API_KEY: "public" }]) {
    assert.throws(() => requireGeminiApiKey(env), /APP_GEMINI_API_KEY is missing/);
    assert.equal(geminiEnvironmentStatus(env).credentialsConfigured, false);
  }
  assert.equal(geminiConfig({ APP_GEMINI_API_KEY: "k" }).status.state, "INVALID");
  assert.equal(geminiConfig({ APP_GEMINI_API_KEY: "k", APP_GEMINI_MODEL: "Bad Model!" }).status.state, "INVALID");
  const ok = geminiConfig({ APP_GEMINI_API_KEY: "k", APP_GEMINI_MODEL: "gemini-2.5-flash" });
  assert.equal(ok.status.state, "CONFIGURED");
  assert.equal(ok.config?.model, "gemini-2.5-flash");
});
test("WhatsApp configuration is all-or-nothing with a pinned Graph version", () => {
  const full = { META_ACCESS_TOKEN: "t", META_PHONE_NUMBER_ID: "123456789", META_BUSINESS_ACCOUNT_ID: "99", META_APP_SECRET: "s", META_VERIFY_TOKEN: "v", META_GRAPH_API_VERSION: "v21.0" };
  assert.equal(whatsappConfig(full).status.state, "CONFIGURED");
  assert.equal(whatsappConfig({ ...full, META_APP_SECRET: "" }).status.state, "INVALID");
  assert.equal(whatsappConfig({ ...full, META_GRAPH_API_VERSION: "latest" }).status.state, "INVALID");
  assert.equal(whatsappConfig({ ...full, META_PHONE_NUMBER_ID: "abc" }).status.state, "INVALID");
  assert.ok(!whatsappConfig({ ...full, META_APP_SECRET: "" }).status.detail.includes("t,"));
});
