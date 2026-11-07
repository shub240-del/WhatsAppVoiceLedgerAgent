import { test, expect } from "@playwright/test";

test("private workspace, navigation, login dialog and honest integration states", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/workspace");
  await expect(page.getByRole("heading", { name: "Your khata, at a glance." })).toBeVisible();
  await expect(page.getByText("A clean page. A clear start.")).toBeVisible();
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Welcome to your khata." })).toBeVisible();
  await expect(dialog.getByLabel("Email address")).toBeVisible();
  await expect(dialog.getByLabel("Password", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Explore voice commands" }).click();
  await expect(
    page.getByText("These are examples, not processed messages.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View connections", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connected with care." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Status not verified yet" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reminders are intentionally disabled." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await expect(page.getByText("Your regulars belong here.")).toBeVisible();
  await page.getByRole("button", { name: "Ledger", exact: true }).click();
  await expect(page.getByText("Nothing recorded. Nothing guessed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export loaded" })).toBeDisabled();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("No analytics initialized")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile layout and navigation have no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/workspace");
  await expect(page.getByRole("heading", { name: "Your khata, at a glance." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connected with care." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "/tmp/udhaar-mobile.png", fullPage: true });
});

test("desktop overview renders cleanly", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/#/workspace");
  await expect(page.getByRole("heading", { name: "Your khata, at a glance." })).toBeVisible();
  await page.screenshot({ path: "/tmp/udhaar-desktop.png", fullPage: true });
});
