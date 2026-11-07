import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, store } from "./admin";
import { documentId } from "./domain";

// Explicit administrative command; never invoked by the frontend or on startup.
const [uid, name, phone] = process.argv.slice(2);
if (!uid || !name) throw new Error("Usage: pnpm provision:owner <existing-auth-uid> <shop-name> [+91XXXXXXXXXX]");
documentId.parse(uid);
if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Phone must be E.164, e.g. +919876543210");
await adminAuth.getUser(uid);
const shopId = randomUUID();
await store.runTransaction(async (tx) => {
  const ref = store.doc(`owners/${uid}`);
  if ((await tx.get(ref)).exists) throw new Error("Owner is already provisioned; no changes made.");
  if (phone && (await tx.get(store.doc(`ownerPhones/${phone}`))).exists) throw new Error("Phone already linked to another owner.");
  const at = Timestamp.now();
  tx.create(store.doc(`shops/${shopId}`), { name, active: true, language: "hinglish", timezone: "Asia/Kolkata", remindersEnabled: false, policyGate: "NOT_APPROVED", upiVpa: null, createdAt: at });
  tx.create(ref, { shopId, role: "owner", active: true, phoneE164: phone ?? null, waOptedOut: false, createdAt: at });
  if (phone) tx.create(store.doc(`ownerPhones/${phone}`), { uid, shopId, active: true, createdAt: at });
});
console.info("Owner provisioned. Shop ID:", shopId, phone ? "(WhatsApp number linked)" : "(no WhatsApp number linked)");
