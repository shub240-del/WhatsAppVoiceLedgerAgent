import { money } from "./money";

/**
 * A WhatsApp link the owner taps to send a polite payment reminder themselves.
 * Udhaar never messages customers on its own; with no phone saved, WhatsApp lets the owner pick the contact.
 */
export function reminderLink(customer: { name: string; phone?: string | null; balancePaise: number }, shopName?: string) {
  const from = shopName?.trim() ? ` ${shopName.trim()} se` : "";
  const text = `Namaste ${customer.name} ji,${from} yaad dilana tha — aapka ${money(customer.balancePaise)} baaki hai. Suvidha ho to chuka dein. Dhanyavaad!`;
  const digits = customer.phone?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Plain words for a balance after a change: never "owes −₹200". */
export function balanceWords(name: string, balancePaise: number) {
  if (balancePaise > 0) return `${name} now owes ${money(balancePaise)}.`;
  if (balancePaise < 0) return `${name} now has ${money(-balancePaise)} advance.`;
  return `${name} is fully settled.`;
}
