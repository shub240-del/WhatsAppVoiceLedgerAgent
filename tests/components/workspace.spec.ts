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
