import { gnaniEnvironmentStatus } from "./gnani-config";

// Intentionally outputs neither the key, its length, nor any masked portion.
const status = gnaniEnvironmentStatus();
console.info(JSON.stringify({ provider: "gnani", ...status, modelCallsEnabled: false }));
if (!status.credentialsConfigured) process.exitCode = 1;
