import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { inflateRawSync } from "node:zlib";

// The real-voice recorder (#/narrate): one take per scene, nothing exported until all 16 exist.
const url = "/tests/harness/narrate.html";

function toneWav(seconds: number, rate = 48000): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 8000), 44 + i * 2);
  return b;
}

const scene = (page: Page, n: number) => page.getByRole("listitem").filter({ has: page.locator(`#scene-${n}`) });

async function upload(page: Page, n: number, seconds = 2) {
  await page.getByLabel(`Upload a recording for scene ${n}`, { exact: true }).setInputFiles({ name: `take${n}.wav`, mimeType: "audio/wav", buffer: toneWav(seconds) });
  await expect(page.getByLabel(`Your recording for scene ${n}`, { exact: true })).toBeVisible();
}

/** Names of the files in a store-only ZIP. */
function zipNames(buf: Buffer): string[] {
  const names: string[] = [];
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), size = buf.readUInt32LE(p + 18), len = buf.readUInt16LE(p + 26), extra = buf.readUInt16LE(p + 28);
    names.push(buf.subarray(p + 30, p + 30 + len).toString("utf8"));
    if (method !== 0) inflateRawSync(buf.subarray(p + 30 + len + extra, p + 30 + len + extra + size));
    p += 30 + len + extra + size;
  }
  return names;
}

test("every scene shows its number, time, script and expected length", async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Record the narration in your own voice" })).toBeVisible();
  await expect(page.locator(".nr-scene")).toHaveCount(16);
  await expect(scene(page, 4)).toContainText("Ramesh ne do kilo chawal aur ek Surf liya, udhaar mein");
  await expect(page.getByRole("button", { name: "Prepare ZIP" })).toBeDisabled();
  await expect(page.getByText(/Missing: scene 1, scene 2/)).toBeVisible();
});

test("record with the microphone, listen, delete and re-record; takes survive a reload", async ({ page }) => {
  await page.goto(url);
  const one = scene(page, 1);
  await one.getByRole("button", { name: "Record scene 1", exact: true }).click();
  await expect(one.getByRole("button", { name: "Stop recording scene 1" })).toBeVisible();
  await page.waitForTimeout(1500);
  await one.getByRole("button", { name: "Stop recording scene 1" }).click();
  await expect(page.getByLabel("Your recording for scene 1", { exact: true })).toBeVisible();
  await expect(one).toContainText("scene_01.wav");
  await expect(one.getByRole("button", { name: "Re-record scene 1" })).toBeVisible();
  await expect(page.getByText(/Missing: scene 2,/)).toBeVisible();

  await upload(page, 2);
  await page.reload();
  await expect(page.getByLabel("Your recording for scene 1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Your recording for scene 2")).toBeVisible();

  await page.getByRole("button", { name: "Delete the recording for scene 1" }).click();
  await expect(page.getByLabel("Your recording for scene 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Missing: scene 1, scene 3/)).toBeVisible();
});

test("a file that isn't audio is refused with a clear message", async ({ page }) => {
  await page.goto(url);
  await page.getByLabel("Upload a recording for scene 3").setInputFiles({ name: "notes.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("not audio") });
  await expect(scene(page, 3).getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Your recording for scene 3")).toHaveCount(0);
});

test("the ZIP is only made when all 16 scenes are recorded, with scene_01–16.wav, script and timing", async ({ page }) => {
  await page.goto(url);
  for (let n = 1; n <= 16; n++) {
    if (n === 9) continue;
    await upload(page, n, 1);
  }
  await expect(page.getByText("Missing: scene 9.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare ZIP" })).toBeDisabled();
  await upload(page, 9, 1);
  await expect(page.getByText("All 16 scenes are recorded.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Prepare ZIP" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download udhaar-narration-recordings.zip/ }).click()]);
  expect(download.suggestedFilename()).toBe("udhaar-narration-recordings.zip");
  const { readFileSync } = await import("node:fs");
  const names = zipNames(readFileSync((await download.path())!));
  const scenes = Array.from({ length: 16 }, (_, i) => `scene_${String(i + 1).padStart(2, "0")}.wav`);
  expect(names.filter((n) => n.endsWith(".wav")).sort()).toEqual(scenes);
  expect(names).toContain("script.txt");
  expect(names).toContain("timing.json");
});

for (const width of [1280, 390]) {
  test(`accessibility and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await upload(page, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
