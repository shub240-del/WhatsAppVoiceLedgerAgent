import { defineConfig } from "@playwright/test";

// Signed-in dashboard journeys against the Firebase emulators and an in-process API.
// The built app is served through request interception; no dev server is started.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { headless: true, baseURL: "http://127.0.0.1:3999" },
  reporter: "list",
  outputDir: "/tmp/udhaar-playwright-e2e",
});
