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

const SAMPLE = process.env.VOICE_SAMPLE ?? "/tmp/voice-sample.mp3";
const GENTLE = "/tmp/voice-sample-gentle.wav";
const haveSample = async () => (await import("node:fs")).existsSync(SAMPLE) && (await import("node:fs")).existsSync(GENTLE);

test("voice studio: test one line, compare three recordings, and nothing more is generated until approved", async ({ page }) => {
  test.skip(!(await haveSample()), "no local voice sample");
  await page.goto("/tests/harness/workspace.html?story#/workspace/studio");
  await page.getByLabel("Your voice sample").setInputFiles(SAMPLE);
  await page.getByLabel("Cleaned version", { exact: false }).setInputFiles(GENTLE);
  await expect(page.getByRole("radio", { name: /My original/ })).toBeChecked(); // safest default
  await page.getByLabel("This is my own voice", { exact: false }).check();
  const makeAll = page.getByRole("button", { name: "Make all 16 lines" });
  await expect(makeAll).toBeDisabled();

  await page.getByRole("button", { name: "Test my voice (1 line)" }).click();
  await expect(page.getByRole("heading", { name: "Compare: does the clone sound like you?" })).toBeVisible({ timeout: 30_000 });
  for (const name of ["Your original", "Cleaned", "Cloned voice — line 1"]) await expect(page.locator(".k-players label", { hasText: name }).locator("audio")).toBeAttached();
  const table = page.locator(".k-compare-table");
  await expect(table.getByRole("columnheader")).toHaveText(["Measure", "Your original", "Cleaned", "Cloned voice", "Clone vs your original"]);
  for (const row of ["Pitch (median)", "Speaking pace", "Tone (spectral shape)"]) await expect(table.getByRole("rowheader", { name: row })).toBeVisible();
  await expect(makeAll).toBeDisabled(); // still locked: no approval yet

  let speaks = await page.evaluate(() => window.__requests.filter((r) => String(r.url).endsWith("/speak")).length);
  expect(speaks).toBe(1);
  await page.getByRole("button", { name: "No, it doesn’t" }).click();
  await expect(page.getByText("To get a closer clone:")).toBeVisible();
  await expect(makeAll).toBeDisabled();

  await page.getByRole("button", { name: "Approve — this sounds like me" }).click();
  await expect(makeAll).toBeEnabled();
  await makeAll.click();
  const zipLink = page.getByRole("link", { name: "Download everything (ZIP)" });
  await expect(zipLink).toBeVisible({ timeout: 30_000 });
  const calls = await page.evaluate(() => window.__requests.filter((r) => String(r.url).includes("voice-studio")));
  expect(calls.filter((c) => String(c.url).endsWith("/voice"))).toHaveLength(1); // cloned once from the original
  speaks = calls.filter((c) => String(c.url).endsWith("/speak")).length;
  expect(speaks).toBe(17); // 1 test + 16 after approval
  const voiceCall = calls.find((c) => String(c.url).endsWith("/voice"))!.body as { audioBase64: string; consent: boolean };
  expect(voiceCall.consent).toBe(true);
  expect(Number(voiceCall.audioBase64.split(" ")[0])).toBeLessThan(1_100_000); // trimmed to 25 s
  const names = await zipLink.evaluate(async (a: HTMLAnchorElement) => {
    const text = new TextDecoder().decode(await (await fetch(a.href)).arrayBuffer());
    return [...new Set(text.match(/lines\/\d\d-[a-z0-9-]+\.wav|narration\.wav|script\.txt|timing\.json/g))];
  });
  expect(names.filter((n) => n.startsWith("lines/"))).toHaveLength(16);
});

test("voice studio: when Gnani refuses, the exact reason is shown and nothing is generated", async ({ page }) => {
  test.skip(!(await haveSample()), "no local voice sample");
  await page.goto("/tests/harness/workspace.html?story#/workspace/studio");
  const reason = "Gnani voice cloning failed — HTTP 403 (SCOPE_NOT_ALLOWED: Voice cloning is not enabled for this key): this Gnani key isn't allowed to use voice cloning. Nothing was generated; no other voice was used.";
  await page.evaluate((r) => ((window as unknown as { __gnaniRefuse: string }).__gnaniRefuse = r), reason);
  await page.getByLabel("Your voice sample").setInputFiles(SAMPLE);
  await page.getByLabel("This is my own voice", { exact: false }).check();
  await page.getByRole("button", { name: "Test my voice (1 line)" }).click();
  await expect(page.getByRole("alert")).toHaveText(reason, { timeout: 30_000 });
  await expect(page.getByLabel("Test line in your voice")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Make all 16 lines" })).toBeDisabled();
});
