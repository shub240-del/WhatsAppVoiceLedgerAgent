import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const URL = "/tests/harness/assistant.html";
const reply = (page: Page, ...replies: { status?: number; body: Record<string, unknown> }[]) =>
  page.evaluate((r) => window.__replies.push(...r), replies);
const requests = (page: Page) => page.evaluate(() => window.__requests);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as Page & { errors: string[] }).errors = errors;
  await page.goto(URL);
  await expect(page.getByRole("heading", { name: "Bolo, hisaab ho jayega" })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});

test("typed entry: saved reply with Undo; Undo sends 'galat' linked to that reply and refreshes data", async ({ page }) => {
  await reply(page, { body: { reply: "Sunita: +₹340. Total baaki: ₹1,600.", kind: "saved", entryId: "e1" } }, { body: { reply: "₹340 ka entry hata diya.", kind: "undone" } });
  await page.getByLabel("Type a message").fill("Sunita ko 340 ka udhaar");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Sunita: +₹340. Total baaki: ₹1,600.")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("₹340 ka entry hata diya.")).toBeVisible();
  const [first, second] = await requests(page);
  expect(first).toMatchObject({ text: "Sunita ko 340 ka udhaar" });
  expect(second).toMatchObject({ text: "galat", replyTo: `web.r.${first.turnId}` });
  expect(await page.evaluate(() => window.__changed)).toBe(2);
  await expect(page.getByRole("button", { name: "Undo sent" })).toBeDisabled();
});

test("question with options: tapping an option answers that question; typed answer also links to it", async ({ page }) => {
  await reply(
    page,
    { body: { reply: "Kaun sa customer?\n1) Ramesh – Doodh wala\n2) Ramesh – School road\n1 ya 2 bhejein.", kind: "question", options: [{ key: 1, label: "Ramesh – Doodh wala" }, { key: 2, label: "Ramesh – School road" }] } },
    { body: { reply: "Ramesh: +₹200. Total baaki: ₹200.", kind: "saved", entryId: "e2" } },
  );
  await page.getByRole("button", { name: /Ramesh ko 340/ }).click();
  await expect(page.getByText("Kaun sa customer?", { exact: true })).toBeVisible();
  await expect(page.getByText("1 ya 2 bhejein")).toHaveCount(0); // numbered text hidden when buttons exist
  await page.getByRole("button", { name: "Ramesh – School road" }).click();
  await expect(page.getByText("Ramesh: +₹200. Total baaki: ₹200.")).toBeVisible();
  const [q, a] = await requests(page);
  expect(a).toMatchObject({ text: "2", replyTo: `web.r.${q.turnId}` });
});

test("server error shows a clear message and the box stays usable; nothing is lost silently", async ({ page }) => {
  await reply(page, { status: 503, body: { error: { code: "AI_SETUP", message: "Gemini free-tier limit reached. Nothing was saved." } } });
  await page.getByLabel("Type a message").fill("Sunita ko 340");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Gemini free-tier limit reached");
  await expect(page.getByLabel("Type a message")).toBeEnabled();
});

test("double submit is impossible while a reply is pending", async ({ page }) => {
  await page.getByLabel("Type a message").fill("Sunita ko 340");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Type a message")).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Theek hai.")).toBeVisible();
  expect((await requests(page)).length).toBe(1);
});

test("voice: recording uses the microphone, uploads a valid 16 kHz mono WAV and shows what was heard", async ({ page }) => {
  await reply(page, { body: { reply: "Sunita: +₹340. Total baaki: ₹340.", kind: "saved", heard: "Sunita ko teen sau chaalees", entryId: "e3" } });
  await page.getByRole("button", { name: "Start speaking" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bol rahe hain" })).toBeVisible();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Stop and send voice" }).click();
  await expect(page.getByText("Sunita ko teen sau chaalees")).toBeVisible();
  const [req] = await requests(page);
  expect(req.mimeType).toBe("audio/wav");
  const header = await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    const v = new DataView(bytes.buffer);
    const tag = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
    return { riff: tag(0), wave: tag(8), channels: v.getUint16(22, true), rate: v.getUint32(24, true), bits: v.getUint16(34, true), ms: Math.round((v.getUint32(40, true) / 32000) * 1000) };
  }, req.audioBase64);
  expect(header).toMatchObject({ riff: "RIFF", wave: "WAVE", channels: 1, rate: 16000, bits: 16 });
  expect(header.ms).toBeGreaterThan(1000);
  expect(header.ms).toBeLessThan(30_000);
});

test("voice: a tap that is too short is not uploaded and explains what to do", async ({ page }) => {
  await page.getByRole("button", { name: "Start speaking" }).click();
  await page.getByRole("button", { name: "Stop and send voice" }).click();
  await expect(page.getByRole("alert")).toContainText("Bahut chhota tha");
  expect((await requests(page)).length).toBe(0);
});

test("mobile: no horizontal overflow and the mic is a large touch target", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await page.getByRole("button", { name: "Start speaking" }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(48);
  expect(box!.height).toBeGreaterThanOrEqual(48);
});

test("accessibility: no serious or critical axe violations", async ({ page }) => {
  await reply(page, { body: { reply: "Kaun sa customer?", kind: "question", options: [{ key: 1, label: "Ramesh – Doodh wala" }] } });
  await page.getByRole("button", { name: /Ramesh ko 340/ }).click();
  await expect(page.getByRole("button", { name: "Ramesh – Doodh wala" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("after sign-in, what the guest said earlier is sent once, automatically", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      sessionStorage.setItem("udhaar.pendingTurn", JSON.stringify({ body: { text: "Sunita ko 340" }, shown: "Sunita ko 340", voice: false }));
    }
  });
  await page.goto("/tests/harness/assistant.html");
  await expect.poll(() => page.evaluate(() => window.__requests.length)).toBe(1);
  expect(await page.evaluate(() => window.__requests[0].text)).toBe("Sunita ko 340");
  expect(await page.evaluate(() => sessionStorage.getItem("udhaar.pendingTurn"))).toBeNull();
  await page.reload();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__requests.length)).toBe(0);
});
