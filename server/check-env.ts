import { integrationStatuses } from "./config";

// Prints only states and non-secret details.
const required = ["FIREBASE_PROJECT_ID", "ALLOWED_ORIGIN"].filter((k) => !process.env[k]?.trim());
console.info(JSON.stringify({ requiredMissing: required, integrations: integrationStatuses() }, null, 2));
if (required.length) process.exitCode = 1;
