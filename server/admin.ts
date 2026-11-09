import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { parseServiceAccount } from "./secret.js";

// This module is outside src and must never be imported by browser code.
// Hosts without a credentials file (e.g. Vercel) pass the service-account JSON in
// FIREBASE_SERVICE_ACCOUNT; other hosts use GOOGLE_APPLICATION_CREDENTIALS / ADC.
function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return raw?.trim() ? parseServiceAccount(raw) : null;
}
const account = serviceAccount();
const projectId = process.env.FIREBASE_PROJECT_ID || account?.project_id;
if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
const emulating = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST,
);
if (
  emulating &&
  (!process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !projectId.startsWith("demo-"))
) {
  throw new Error(
    "Local mode requires both emulators and a demo- project ID to prevent accidental live access.",
  );
}
if (process.env.NODE_ENV === "production" && emulating) {
  throw new Error("Emulators cannot be used in production.");
}
const app =
  getApps()[0] ||
  initializeApp({
    projectId,
    ...(process.env.FIRESTORE_EMULATOR_HOST
      ? {}
      : {
          credential: account
            ? cert({
                projectId,
                clientEmail: account.client_email!,
                privateKey: account.private_key!,
              })
            : applicationDefault(),
        }),
  });
export const adminAuth = getAuth(app);
export const store = getFirestore(app);
