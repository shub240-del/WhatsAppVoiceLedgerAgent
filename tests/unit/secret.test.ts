import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServiceAccount } from "../../server/secret";

const key = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";
const json = JSON.stringify({ type: "service_account", project_id: "p", client_email: "a@p.iam.gserviceaccount.com", private_key: key }, null, 2);

test("service account parses cleanly pasted, fenced, NBSP-indented and CRLF values", () => {
  for (const v of [json, "```json\n" + json + "\n```", json.replace(/ {2}/g, "  "), "﻿" + json.replace(/\n/g, "\r\n"), "​" + json]) {
    const parsed = parseServiceAccount(v);
    assert.equal(parsed.private_key, key);
    assert.equal(parsed.client_email, "a@p.iam.gserviceaccount.com");
  }
});

test("bad values fail with a reason that never echoes the secret", () => {
  for (const [v, reason] of [
    [json.slice(0, 60), /not valid JSON/],
    [JSON.stringify({ project_id: "p" }), /missing client_email, private_key/],
    [JSON.stringify({ client_email: "a", private_key: "nope" }), /looks damaged/],
  ] as const) {
    assert.throws(() => parseServiceAccount(v), (e: Error) => reason.test(e.message) && !e.message.includes("BEGIN PRIVATE"));
  }
});
