import { test, expect } from "@playwright/test";

test("signed-out visitor gets the real product as a guest, with no data and no sign-in wall", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/workspace");
  await expect(page.getByText("You’re trying Udhaar.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Voice assistant" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign up free" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Create your free account" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("old workspace links still open", async ({ page }) => {
  for (const slug of ["overview", "ledger", "connections"]) {
    await page.goto(`/#/workspace/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("mobile workspace has a bottom bar with the mic and no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/workspace");
  const bar = page.getByRole("navigation", { name: "Main navigation (mobile)" });
  await expect(bar.getByRole("button", { name: "Speak an entry" })).toBeVisible();
  await bar.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
