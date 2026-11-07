import { geminiEnvironmentStatus } from "./gemini-config";

// No key, partial key, length, provider request, or ledger access is exposed.
const status = geminiEnvironmentStatus();
console.info(
  JSON.stringify({ provider: "gemini", role: "llm", ...status, modelCallsEnabled: false }),
);
if (!status.credentialsConfigured) process.exitCode = 1;
