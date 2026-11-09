import { test, expect } from "@playwright/test";

test("landing tells the story in order and the demo plays without sign-up", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Bolo. Udhaar likh gaya." })).toBeVisible();
  await expect(page.getByText("Voice khata for kirana shops").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Languages" }).getByRole("listitem")).toHaveCount(3);
  const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  expect(headings.slice(0, 4)).toEqual([
    "Rush ke time diary kaun likhe?",
    "Bolo, aur khata mein likh jaata hai",
    "How it works",
    "Everything a khata needs. Nothing it doesn’t.",
  ]);
  await page.locator("#khata-demo").scrollIntoViewIfNeeded();
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

test("FAQ answers open, and every CTA leads somewhere real", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Will my customers get messages from Udhaar?").click();
  await expect(page.getByText("Udhaar never messages your customers.", { exact: false })).toBeVisible();
  for (const name of ["How it works", "Features", "Pricing", "FAQ"]) {
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

test("Demo tells the whole story: three spoken entries, a live khata, and a Sunday reminder with a UPI link", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Demo" }).click();
  await expect(page).toHaveURL(/#\/demo$/);
  const phone = page.locator(".wd-phone");
  const suggest = phone.getByRole("group", { name: "Suggested messages" });
  const khata = page.getByRole("region", { name: "The khata, live" });
  await expect(phone.getByText("Namaste! Main aapka Udhaar khata hoon.", { exact: false })).toBeVisible();

  // 1. Goods without a price: it asks the amount instead of guessing.
  await suggest.getByRole("button", { name: /Ramesh ne do kilo chawal/ }).click();
  await expect(phone.getByText("Kitne rupaye likhne hain?")).toBeVisible({ timeout: 8000 });
  await suggest.getByRole("button", { name: "₹230" }).click();
  await expect(phone.getByText("Ramesh: +₹230 (2 kilo chawal, 1 Surf). Total baaki: ₹1,130.", { exact: false })).toBeVisible({ timeout: 8000 });
  await expect(khata.getByText("₹1,130")).toBeVisible();
  // 2 and 3: typing works too.
  for (const [line, reply] of [["Sunita ne 200 diye", "Total baaki: ₹450."], ["Priya ko 150 ka udhaar, doodh aur bread", "Total baaki: ₹270."]]) {
    await phone.getByLabel("Type a message").fill(line);
    await phone.getByRole("button", { name: "Send" }).click();
    await expect(phone.getByText(reply, { exact: false })).toBeVisible();
  }

  // 4. Sunday: every customer with dues gets a reminder in their own language.
  await phone.getByRole("button", { name: "It’s Sunday — send reminders" }).click();
  await expect(phone.getByText("Ravivaar ke reminder bhej diye (3)", { exact: false })).toBeVisible();
  const views = page.getByRole("tablist", { name: "Whose phone" });
  await expect(views.getByRole("tab", { name: "Ramesh’s phone" })).toHaveAttribute("aria-selected", "true", { timeout: 5000 });
  await expect(phone.getByText("आपका ₹1,130 बाकी है", { exact: false })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Play voice note in हिंदी" })).toBeVisible();
  await views.getByRole("tab", { name: "Sunita’s phone" }).click();
  await expect(phone.getByText("तुमचे ₹450 बाकी आहेत", { exact: false })).toBeVisible();
  await views.getByRole("tab", { name: "Priya’s phone" }).click();
  await expect(phone.getByText("તમારા ₹270 બાકી છે", { exact: false })).toBeVisible();
  await phone.getByRole("button", { name: /Pay ₹270 to Sharma Kirana/ }).click();
  const sheet = phone.getByRole("dialog", { name: "Pay Sharma Kirana" });
  await expect(sheet.getByText("₹270", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Demo only — no money moves.", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Close payment page" }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(khata.getByText("₹900")).toBeVisible();
  await expect(views).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Demo has no horizontal overflow on phones", async ({ page }) => {
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/#/demo");
    await expect(page.getByLabel("Type a message")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
