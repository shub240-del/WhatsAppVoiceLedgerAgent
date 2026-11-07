import { test, expect, type Page } from "@playwright/test";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createApi } from "../../server/app";

const DIST = "/tmp/udhaar-e2e-dist";
const ORIGIN = "http://127.0.0.1:3999";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error("Run under the Firebase emulators.");
const app = initializeApp({ projectId: "demo-udhaar-test" }, "e2e");
const db = getFirestore(app);
const auth = getAuth(app);
let server: Server;

test.beforeAll(async () => {
  if (!existsSync(path.join(DIST, "index.html")))
    throw new Error("Build the e2e bundle first (see docs/TESTING_REPORT.md).");
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-udhaar-test/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-udhaar-test/accounts`,
    { method: "DELETE" },
  );
  await auth.createUser({ uid: "e2e-owner", email: "owner@e2e.test", password: "e2e-password-1" });
  await auth.createUser({
    uid: "e2e-intruder",
    email: "intruder@e2e.test",
    password: "e2e-password-2",
  });
  await db
    .doc("shops/e2e-shop")
    .set({ name: "Sharma Kirana", active: true, language: "hinglish", remindersEnabled: false });
  await db.doc("owners/e2e-owner").set({ shopId: "e2e-shop", role: "owner", active: true });
  await db
    .doc("shops/e2e-shop/customers/ramesh")
    .set({
      name: "Ramesh",
      displayLabel: "Mandir ke paas",
      aliases: [],
      active: true,
      balancePaise: 0,
    });
  await db
    .doc("shops/other/customers/secret")
    .set({ name: "Secret Customer", balancePaise: 99900, active: true });
  await db.doc("shops/other").set({ name: "Other Shop", active: true });
  const host = express();
  host.use(express.static(DIST));
  host.use(createApi(db, auth, ORIGIN, { env: {} }));
  server = host.listen(3999, "127.0.0.1");
});
test.afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await db.terminate();
  await deleteApp(app);
});

async function openApp(page: Page) {
  await page.goto(`${ORIGIN}/#/workspace`);
}
async function login(page: Page, email: string, password: string) {
  await page.getByRole("button", { name: "Sign in as owner" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Sign in securely" }).click();
}
const balance = async () =>
  (await db.doc("shops/e2e-shop/customers/ramesh").get()).get("balancePaise");

test("owner signs in, records, edits and reverses entries; every number comes from Firestore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openApp(page);
  await login(page, "owner@e2e.test", "e2e-password-1");
  await expect(page.getByText("Sharma Kirana").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/dashboard-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "Add entry", exact: true }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (₹)").fill("340");
  await dialog.getByRole("button", { name: "Record entry" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Updated balance: ₹340" })).toBeVisible();
  expect(await balance()).toBe(34000);

  await page.getByRole("button", { name: "Ledger", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Correct amount (₹)").fill("430");
  await dialog.getByLabel("Reason for correction").fill("Amount was 430");
  await dialog.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Updated balance: ₹430" })).toBeVisible();
  expect(await balance()).toBe(43000);
  expect((await db.collection("shops/e2e-shop/entryRevisions").get()).size).toBe(1);

  // Reverse the corrected entry with a reason; reason is mandatory.
  await page.getByRole("button", { name: "Reverse" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason for reversal").fill("Customer returned goods");
  await dialog.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Updated balance: ₹0" })).toBeVisible();
  expect(await balance()).toBe(0);
  expect((await db.collection("shops/e2e-shop/ledgerEntries").get()).size).toBe(4); // credit, reversal, corrected credit, reversal

  // Customer detail: history (reversed rows visible), alias edit, consent.
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByRole("button", { name: "Open Ramesh" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Credit · reversed").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Edit details" }).click();
  await dialog.getByLabel(/Aliases/).fill("Pappu");
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(dialog.getByText("Customer details saved.")).toBeVisible();
  expect((await db.doc("shops/e2e-shop/customers/ramesh").get()).get("aliases")).toEqual(["Pappu"]);
  await dialog.getByRole("button", { name: "Record opt-out" }).click();
  await expect(dialog.getByText("Opt-out recorded")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("Entry corrected")).toBeVisible();
  await expect(page.getByText("Reminder consent changed")).toBeVisible();
  await page.getByRole("button", { name: "Reminders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sending is disabled by policy." })).toBeVisible();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Verify API connection" }).click();
  await expect(page.getByText("Disabled by policy")).toBeVisible();
  await expect(page.getByText("Blocked externally").first()).toBeVisible();
  await expect(page.getByText("Secret Customer")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an authenticated user without shop membership sees no shop data", async ({ page }) => {
  await openApp(page);
  await login(page, "intruder@e2e.test", "e2e-password-2");
  await expect(
    page.getByRole("alert").filter({ hasText: "owner membership is not provisioned" }),
  ).toBeVisible();
  await expect(page.getByText("Secret Customer")).toHaveCount(0);
  await expect(page.getByText("Ramesh", { exact: true })).toHaveCount(0);
});

test("public sign-up creates an Auth account, guides trusted shop linking and completes the first entry", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(ORIGIN);
  await page.getByRole("button", { name: "Get started", exact: true }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Your name").fill("Meera");
  await dialog.getByLabel("Email address").fill("meera@e2e.test");
  await dialog.getByLabel("Password", { exact: true }).fill("meera-password-1");
  await dialog.getByLabel("Confirm password").fill("meera-password-1");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Create owner account" }).click();
  await expect(page.getByRole("dialog", { name: "Let’s open your khata." })).toBeVisible();
  dialog = page.getByRole("dialog");
  const user = await auth.getUserByEmail("meera@e2e.test");
  await expect(dialog.getByRole("textbox", { name: "Your owner ID" })).toHaveValue(user.uid);
  expect((await db.doc(`owners/${user.uid}`).get()).exists).toBe(false);
  await dialog.getByRole("button", { name: "Copy setup details" }).click();
  await expect(dialog.getByRole("status")).toContainText("Setup details copied");
  await dialog.getByRole("button", { name: "Send verification email" }).click();
  await expect(dialog.getByRole("status")).toContainText("Verification email sent");
  // Trusted administrator handoff. The browser never writes membership or grants itself access.
  await db
    .doc("shops/meera-shop")
    .set({
      name: "Meera General Store",
      active: true,
      language: "hinglish",
      remindersEnabled: false,
    });
  await db.doc(`owners/${user.uid}`).set({ shopId: "meera-shop", active: true, role: "owner" });
  await dialog.getByRole("button", { name: "Check shop access" }).click();
  await dialog.getByRole("button", { name: "Continue to workspace", exact: true }).click();
  await expect(page.getByText("Meera General Store").first()).toBeVisible();
  await page.getByRole("button", { name: "Add first customer", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Customer name").fill("Suresh");
  await dialog.getByLabel("Landmark or display label").fill("Near the school");
  await dialog.getByRole("button", { name: "Add customer", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Customer created." })).toBeVisible();
  await page.getByRole("button", { name: "Add entry", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (₹)").fill("0");
  await dialog.getByRole("button", { name: "Record entry" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Amount (₹)").fill("10");
  await dialog.getByRole("button", { name: "Record entry" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Updated balance: ₹10" })).toBeVisible();
  const customers = await db.collection("shops/meera-shop/customers").get();
  expect(customers.docs[0].get("balancePaise")).toBe(1000);
  expect((await db.collection("shops/meera-shop/ledgerEntries").get()).size).toBe(1);
});

test("mobile owner navigation, customer details, validation and sign-out remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await login(page, "owner@e2e.test", "e2e-password-1");
  await expect(page.getByRole("heading", { name: "Your khata, at a glance." })).toBeVisible();
  await expect(page.getByText("Sharma Kirana").first()).toBeAttached();
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
  await page.screenshot({ path: "docs/screenshots/dashboard-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByRole("button", { name: "Open Ramesh" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Ramesh", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out securely" }).click();
  await expect(page.getByRole("button", { name: "Sign in as owner" }).first()).toBeVisible();
  await expect(page.getByText("owner@e2e.test", { exact: true })).toHaveCount(0);
});
