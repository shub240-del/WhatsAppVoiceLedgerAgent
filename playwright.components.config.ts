import { defineConfig } from "@playwright/test";

// Component tests: real components in a real browser, with a scripted fake server.
// Starts its own Vite dev server. Chrome's fake microphone makes recording testable.
export default defineConfig({
  testDir: "./tests/components",
  reporter: "list",
  outputDir: "/tmp/udhaar-components",
  use: {
    baseURL: "http://127.0.0.1:4310",
    headless: true,
    permissions: ["microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    },
  },
  webServer: {
    command: "pnpm exec vite --port 4310 --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:4310/tests/harness/assistant.html",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
