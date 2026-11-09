import { test, expect } from "@playwright/test";

test("public website has a complete, honest product experience and working section navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Less hisaab. More dukaan." }),
  ).toBeVisible();
  await expect(page.getByText("Example only · Not a live entry")).toBeVisible();
  for (const name of ["How it works", "Features", "Why Udhaar", "FAQs"]) {
    await page
      .getByRole("navigation", { name: "Website navigation", exact: true })
      .getByRole("link", { name, exact: true })
      .click();
    const hash = await page.evaluate(() => location.hash);
    expect(["#how-it-works", "#features", "#security", "#faq"]).toContain(hash);
  }
  await expect(
    page.getByRole("heading", { name: "Before you get started." }),
  ).toBeInViewport();
  expect(errors).toEqual([]);
});

test("voice walkthrough changes examples and stages without using live providers", async ({
  page,
}) => {
  await page.goto("/#demo");
  const demo = page.locator("#demo");
  await demo.getByRole("button", { name: "Show this example" }).click();
  await expect(demo.getByText("Ramesh · Near the temple")).toBeVisible();
  await demo.getByRole("button", { name: "Review this entry" }).click();
  await expect(demo.getByText("₹920 + ₹340 = ₹1,260")).toBeVisible();
  await demo.getByRole("button", { name: "Record a payment", exact: true }).click();
  await demo.getByRole("button", { name: "Show this example" }).click();
  await demo.getByRole("button", { name: "Review this entry" }).click();
  await expect(demo.getByText("₹920 − ₹200 = ₹720")).toBeVisible();
  await demo.getByRole("button", { name: "Check a balance", exact: true }).click();
  await demo.getByRole("button", { name: "Show this example" }).click();
  await expect(demo.getByText("Read only", { exact: true })).toBeVisible();
  await expect(demo.getByText("Demo only. Nothing is added to a real khata.", { exact: false })).toBeVisible();
});

test("FAQ, privacy, pilot terms and workspace preview controls work", async ({ page }) => {
  await page.goto("/#faq");
  const question = page.getByText("Will Udhaar message my customers?", {
    exact: true,
  });
  await question.click();
  await expect(
    page.getByText("Automatic customer reminders are not available.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "How we handle your records", exact: true }).first().click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "How we handle your records." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About the pilot", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "What to expect from the pilot." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const preview = page.getByLabel("Dashboard interface preview with no account data");
  await preview.getByRole("button", { name: "Ledger", exact: true }).click();
  await expect(preview.getByRole("heading", { name: "Every entry. Every detail." })).toBeVisible();
  await preview.getByRole("link", { name: "Open dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Your khata, at a glance." })).toBeVisible();
});

test("get started offers Google sign-in and explains owner provisioning", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await expect(dialog.getByText(/then name your shop/i)).toBeVisible();
  await expect(dialog.getByLabel("Email address")).toHaveCount(0);
  await expect(dialog.getByLabel("Password")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Welcome back to your khata." })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("hero demo link and login, signup, and footer actions reach their working destinations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See a voice example" }).click();
  await expect(page).toHaveURL(/#demo$/);
  await expect(page.locator("#demo")).toBeInViewport();

  await page.getByRole("banner").getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Welcome back to your khata." })).toBeVisible();
  await page.keyboard.press("Escape");

  const footer = page.locator(".site-footer");
  await footer.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "A fresh start for your shop." })).toBeVisible();
  await page.keyboard.press("Escape");
  await footer.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Welcome back to your khata." })).toBeVisible();
});

test("mobile and tablet landing navigation have no horizontal overflow", async ({ page }) => {
  for (const width of [1440, 1280, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width <= 820) {
      if (width <= 620) {
        const viewportWidth = await page.evaluate(() => innerWidth);
        const actionBounds = await page.locator(".hero-ctas > *").evaluateAll((elements) =>
          elements.map((element) => {
            const { left, right } = element.getBoundingClientRect();
            return { left, right };
          }),
        );
        expect(actionBounds.every(({ left, right }) => left >= 0 && right <= viewportWidth)).toBe(
          true,
        );
        expect(
          await page
            .locator(".hero-explainer")
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
      }
      await page.getByRole("button", { name: "Open menu" }).click();
      const nav = page.getByRole("navigation", { name: "Mobile website navigation" });
      await nav.getByRole("link", { name: "Features", exact: true }).click();
      await expect(nav).not.toBeVisible();
      await expect(page.locator("#features")).toBeInViewport();
      await page.getByRole("button", { name: "Open menu" }).click();
      await nav.getByRole("button", { name: "Create account", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
});

test("public page has local assets, a keyboard skip link and desktop/mobile screenshots", async ({
  page,
}) => {
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
