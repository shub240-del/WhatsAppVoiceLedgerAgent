import { test, expect } from "@playwright/test";

test("landing says what Udhaar is in one screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Bolo. Udhaar likh gaya." })).toBeVisible();
  await expect(page.getByText("Voice khata for kirana shops")).toBeVisible();
  const demo = page.getByLabel("Example conversation");
  await expect(demo.getByText("Ramesh ko 340 ka udhaar likh do", { exact: false })).toBeVisible();
  await expect(page.getByRole("list", { name: "Languages" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("'Try it now' opens the product without sign-up; Log in, privacy and terms open dialogs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it now" }).click();
  await expect(page).toHaveURL(/#\/workspace$/);
  await expect(page.getByText("You’re trying Udhaar.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Log in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(dialog.getByLabel("Email")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("contentinfo").getByRole("button", { name: "Privacy" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "How we handle your records" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("contentinfo").getByRole("button", { name: "Terms" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "What to expect" })).toBeVisible();
});

test("landing has no horizontal overflow on any screen size", async ({ page }) => {
  for (const width of [1440, 1280, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("public page has local assets, a keyboard skip link and desktop/mobile screenshots", async ({ page }) => {
  const failures: string[] = [];
  page.on("requestfailed", (request) => failures.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.screenshot({ path: "docs/screenshots/landing-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({ path: "docs/screenshots/landing-mobile.png", fullPage: true });
  expect(failures).toEqual([]);
});
