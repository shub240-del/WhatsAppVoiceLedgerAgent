import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createApi } from "../../server/app";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("API tests require both Auth and Firestore emulators. Live access is forbidden.");
}
const app = initializeApp({ projectId: "demo-udhaar-test" }, "api-tests");
const auth = getAuth(app);
const db = getFirestore(app);
let server: Server;
let base: string;
let token: string;
const WA_ENV = { META_ACCESS_TOKEN: "t", META_PHONE_NUMBER_ID: "123456789", META_BUSINESS_ACCOUNT_ID: "1", META_APP_SECRET: "app-secret-test", META_VERIFY_TOKEN: "verify-me", META_GRAPH_API_VERSION: "v21.0" };

before(async () => {
  await auth.createUser({
    uid: "api-owner",
    email: "owner@example.test",
    password: "local-test-only-82",
  });
  await auth.createUser({
    uid: "api-unlinked",
    email: "unlinked@example.test",
    password: "local-test-only-82",
  });
  await db.doc("owners/api-owner").set({ shopId: "api-shop", active: true, role: "owner" });
  await db.doc("shops/api-shop").set({ name: "API Test Shop", active: true });
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.test",
        password: "local-test-only-82",
        returnSecureToken: true,
      }),
    },
  );
  assert.equal(response.status, 200);
  token = ((await response.json()) as { idToken: string }).idToken;
  server = createApi(db, auth, "http://localhost:8443", { env: WA_ENV }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await db.terminate();
  await deleteApp(app);
});

