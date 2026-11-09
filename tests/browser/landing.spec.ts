import { test, expect } from "@playwright/test";

test("landing tells the story in order and the demo plays without sign-up", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Bolo. Udhaar likh gaya." })).toBeVisible();
  await expect(page.getByText("Voice khata for kirana shops").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Languages" }).getByRole("listitem")).toHaveCount(3);
  const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  expect(headings.slice(0, 5)).toEqual([
    "Open your free khata",
    "Rush ke time diary kaun likhe?",
    "Bolo, aur khata mein likh jaata hai",
    "Every entry lands in your khata",
    "How it works",
  ]);
  await page.getByRole("navigation", { name: "Website navigation" }).getByRole("link", { name: "Demo", exact: true }).click();
  const chat = page.getByLabel("Example conversation");
  await expect(chat.getByText("Ramesh ko 340 ka udhaar", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Khata after this entry").getByText("₹1,240")).toBeVisible({ timeout: 6000 });
  await page.getByRole("tab", { name: "New customer" }).click();
  await expect(page.getByLabel("Khata after this entry").getByText("Kishore").first()).toBeVisible({ timeout: 8000 });
  await page.getByRole("tab", { name: "Galti sudhaaro" }).click();
  await expect(chat.getByText("Theek hai, kuch save nahi kiya.")).toBeVisible({ timeout: 8000 });
  await expect(page.getByText("The khata only changes when you confirm.", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test("sign-up sits on the landing page, next to a WhatsApp preview that tells the whole story", async ({ page }) => {
  await page.goto("/");
  const signup = page.locator("#signup");
  await expect(signup.getByRole("heading", { name: "Open your free khata" })).toBeVisible();
  await expect(signup.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(signup.getByLabel("Email")).toBeVisible();
  await expect(signup.getByLabel("Password")).toBeVisible();
  await signup.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(signup.getByRole("heading", { name: "Log in to your khata" })).toBeVisible();
  await expect(signup.getByRole("button", { name: "Forgot password?" })).toBeVisible();

  const wa = page.getByRole("figure", { name: /WhatsApp preview/ });
  await expect(wa.getByText("Udhaar Khata", { exact: true }).first()).toBeVisible();
  await expect(wa.getByText("“Ramesh ko 340 ka udhaar, do Maggi aur doodh”")).toBeVisible({ timeout: 5000 });
  await expect(wa.getByText("Total baaki: ₹1,240", { exact: false }).first()).toBeVisible({ timeout: 5000 });
  await wa.getByRole("button", { name: "Fix a mistake" }).click();
  await expect(wa.getByText("GALAT", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(wa.getByText("Kishore ji ka baaki ab ₹0 hai.", { exact: false })).toBeVisible({ timeout: 6000 });
  await wa.getByRole("button", { name: "Pause" }).click();
  await expect(wa.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(wa.getByText("Preview of the WhatsApp version.", { exact: false })).toBeVisible();

  await signup.getByRole("button", { name: "Or try it first, without an account" }).click();
  await expect(page).toHaveURL(/#\/workspace$/);
});

test("FAQ answers open, and every CTA leads somewhere real", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Will my customers get messages from Udhaar?").click();
  await expect(page.getByText("Udhaar never messages your customers.", { exact: false })).toBeVisible();
  for (const name of ["Demo", "How it works", "Features", "Pricing", "FAQ"]) {
    await page.getByRole("navigation", { name: "Website navigation" }).getByRole("link", { name, exact: true }).click();
  }
  await expect(page.locator("#faq")).toBeInViewport();
  await page.locator("#pricing").getByRole("button", { name: "Try it free" }).click();
  await expect(page).toHaveURL(/#\/workspace$/);
});

test("'Try it free' opens the product without sign-up; Log in, privacy and terms open dialogs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Try it free" }).click();
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
