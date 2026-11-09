import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";

Object.assign(process.env, {
  VITE_USE_FIREBASE_EMULATORS: "true",
  VITE_AUTH_TEST_HELPER: "true",
  VITE_FIREBASE_PROJECT_ID: "demo-udhaar-test",
  VITE_FIREBASE_API_KEY: "demo-key",
  VITE_FIREBASE_AUTH_DOMAIN: "localhost",
  VITE_FIREBASE_APP_ID: "demo-app",
  VITE_API_BASE_URL: "http://127.0.0.1:3999",
});

await build({
  mode: "test",
  build: {
    outDir: path.join(tmpdir(), "udhaar-e2e-dist"),
    emptyOutDir: true,
  },
});
