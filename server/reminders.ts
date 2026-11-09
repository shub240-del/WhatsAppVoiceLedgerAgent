import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { reminderPolicy, type TextToSpeech } from "./adapters.js";
import { amountToHinglishWords, formatRupees } from "./money-words.js";

export const SCHEDULE = { weekday: 0, hour: 18, timezone: "Asia/Kolkata" } as const;
const IST_OFFSET_MS = 5.5 * 3600_000;

export function istParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  return { weekday: d.getUTCDay(), hour: d.getUTCHours(), date: d.toISOString().slice(0, 10) };
}
/** Run key (IST date) when the Sunday 18:00 IST window has started, else null. */
export function dueRunKey(ms: number) {
  const p = istParts(ms);
  return p.weekday === SCHEDULE.weekday && p.hour >= SCHEDULE.hour ? p.date : null;
}

export type SkipReason = "zero_balance" | "no_phone" | "no_opt_in" | "opted_out" | "shop_disabled" | "policy_blocked" | "balance_cleared" | "sender_unavailable";
export type Eligibility = { eligible: true } | { eligible: false; reason: SkipReason };
export function eligibility(input: { balancePaise: number; phone: string | null | undefined; consent: string | null | undefined; shopEnabled: boolean; policyEnabled: boolean }): Eligibility {
  if (!(input.balancePaise > 0)) return { eligible: false, reason: "zero_balance" };
  if (!input.phone || !/^\+[1-9]\d{7,14}$/.test(input.phone)) return { eligible: false, reason: "no_phone" };
  if (input.consent === "opted_out") return { eligible: false, reason: "opted_out" };
  if (input.consent !== "opted_in") return { eligible: false, reason: "no_opt_in" };
  if (!input.shopEnabled) return { eligible: false, reason: "shop_disabled" };
  if (!input.policyEnabled) return { eligible: false, reason: "policy_blocked" };
  return { eligible: true };
}

/** upi://pay deep link. Parameter set per common UPI linking usage; confirm against NPCI spec before launch. */
export function buildUpiLink(input: { vpa: string; payeeName: string; amountPaise: number; note: string }) {
  if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(input.vpa)) throw new Error("Invalid UPI VPA.");
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new Error("Invalid amount.");
  const amount = `${Math.floor(input.amountPaise / 100)}.${String(input.amountPaise % 100).padStart(2, "0")}`;
  const params = new URLSearchParams({ pa: input.vpa, pn: input.payeeName.slice(0, 50), am: amount, cu: "INR", tn: input.note.slice(0, 50) });
  return `upi://pay?${params.toString()}`;
}

/** One customer, one message: only that customer's name and amount. Polite, no pressure. */
export function reminderText(customerName: string, balancePaise: number, shopName: string) {
  return `Namaste ${customerName} ji, ${shopName} mein aapka hisaab ${formatRupees(balancePaise)} hai. Suvidha ho to bhugtaan kar dein. Dhanyavaad.`;
}

export type ReminderSender = {
  send(input: { to: string; text: string; upiLink: string | null; audio: Uint8Array | null; amountWords: string }): Promise<{ wamid: string; channel: "template" | "voice" }>;
};
export type ReminderOptions = { policy?: { enabled: boolean; gate: string }; sender?: ReminderSender | null; tts?: TextToSpeech | null };

export async function runReminders(db: Firestore, nowMs: number, options: ReminderOptions = {}) {
  const policy = options.policy ?? reminderPolicy;
  const runKey = dueRunKey(nowMs);
  if (!runKey) return { ran: false as const, runKey: null, shops: 0 };
  const at = Timestamp.fromMillis(nowMs);
  let shops = 0;
  const shopDocs = await db.collection("shops").where("active", "==", true).limit(500).get();
  for (const shop of shopDocs.docs) {
    const jobRef = shop.ref.collection("reminderJobs").doc(runKey);
    const created = await db.runTransaction(async (tx) => {
      if ((await tx.get(jobRef)).exists) return false; // idempotent per shop per Sunday
      tx.create(jobRef, { shopId: shop.id, scheduledFor: runKey, status: "running", policyGateState: policy.gate, createdAt: at });
      return true;
    });
    if (!created) continue;
    shops++;
    const counts: Record<string, number> = {};
    const customers = await shop.ref.collection("customers").where("active", "==", true).limit(2000).get();
    for (const customer of customers.docs) {
      const pref = await shop.ref.collection("reminderPreferences").doc(customer.id).get();
      let result = eligibility({
        balancePaise: customer.get("balancePaise") ?? 0, phone: customer.get("phone"), consent: pref.get("status"),
        shopEnabled: shop.get("remindersEnabled") === true, policyEnabled: policy.enabled,
      });
      let wamid: string | null = null, channel: string | null = null, linkId: string | null = null;
      const balance = (await customer.ref.get()).get("balancePaise") ?? 0; // recompute at send time
      if (result.eligible && !(balance > 0)) result = { eligible: false, reason: "balance_cleared" };
      if (result.eligible && !options.sender) result = { eligible: false, reason: "sender_unavailable" };
      if (result.eligible && options.sender) {
        const vpa = shop.get("upiVpa") as string | undefined;
        const upiLink = vpa ? buildUpiLink({ vpa, payeeName: shop.get("name"), amountPaise: balance, note: `${shop.get("name")} hisaab` }) : null;
        const amountWords = amountToHinglishWords(balance);
        const text = reminderText(customer.get("name"), balance, shop.get("name"));
        const audio = options.tts ? (await options.tts.synthesize(`${text} (${amountWords})`, "hi")).audio : null;
        const sent = await options.sender.send({ to: customer.get("phone"), text, upiLink, audio, amountWords });
        wamid = sent.wamid; channel = sent.channel;
        if (upiLink) {
          const link = shop.ref.collection("paymentLinks").doc(`${runKey}_${customer.id}`);
          await link.set({ shopId: shop.id, customerId: customer.id, amountPaise: balance, upiUri: upiLink, status: "unconfirmed", createdAt: at });
          linkId = link.id;
        }
      }
      const status = result.eligible ? "sent" : "skipped";
      counts[result.eligible ? "sent" : result.reason] = (counts[result.eligible ? "sent" : result.reason] ?? 0) + 1;
      await shop.ref.collection("reminderLogs").doc(`${runKey}_${customer.id}`).set({
        shopId: shop.id, jobId: runKey, customerId: customer.id, status, skipReason: result.eligible ? null : result.reason,
        balanceSnapshotPaise: balance, channel, wamid, paymentLinkId: linkId, createdAt: at,
      });
    }
    await jobRef.update({ status: "completed", counts, completedAt: Timestamp.fromMillis(Date.now()) });
  }
  return { ran: true as const, runKey, shops };
}
