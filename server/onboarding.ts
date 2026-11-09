import { randomUUID } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { documentId, ensure } from "./domain.js";
import { SHOP_LANGUAGES } from "./languages.js";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
const shopInput = z
  .object({
    shopName: z.string().trim().min(2).max(80),
    ownerPhone: phoneSchema.optional(),
    language: z.enum(SHOP_LANGUAGES).optional(),
  })
  .strict();
const phoneInput = z.object({ ownerPhone: phoneSchema.nullable() }).strict();
const shopUpdate = z
  .object({ name: z.string().trim().min(2).max(80).optional(), language: z.enum(SHOP_LANGUAGES).optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.language !== undefined, "Nothing to update.");

/**
 * Self-serve onboarding: a signed-in Google user creates exactly one shop that they own.
 * The tenant is always derived from the verified token UID, never from the request body.
 */
export class OnboardingService {
  constructor(private db: Firestore) {}

  async createShop(uid: string, input: unknown) {
    const data = shopInput.parse(input);
    const ownerRef = this.db.doc(`owners/${documentId.parse(uid)}`);
    return this.db.runTransaction(async (tx) => {
      const owner = await tx.get(ownerRef);
      if (owner.exists) {
        // Retry-safe: a repeated request returns the shop that already exists.
        ensure(owner.get("active") === true, 403, "OWNER_INACTIVE", "This owner account is disabled.");
        return { shopId: owner.get("shopId") as string, created: false };
      }
      const phoneRef = data.ownerPhone ? this.db.doc(`ownerPhones/${data.ownerPhone}`) : null;
      if (phoneRef) {
        ensure(
          !(await tx.get(phoneRef)).exists,
          409,
          "PHONE_IN_USE",
          "This WhatsApp number is already linked to another shop.",
        );
      }
      const shopId = randomUUID();
      const at = Timestamp.now();
      tx.create(this.db.doc(`shops/${shopId}`), {
        name: data.shopName,
        active: true,
        language: data.language ?? "hinglish",
        timezone: "Asia/Kolkata",
        remindersEnabled: false,
        policyGate: "NOT_APPROVED",
        upiVpa: null,
        createdAt: at,
      });
      tx.create(ownerRef, {
        shopId,
        role: "owner",
        active: true,
        phoneE164: data.ownerPhone ?? null,
        waOptedOut: false,
        createdAt: at,
        source: "self_serve",
      });
      if (phoneRef) tx.create(phoneRef, { uid, shopId, active: true, createdAt: at });
      tx.create(this.db.doc(`shops/${shopId}/auditLogs/${randomUUID()}`), {
        shopId,
        action: "create_shop",
        actorId: uid,
        targetId: shopId,
        createdAt: at,
      });
      return { shopId, created: true };
    });
  }

  /** Links, changes or removes the owner's WhatsApp number used to route voice notes to the shop. */
  async setOwnerPhone(uid: string, input: unknown) {
    const { ownerPhone } = phoneInput.parse(input);
    const ownerRef = this.db.doc(`owners/${documentId.parse(uid)}`);
    return this.db.runTransaction(async (tx) => {
      const owner = await tx.get(ownerRef);
      ensure(
        owner.exists && owner.get("active") === true && owner.get("role") === "owner",
        403,
        "OWNER_REQUIRED",
        "Create your shop first.",
      );
      const shopId = owner.get("shopId") as string;
      const previous = (owner.get("phoneE164") as string | null) ?? null;
      if (previous === ownerPhone) return { ownerPhone };
      const nextRef = ownerPhone ? this.db.doc(`ownerPhones/${ownerPhone}`) : null;
      if (nextRef) {
        ensure(
          !(await tx.get(nextRef)).exists,
          409,
          "PHONE_IN_USE",
          "This WhatsApp number is already linked to another shop.",
        );
      }
      const at = Timestamp.now();
      if (previous) tx.delete(this.db.doc(`ownerPhones/${previous}`));
      if (nextRef) tx.create(nextRef, { uid, shopId, active: true, createdAt: at });
      tx.update(ownerRef, { phoneE164: ownerPhone, phoneChangedAt: at });
      tx.create(this.db.doc(`shops/${shopId}/auditLogs/${randomUUID()}`), {
        shopId,
        action: "set_owner_phone",
        actorId: uid,
        targetId: uid,
        createdAt: at,
      });
      return { ownerPhone };
    });
  }

  /** Owner-only shop settings: name and language (drives speech-to-text language hints). */
  async updateShop(uid: string, input: unknown) {
    const data = shopUpdate.parse(input);
    const owner = await this.db.doc(`owners/${documentId.parse(uid)}`).get();
    ensure(owner.exists && owner.get("active") === true && owner.get("role") === "owner", 403, "OWNER_REQUIRED", "Create your shop first.");
    const shopId = owner.get("shopId") as string;
    const at = Timestamp.now();
    await this.db.doc(`shops/${shopId}`).update({ ...data, updatedAt: at });
    await this.db.doc(`shops/${shopId}/auditLogs/${randomUUID()}`).create({
      shopId, action: "update_shop", actorId: uid, targetId: shopId, after: data, createdAt: at,
    });
    return { shopId, ...data };
  }

  async ownerPhone(uid: string) {
    const owner = await this.db.doc(`owners/${documentId.parse(uid)}`).get();
    return { ownerPhone: owner.exists ? ((owner.get("phoneE164") as string | null) ?? null) : null };
  }
}
