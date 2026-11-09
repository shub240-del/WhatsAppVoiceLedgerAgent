import { test, expect } from "@playwright/test";

// The real workspace with a fake signed-in shop (tests/harness/workspace.tsx).
const url = "/tests/harness/workspace.html#/workspace/home";

test("home shows one total, give/got buttons, the assistant and recent entries", async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  const balance = page.getByLabel("Total balance");
  await expect(balance.getByText("₹1,490")).toBeVisible();
  await expect(balance.getByText("2 of 4 customers owe you")).toBeVisible();
  await expect(page.getByRole("region", { name: "Voice assistant" })).toBeVisible();
  await expect(page.getByText("Maggi, doodh", { exact: false })).toBeVisible();
  await balance.getByRole("button", { name: /Paisa mila/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("YOU GOT")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Paisa mila/ })).toBeChecked();
});

test("customers list shows due in red, advance in green, like a khata", async ({ page }) => {
  await page.goto(url);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Customers" }).click();
  const ramesh = page.getByRole("button", { name: /Ramesh/ });
  await expect(ramesh.getByText("₹1,240")).toHaveClass(/k-due/);
  await expect(page.getByRole("button", { name: /Imran/ }).getByText("advance")).toBeVisible();
  await page.getByLabel("Search customers").fill("sun");
  await expect(page.getByRole("button", { name: /Sunita/ })).toBeVisible();
  await expect(ramesh).toHaveCount(0);
});

test("entries can be fixed or cancelled; cancelled ones stay visible", async ({ page }) => {
  await page.goto("/tests/harness/workspace.html#/workspace/entries");
  await expect(page.getByRole("list").getByText("Cancelled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel entry" }).first().click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Cancel this entry?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeEnabled();
});

test("mic button on any page brings the owner to the assistant", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/harness/workspace.html#/workspace/entries");
  await page.getByRole("navigation", { name: "Main navigation (mobile)" }).getByRole("button", { name: "Speak an entry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Voice assistant" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("empty shop guides to the first customer", async ({ page }) => {
  await page.goto("/tests/harness/workspace.html?empty#/workspace/home");
  await expect(page.getByRole("heading", { name: "Add your first customer" })).toBeVisible();
});

test("new owner: one onboarding card asks shop name and language, and sends both", async ({ page }) => {
  await page.goto("/tests/harness/workspace.html?new#/workspace/home");
  await expect(page.getByRole("heading", { name: "Open your khata" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Shop name").fill("Patil Kirana");
  await page.getByRole("radio", { name: /Marathi/ }).check();
  await page.getByRole("button", { name: "Open my khata" }).click();
  await expect.poll(() => page.evaluate(() => window.__requests.find((r) => String(r.url).endsWith("/api/onboarding/shop"))?.body))
    .toEqual({ shopName: "Patil Kirana", language: "mr" });
});

test("one tap on the mic, from any page, starts listening", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/harness/workspace.html#/workspace/customers");
  const mic = page.getByRole("navigation", { name: "Main navigation (mobile)" }).getByRole("button", { name: "Speak an entry" });
  await mic.click();
  await expect(page.getByRole("status").filter({ hasText: "Bol rahe hain" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop and send voice" })).toBeVisible();
});

test("read-aloud can be switched off and stays off", async ({ page }) => {
  await page.goto(url);
  const toggle = page.getByRole("button", { name: "Read replies aloud" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Read replies aloud" })).toHaveAttribute("aria-pressed", "false");
});

test("guest: lands in the product, can type, and is asked to sign up only when saving", async ({ page }) => {
  await page.goto("/tests/harness/workspace.html?guest#/workspace/home");
  await expect(page.getByText("You’re trying Udhaar.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Type a message").fill("Ramesh ko 340 ka udhaar");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Create your free account" })).toBeVisible();
  await expect(dialog.getByText("I’ll save it right after you sign in.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(dialog.getByLabel("Email")).toBeVisible();
  // Nothing went to the server; the message waits for sign-in.
  expect(await page.evaluate(() => window.__requests.filter((r) => String(r.url).includes("/api/")).length)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("udhaar.pendingTurn") ?? "null")?.body)).toEqual({ text: "Ramesh ko 340 ka udhaar" });
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Forgot password?" })).toBeVisible();
});

test("guest: Udhaar diya and Add customer ask for an account instead of failing", async ({ page }) => {
  await page.goto("/tests/harness/workspace.html?guest#/workspace/home");
  await page.getByLabel("Total balance").getByRole("button", { name: /Udhaar diya/ }).click();
  await expect(page.getByRole("dialog").getByText("save this entry", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Customers" }).click();
  await page.getByRole("button", { name: "Add customer" }).first().click();
  await expect(page.getByRole("dialog").getByText("save your customers", { exact: false })).toBeVisible();
});

test("guest: tapping the mic records right away (sign-up comes when it is sent)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/harness/workspace.html?guest#/workspace/home");
  await page.getByRole("navigation", { name: "Main navigation (mobile)" }).getByRole("button", { name: "Speak an entry" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bol rahe hain" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
