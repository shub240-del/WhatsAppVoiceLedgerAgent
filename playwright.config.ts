import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: process.env.PREVIEW_URL || "http://localhost:3000", headless: true },
  reporter: "list",
  outputDir: "/tmp/udhaar-playwright",
  // The preview server is managed by the host; never start another one.
});