test("API rejects missing and invalid Firebase ID tokens", async () => {
  assert.equal((await fetch(`${base}/api/connection`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/connection`, {
        headers: { Authorization: "Bearer fabricated-token" },
      })
    ).status,
    401,
  );
});
test("API verifies real emulator token, membership, Firestore connection and disabled integrations", async () => {
  const response = await fetch(`${base}/api/connection`, {
    headers: { Authorization: `Bearer ${token}`, Origin: "http://localhost:8443" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:8443");
  const result = (await response.json()) as {
    shopId: string;
    reminders: { enabled: boolean };
    integrations: { configured: boolean }[];
  };
  assert.equal(result.shopId, "api-shop");
  assert.equal(result.reminders.enabled, false);
  assert.ok(result.integrations.every((p: { configured: boolean }) => !p.configured));
});
test("authenticated HTTP customer creation, credit, payment and reversal preserve financial history", async () => {
  async function post(path: string, body: unknown, key: string) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    });
    assert.ok(response.ok, `HTTP status ${response.status}`);
    return (await response.json()) as { customerId: string; entryId: string; balancePaise: number };
  }
  const customer = await post(
    "/api/customers",
    { name: "Ramesh", displayLabel: "Temple" },
    "http-customer-01",
  );
  const credit = { action: "add_credit", customerId: customer.customerId, amountPaise: 34000 };
  const one = await post("/api/ledger/actions", credit, "http-credit-01");
  const duplicate = await post("/api/ledger/actions", credit, "http-credit-01");
  assert.equal(one.entryId, duplicate.entryId);
  const payment = await post(
    "/api/ledger/actions",
    { action: "add_payment", customerId: customer.customerId, amountPaise: 5050 },
    "http-payment-01",
  );
  assert.equal(payment.balancePaise, 28950);
  const reversed = await post(
    "/api/ledger/actions",
    { action: "undo_entry", entryId: payment.entryId, reason: "Wrong payment" },
    "http-reversal-01",
  );
  assert.equal(reversed.balancePaise, 34000);
  const originals = await db.collection("shops/api-shop/ledgerEntries").get();
  assert.equal(originals.size, 3);
  assert.equal(
    originals.docs.reduce((total, entry) => total + entry.get("signedAmountPaise"), 0),
    34000,
  );
});
async function call(method: string, path: string, body?: unknown, key?: string) {
  return fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test("PATCH customer, consent and entry edit work over HTTP; balance is not client-editable", async () => {
  const created = (await (await call("POST", "/api/customers", { name: "Geeta" }, "http-cust-geeta")).json()) as { customerId: string };
  assert.equal((await call("PATCH", `/api/customers/${created.customerId}`, { aliases: ["Gita"] })).status, 200);
  assert.equal((await call("PATCH", `/api/customers/${created.customerId}`, { balancePaise: 0 })).status, 400);
  assert.equal((await call("PUT", `/api/customers/${created.customerId}/reminder-consent`, { status: "opted_in" })).status, 200);
  const entry = (await (await call("POST", "/api/ledger/actions", { action: "add_credit", customerId: created.customerId, amountPaise: 1000 }, "http-geeta-credit")).json()) as { entryId: string };
  const edit = await call("POST", `/api/entries/${entry.entryId}/edit`, { type: "credit", amountPaise: 2000, reason: "Typo" }, "http-geeta-edit");
  assert.equal(edit.status, 200);
  assert.equal(((await edit.json()) as { balancePaise: number }).balancePaise, 2000);
  assert.equal((await call("POST", `/api/entries/${entry.entryId}/edit`, { type: "credit", amountPaise: 2000, reason: "Typo" })).status, 400);
});
test("cross-shop ids in URLs and bodies are rejected (manipulation attempts)", async () => {
  await db.doc("shops/other-shop").set({ name: "Other", active: true });
  await db.doc("shops/other-shop/customers/victim").set({ name: "Victim", balancePaise: 5000, active: true });
  assert.equal((await call("PATCH", "/api/customers/victim", { name: "Hacked" })).status, 404);
  assert.equal((await call("POST", "/api/ledger/actions", { action: "add_credit", customerId: "victim", amountPaise: 1, shopId: "other-shop" }, "http-cross-01")).status, 400);
  assert.equal((await call("POST", "/api/ledger/actions", { action: "add_credit", customerId: "victim", amountPaise: 1 }, "http-cross-02")).status, 404);
  assert.equal((await db.doc("shops/other-shop/customers/victim").get()).get("name"), "Victim");
});
test("webhook verification handshake requires the exact verify token", async () => {
  const ok = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "12345");
  assert.equal((await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)).status, 403);
});
test("signed webhook is accepted and enqueued once; unsigned or tampered is 401", async () => {
  await db.doc("ownerPhones/+919800000009").set({ uid: "api-owner", shopId: "api-shop", active: true });
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id: "wamid.http.1", from: "919800000009", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "madad" } }] } }] }] });
  const sig = `sha256=${createHmac("sha256", "app-secret-test").update(body).digest("hex")}`;
  const post = (b: string, s?: string) => fetch(`${base}/webhooks/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", ...(s ? { "X-Hub-Signature-256": s } : {}) }, body: b });
  assert.equal((await post(body, sig)).status, 200);
  assert.equal((await post(body, sig)).status, 200); // Meta retry
  assert.equal((await db.collection("jobs").where("payload.wamid", "==", "wamid.http.1").get()).size, 1);
  assert.equal((await post(body)).status, 401);
  assert.equal((await post(body.replace("madad", "evil"), sig)).status, 401);
});
test("connection status lists integration states without secret values", async () => {
  const res = await call("GET", "/api/connection");
  const text = await res.text();
  assert.ok(!text.includes("app-secret-test") && !text.includes("verify-me"));
  assert.match(text, /"provider":"whatsapp","role":"Meta WhatsApp Cloud API","state":"CONFIGURED"/);
  assert.match(text, /DISABLED_BY_POLICY/);
});
test("revoked shop membership is rejected despite a valid Firebase token", async () => {
  await db.doc("owners/api-owner").update({ active: false });
  assert.equal(
    (await fetch(`${base}/api/connection`, { headers: { Authorization: `Bearer ${token}` } }))
      .status,
    403,
  );
});
