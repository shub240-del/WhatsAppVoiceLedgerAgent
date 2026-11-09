import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createApi } from "../../server/app";
import type { Server } from "node:http";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Onboarding tests require both Auth and Firestore emulators. Live access is forbidden.");
}
const app = initializeApp({ projectId: "demo-udhaar-test" }, "onboarding-tests");
const auth = getAuth(app);
const db = getFirestore(app);
let server: Server;
let base: string;
const tokens: Record<string, string> = {};

async function tokenFor(uid: string) {
  const email = `${uid}@example.test`;
  await auth.createUser({ uid, email, password: "local-test-only-82" });
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "local-test-only-82", returnSecureToken: true }),
    },
  );
  return ((await response.json()) as { idToken: string }).idToken;
}
const call = (uid: string, path: string, method: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens[uid]}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

before(async () => {
  for (const uid of ["self-serve-a", "self-serve-b"]) tokens[uid] = await tokenFor(uid);
  server = createApi(db, auth, "http://localhost:8443", { env: {} }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.terminate();
  await deleteApp(app);
});

test("a signed-in owner creates exactly one shop, retry-safe, then can add customers", async () => {
  const before = await call("self-serve-a", "/api/connection", "GET");
  assert.equal(before.status, 403);
  const first = await call("self-serve-a", "/api/onboarding/shop", "POST", {
    shopName: "Sharma General Store",
    ownerPhone: "+919811111111",
  });
  assert.equal(first.status, 201);
  const { shopId } = (await first.json()) as { shopId: string };
  const retry = await call("self-serve-a", "/api/onboarding/shop", "POST", { shopName: "Other" });
  assert.equal(retry.status, 200);
  assert.equal(((await retry.json()) as { shopId: string }).shopId, shopId);
  const shop = await db.doc(`shops/${shopId}`).get();
  assert.equal(shop.get("name"), "Sharma General Store");
  assert.equal(shop.get("remindersEnabled"), false);
  assert.equal((await db.doc("ownerPhones/+919811111111").get()).get("shopId"), shopId);
  const connection = await call("self-serve-a", "/api/connection", "GET");
  assert.equal(connection.status, 200);
  const customer = await fetch(`${base}/api/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens["self-serve-a"]}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "onboarding-customer-1",
    },
    body: JSON.stringify({ name: "Ramesh" }),
  });
  assert.equal(customer.status, 201);
});

test("a WhatsApp number cannot be claimed by a second shop; owners can change their own", async () => {
  const taken = await call("self-serve-b", "/api/onboarding/shop", "POST", {
    shopName: "Gupta Kirana",
    ownerPhone: "+919811111111",
  });
  assert.equal(taken.status, 409);
  assert.equal((await db.doc("owners/self-serve-b").get()).exists, false);
  const created = await call("self-serve-b", "/api/onboarding/shop", "POST", { shopName: "Gupta Kirana" });
  assert.equal(created.status, 201);
  const conflict = await call("self-serve-b", "/api/owner/phone", "PUT", { ownerPhone: "+919811111111" });
  assert.equal(conflict.status, 409);
  const changed = await call("self-serve-a", "/api/owner/phone", "PUT", { ownerPhone: "+919822222222" });
  assert.equal(changed.status, 200);
  assert.equal((await db.doc("ownerPhones/+919811111111").get()).exists, false);
  assert.equal((await db.doc("ownerPhones/+919822222222").get()).get("uid"), "self-serve-a");
  const read = await call("self-serve-a", "/api/owner/phone", "GET");
  assert.deepEqual(await read.json(), { ownerPhone: "+919822222222" });
});

test("shop creation rejects invalid input and unexpected fields such as a chosen shop ID", async () => {
  assert.equal((await call("self-serve-b", "/api/onboarding/shop", "POST", { shopName: "x" })).status, 400);
  assert.equal(
    (await call("self-serve-b", "/api/onboarding/shop", "POST", { shopName: "Valid", shopId: "victim" })).status,
    400,
  );
});
