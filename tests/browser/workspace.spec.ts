import { test, expect } from "@playwright/test";

test("signed-out workspace asks the owner to sign in, nothing else", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/workspace");
  await expect(page.getByRole("heading", { name: "Sign in to open your khata" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("Ramesh", { exact: true })).toHaveCount(0);
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
